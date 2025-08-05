import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { Entity, Relation, KnowledgeGraph } from '../types.js';
import { IStorageBackend, IStorageConfig } from './interface.js';
import { SQLiteConnectionPool } from './connection-pool.js';
import { QueryCache } from './cache.js';

interface EntityRow {
  id: number;
  name: string;
  entity_type: string;
  observations?: string;
}

interface RelationRow {
  from_name: string;
  to_name: string;
  relation_type: string;
}

interface StatsRow {
  size: number;
}

/**
 * Optimized SQLite storage backend with connection pooling and caching.
 */
export class OptimizedSQLiteStorage implements IStorageBackend {
  private pool: SQLiteConnectionPool;
  private cache: QueryCache;
  private filePath: string;
  private statements: Map<string, Database.Statement> = new Map();

  constructor(config: IStorageConfig) {
    // Use provided file path or default
    const defaultPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)), 
      '..', 
      'memory.db'
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

    // Initialize connection pool
    this.pool = new SQLiteConnectionPool({
      filePath: this.filePath,
      maxConnections: config.maxConnections || 5,
      idleTimeout: config.idleTimeout || 60000
    });

    // Initialize cache
    this.cache = new QueryCache();
  }

  async initialize(): Promise<void> {
    const db = await this.pool.getConnection();
    try {
      // Enable optimizations
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('synchronous = NORMAL');
      db.pragma('temp_store = MEMORY');
      db.pragma('mmap_size = 30000000000'); // 30GB mmap
      
      // Create tables if they don't exist
      db.exec(`
        -- Entities table
        CREATE TABLE IF NOT EXISTS entities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          entity_type TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Create indexes for faster lookups
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
        CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(entity_type, name);

        -- Observations table
        CREATE TABLE IF NOT EXISTS observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id INTEGER NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
        );

        -- Create index for faster entity lookups
        CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
        CREATE INDEX IF NOT EXISTS idx_observations_content ON observations(content);

        -- Relations table
        CREATE TABLE IF NOT EXISTS relations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_entity_id INTEGER NOT NULL,
          to_entity_id INTEGER NOT NULL,
          relation_type TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
          FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
          UNIQUE(from_entity_id, to_entity_id, relation_type)
        );

        -- Create indexes for faster relation lookups
        CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
        CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
        CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
        CREATE INDEX IF NOT EXISTS idx_relations_composite ON relations(from_entity_id, to_entity_id, relation_type);

        -- Create triggers for updated_at
        CREATE TRIGGER IF NOT EXISTS update_entity_timestamp 
        AFTER UPDATE ON entities
        BEGIN
          UPDATE entities SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
        END;

        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
          name, entity_type, content='entities', content_rowid='id'
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
          content, content='observations', content_rowid='id'
        );

        -- Triggers to keep FTS tables in sync
        CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
          INSERT INTO entities_fts(rowid, name, entity_type) VALUES (new.id, new.name, new.entity_type);
        END;

        CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
          DELETE FROM entities_fts WHERE rowid = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
          INSERT INTO observations_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
          DELETE FROM observations_fts WHERE rowid = old.id;
        END;
      `);

      // Prepare commonly used statements
      this.prepareStatements(db);
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  private prepareStatements(db: Database.Database): void {
    this.statements.set('getEntity', db.prepare(
      'SELECT * FROM entities WHERE name = ?'
    ));

    this.statements.set('getEntityWithObs', db.prepare(`
      SELECT e.*, GROUP_CONCAT(o.content, '|||') as observations
      FROM entities e
      LEFT JOIN observations o ON e.id = o.entity_id
      WHERE e.name = ?
      GROUP BY e.id
    `));

    this.statements.set('insertEntity', db.prepare(
      'INSERT INTO entities (name, entity_type) VALUES (?, ?)'
    ));

    this.statements.set('insertObservation', db.prepare(
      'INSERT INTO observations (entity_id, content) VALUES (?, ?)'
    ));

    this.statements.set('searchEntities', db.prepare(`
      SELECT DISTINCT e.* 
      FROM entities e
      LEFT JOIN entities_fts ef ON e.id = ef.rowid
      LEFT JOIN observations o ON e.id = o.entity_id
      LEFT JOIN observations_fts of ON o.id = of.rowid
      WHERE ef.name MATCH ? 
         OR ef.entity_type MATCH ?
         OR of.content MATCH ?
      LIMIT 100
    `));
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const db = await this.pool.getConnection();
    try {
      const created: Entity[] = [];
      const insertEntity = db.prepare(
        'INSERT OR IGNORE INTO entities (name, entity_type) VALUES (?, ?)'
      );
      const insertObservation = db.prepare(
        'INSERT INTO observations (entity_id, content) VALUES (?, ?)'
      );

      const transaction = db.transaction(() => {
        for (const entity of entities) {
          const result = insertEntity.run(entity.name, entity.entityType);
          
          if (result.changes > 0) {
            const entityId = result.lastInsertRowid as number;
            
            // Insert observations
            for (const observation of entity.observations) {
              insertObservation.run(entityId, observation);
            }
            
            created.push(entity);
            this.cache.invalidateEntity(entity.name);
          }
        }
      });

      transaction();
      return created;
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const db = await this.pool.getConnection();
    try {
      const created: Relation[] = [];
      const insertRelation = db.prepare(`
        INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type)
        SELECT e1.id, e2.id, ?
        FROM entities e1, entities e2
        WHERE e1.name = ? AND e2.name = ?
      `);

      const transaction = db.transaction(() => {
        for (const relation of relations) {
          const result = insertRelation.run(
            relation.relationType,
            relation.from,
            relation.to
          );
          
          if (result.changes > 0) {
            created.push(relation);
          }
        }
      });

      transaction();
      
      // Clear cache
      this.cache.clear();
      
      return created;
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async addObservations(
    observations: { entityName: string; contents: string[] }[]
  ): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const db = await this.pool.getConnection();
    try {
      const results: { entityName: string; addedObservations: string[] }[] = [];
      const getEntity = db.prepare('SELECT id FROM entities WHERE name = ?');
      const insertObservation = db.prepare(
        'INSERT INTO observations (entity_id, content) VALUES (?, ?)'
      );
      const checkObservation = db.prepare(
        'SELECT 1 FROM observations WHERE entity_id = ? AND content = ?'
      );

      const transaction = db.transaction(() => {
        for (const { entityName, contents } of observations) {
          const entity = getEntity.get(entityName) as { id: number } | undefined;
          
          if (!entity) continue;
          
          const addedObservations: string[] = [];
          
          for (const content of contents) {
            const exists = checkObservation.get(entity.id, content);
            
            if (!exists) {
              insertObservation.run(entity.id, content);
              addedObservations.push(content);
            }
          }
          
          if (addedObservations.length > 0) {
            results.push({ entityName, addedObservations });
            this.cache.invalidateEntity(entityName);
          }
        }
      });

      transaction();
      return results;
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const db = await this.pool.getConnection();
    try {
      const deleteEntity = db.prepare('DELETE FROM entities WHERE name = ?');
      
      const transaction = db.transaction(() => {
        for (const name of entityNames) {
          deleteEntity.run(name);
          this.cache.invalidateEntity(name);
        }
      });

      transaction();
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async deleteObservations(
    deletions: { entityName: string; observations: string[] }[]
  ): Promise<void> {
    const db = await this.pool.getConnection();
    try {
      const getEntity = db.prepare('SELECT id FROM entities WHERE name = ?');
      const deleteObservation = db.prepare(
        'DELETE FROM observations WHERE entity_id = ? AND content = ?'
      );

      const transaction = db.transaction(() => {
        for (const { entityName, observations } of deletions) {
          const entity = getEntity.get(entityName) as { id: number } | undefined;
          
          if (!entity) continue;
          
          for (const observation of observations) {
            deleteObservation.run(entity.id, observation);
          }
          
          this.cache.invalidateEntity(entityName);
        }
      });

      transaction();
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const db = await this.pool.getConnection();
    try {
      const deleteRelation = db.prepare(`
        DELETE FROM relations 
        WHERE from_entity_id = (SELECT id FROM entities WHERE name = ?)
          AND to_entity_id = (SELECT id FROM entities WHERE name = ?)
          AND relation_type = ?
      `);

      const transaction = db.transaction(() => {
        for (const relation of relations) {
          deleteRelation.run(relation.from, relation.to, relation.relationType);
        }
      });

      transaction();
      this.cache.clear();
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async getEntities(names: string[]): Promise<Entity[]> {
    if (names.length === 0) return [];

    const db = await this.pool.getConnection();
    try {
      const placeholders = names.map(() => '?').join(',');
      const query = db.prepare(`
        SELECT e.id, e.name, e.entity_type
        FROM entities e
        WHERE e.name IN (${placeholders})
      `);

      const entityRows = query.all(...names) as EntityRow[];
      const entities: Entity[] = [];

      for (const row of entityRows) {
        const observations = db.prepare(
          'SELECT content FROM observations WHERE entity_id = ?'
        ).all(row.id) as { content: string }[];

        entities.push({
          name: row.name,
          entityType: row.entity_type,
          observations: observations.map(o => o.content)
        });
      }

      return entities;
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async getRelations(entityNames: string[]): Promise<Relation[]> {
    const db = await this.pool.getConnection();
    try {
      let query: string;
      let params: string[] = [];

      if (entityNames.length === 0) {
        // Get all relations
        query = `
          SELECT 
            ef.name as from_name,
            et.name as to_name,
            r.relation_type
          FROM relations r
          JOIN entities ef ON r.from_entity_id = ef.id
          JOIN entities et ON r.to_entity_id = et.id
        `;
      } else {
        // Get relations involving specific entities
        const placeholders = entityNames.map(() => '?').join(',');
        query = `
          SELECT 
            ef.name as from_name,
            et.name as to_name,
            r.relation_type
          FROM relations r
          JOIN entities ef ON r.from_entity_id = ef.id
          JOIN entities et ON r.to_entity_id = et.id
          WHERE ef.name IN (${placeholders}) OR et.name IN (${placeholders})
        `;
        params = [...entityNames, ...entityNames];
      }

      const rows = db.prepare(query).all(...params) as RelationRow[];

      return rows.map(row => ({
        from: row.from_name,
        to: row.to_name,
        relationType: row.relation_type
      }));
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async getStats(): Promise<{
    entityCount: number;
    relationCount: number;
    observationCount: number;
    storageSize?: number;
  }> {
    const db = await this.pool.getConnection();
    try {
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get() as { count: number };
      const relationCount = db.prepare('SELECT COUNT(*) as count FROM relations').get() as { count: number };
      const observationCount = db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number };
      const storageSize = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number };

      return {
        entityCount: entityCount.count,
        relationCount: relationCount.count,
        observationCount: observationCount.count,
        storageSize: storageSize.size
      };
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async saveGraph(graph: KnowledgeGraph): Promise<void> {
    const db = await this.pool.getConnection();
    
    try {
      // Use transaction for atomic updates
      const transaction = db.transaction(() => {
        // Clear existing data
        db.prepare('DELETE FROM relations').run();
        db.prepare('DELETE FROM observations').run();
        db.prepare('DELETE FROM entities').run();

        // Batch insert entities
        const insertEntity = db.prepare(
          'INSERT INTO entities (name, entity_type) VALUES (?, ?)'
        );
        const insertObservation = db.prepare(
          'INSERT INTO observations (entity_id, content) VALUES (?, ?)'
        );

        const entityIdMap = new Map<string, number>();

        // Insert entities and observations
        for (const entity of graph.entities) {
          const result = insertEntity.run(entity.name, entity.entityType);
          const entityId = result.lastInsertRowid as number;
          entityIdMap.set(entity.name, entityId);

          // Batch insert observations
          for (const observation of entity.observations) {
            insertObservation.run(entityId, observation);
          }
        }

        // Batch insert relations
        const insertRelation = db.prepare(
          'INSERT INTO relations (from_entity_id, to_entity_id, relation_type) VALUES (?, ?, ?)'
        );

        for (const relation of graph.relations) {
          const fromId = entityIdMap.get(relation.from);
          const toId = entityIdMap.get(relation.to);
          
          if (fromId && toId) {
            insertRelation.run(fromId, toId, relation.relationType);
          }
        }
      });

      transaction();
      
      // Clear cache after save
      this.cache.clear();
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    // Check cache first
    const cacheKey = 'full_graph';
    const cachedEntities = this.cache.getCachedEntities(cacheKey);
    const cachedRelations = this.cache.getCachedRelations(cacheKey);
    
    if (cachedEntities && cachedRelations) {
      return { entities: cachedEntities, relations: cachedRelations };
    }

    const db = await this.pool.getConnection();
    
    try {
      // Load entities with observations
      const entities: Entity[] = db.prepare(`
        SELECT e.id, e.name, e.entity_type, GROUP_CONCAT(o.content, '|||') as observations
        FROM entities e
        LEFT JOIN observations o ON e.id = o.entity_id
        GROUP BY e.id
      `).all().map((row: any) => ({
        name: row.name,
        entityType: row.entity_type,
        observations: row.observations ? row.observations.split('|||') : []
      }));

      // Load relations
      const relations: Relation[] = db.prepare(`
        SELECT 
          ef.name as from_name,
          et.name as to_name,
          r.relation_type
        FROM relations r
        JOIN entities ef ON r.from_entity_id = ef.id
        JOIN entities et ON r.to_entity_id = et.id
      `).all().map((row: any) => ({
        from: row.from_name,
        to: row.to_name,
        relationType: row.relation_type
      }));

      // Cache the results
      this.cache.cacheEntities(cacheKey, entities);
      this.cache.cacheRelations(cacheKey, relations);

      return { entities, relations };
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async searchEntities(query: string): Promise<Entity[]> {
    // Check cache
    const cached = this.cache.getCachedEntities(`search:${query}`);
    if (cached) return cached;

    const db = await this.pool.getConnection();
    
    try {
      const searchPattern = `"${query}"* OR ${query}*`;
      
      const results = db.prepare(`
        SELECT DISTINCT e.id, e.name, e.entity_type
        FROM entities e
        LEFT JOIN entities_fts ef ON e.id = ef.rowid
        LEFT JOIN observations o ON e.id = o.entity_id
        LEFT JOIN observations_fts of ON o.id = of.rowid
        WHERE ef.name MATCH ?
           OR ef.entity_type MATCH ?
           OR of.content MATCH ?
        LIMIT 100
      `).all(searchPattern, searchPattern, searchPattern) as EntityRow[];

      // Load observations for found entities
      const entities: Entity[] = results.map(row => {
        const observations = db.prepare(
          'SELECT content FROM observations WHERE entity_id = ?'
        ).all(row.id) as { content: string }[];

        return {
          name: row.name,
          entityType: row.entity_type,
          observations: observations.map(obs => obs.content)
        };
      });

      // Cache results
      this.cache.cacheEntities(`search:${query}`, entities);
      
      return entities;
    } finally {
      this.pool.releaseConnection(db);
    }
  }

  async close(): Promise<void> {
    await this.pool.close();
    this.statements.clear();
  }

  async getStorageInfo(): Promise<{
    type: string;
    file: string;
    sizeBytes: number;
    cache: any;
  }> {
    const db = await this.pool.getConnection();
    
    try {
      const stats = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as StatsRow;
      
      return {
        type: 'optimized-sqlite',
        file: this.filePath,
        sizeBytes: stats.size,
        cache: this.cache.stats
      };
    } finally {
      this.pool.releaseConnection(db);
    }
  }
}