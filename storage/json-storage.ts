import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Entity, Relation, KnowledgeGraph } from '../types.js';
import { IStorageBackend, IStorageConfig } from './interface.js';

/**
 * JSON Lines storage backend - maintains compatibility with the original implementation.
 */
export class JSONStorage implements IStorageBackend {
  private filePath: string;

  /**
   * Serializes mutating operations. Each mutation is a read-modify-write over
   * the whole file, so concurrent mutations must not interleave or they would
   * silently overwrite each other's changes. Every public mutator runs inside
   * this queue; reads are safe to run concurrently because saveGraph() replaces
   * the file atomically (see saveGraph).
   */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(config: IStorageConfig) {
    // Use provided file path or default
    const defaultPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'memory.json'
    );

    this.filePath = config.filePath || defaultPath;

    // Handle relative paths
    if (!path.isAbsolute(this.filePath)) {
      this.filePath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        this.filePath
      );
    }
  }

  /**
   * Run a mutating task serialized behind any in-flight mutation. The chain is
   * kept alive across rejections so one failed mutation does not wedge the queue.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(task, task);
    this.writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async initialize(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    let data: string;
    try {
      data = await fs.readFile(this.filePath, "utf-8");
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as { code?: string }).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }

    const graph: KnowledgeGraph = { entities: [], relations: [] };
    const lines = data.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;

      let item: { type?: string; [key: string]: unknown };
      try {
        item = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Failed to parse ${this.filePath} at line ${i + 1}: ${(error as Error).message}`
        );
      }

      if (item.type === "entity") {
        const { type: _type, ...entity } = item;
        graph.entities.push(entity as unknown as Entity);
      } else if (item.type === "relation") {
        const { type: _type, ...relation } = item;
        graph.relations.push(relation as unknown as Relation);
      }
    }
    return graph;
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const lines = [
      ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
      ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
    ];
    const data = lines.join("\n");

    // Write to a temp file, flush it to disk, then atomically rename over the
    // target. A crash at any point leaves either the previous complete file or
    // the new complete file - never a half-written/corrupt one.
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;
    const handle = await fs.open(tmpPath, "w");
    try {
      await handle.writeFile(data, "utf-8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      // Best-effort cleanup of the temp file if the rename failed.
      await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      const newEntities = entities.filter(
        e => !graph.entities.some(existingEntity => existingEntity.name === e.name)
      );
      graph.entities.push(...newEntities);
      await this.saveGraph(graph);
      return newEntities;
    });
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      const newRelations = relations.filter(
        r => !graph.relations.some(existingRelation =>
          existingRelation.from === r.from &&
          existingRelation.to === r.to &&
          existingRelation.relationType === r.relationType
        )
      );
      graph.relations.push(...newRelations);
      await this.saveGraph(graph);
      return newRelations;
    });
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      const results = observations.map(o => {
        const entity = graph.entities.find(e => e.name === o.entityName);
        if (!entity) {
          throw new Error(`Entity with name ${o.entityName} not found`);
        }
        const newObservations = o.contents.filter(
          content => !entity.observations.includes(content)
        );
        entity.observations.push(...newObservations);
        return { entityName: o.entityName, addedObservations: newObservations };
      });
      await this.saveGraph(graph);
      return results;
    });
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
      graph.relations = graph.relations.filter(
        r => !entityNames.includes(r.from) && !entityNames.includes(r.to)
      );
      await this.saveGraph(graph);
    });
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      deletions.forEach(d => {
        const entity = graph.entities.find(e => e.name === d.entityName);
        if (entity) {
          entity.observations = entity.observations.filter(
            o => !d.observations.includes(o)
          );
        }
      });
      await this.saveGraph(graph);
    });
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    return this.enqueue(async () => {
      const graph = await this.loadGraph();
      graph.relations = graph.relations.filter(
        r => !relations.some(delRelation =>
          r.from === delRelation.from &&
          r.to === delRelation.to &&
          r.relationType === delRelation.relationType
        )
      );
      await this.saveGraph(graph);
    });
  }

  async searchEntities(query: string): Promise<Entity[]> {
    const graph = await this.loadGraph();
    const lowerQuery = query.toLowerCase();
    return graph.entities.filter(e =>
      e.name.toLowerCase().includes(lowerQuery) ||
      e.entityType.toLowerCase().includes(lowerQuery) ||
      e.observations.some(o => o.toLowerCase().includes(lowerQuery))
    );
  }

  async getEntities(names: string[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    return graph.entities.filter(e => names.includes(e.name));
  }

  async getRelations(entityNames: string[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    if (entityNames.length === 0) {
      return graph.relations;
    }
    const nameSet = new Set(entityNames);
    return graph.relations.filter(
      r => nameSet.has(r.from) || nameSet.has(r.to)
    );
  }

  async close(): Promise<void> {
    // No cleanup needed for JSON storage
  }

  async getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    observationCount: number;
    storageSize?: number;
  }> {
    const graph = await this.loadGraph();
    const observationCount = graph.entities.reduce(
      (count, entity) => count + entity.observations.length,
      0
    );

    let storageSize: number | undefined;
    try {
      const stats = await fs.stat(this.filePath);
      storageSize = stats.size;
    } catch {
      // File might not exist yet
    }

    return {
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      observationCount,
      storageSize
    };
  }
}
