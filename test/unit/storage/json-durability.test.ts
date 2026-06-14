import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSONStorage } from '../../../storage/json-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Durability/atomicity guarantees specific to the JSON backend:
 * - mutations are serialized so concurrent read-modify-write cannot lose data
 * - saveGraph replaces the file atomically (temp + fsync + rename), so reads
 *   never observe a partially written file and no temp files are left behind
 * - loadGraph reports the offending line when the file is corrupt
 */
describe('JSONStorage durability', () => {
  let testDir: string;
  let filePath: string;
  let storage: JSONStorage;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-json-durability-'));
    filePath = path.join(testDir, 'memory.jsonl');
    storage = new JSONStorage({ type: 'json', filePath });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('serializes concurrent createEntities without losing writes', async () => {
    const count = 50;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        storage.createEntities([{ name: `E${i}`, entityType: 'T', observations: [] }])
      )
    );

    const graph = await storage.loadGraph();
    expect(graph.entities).toHaveLength(count);
    expect(new Set(graph.entities.map(e => e.name)).size).toBe(count);
  });

  it('serializes concurrent addObservations to the same entity', async () => {
    await storage.createEntities([{ name: 'Hub', entityType: 'T', observations: [] }]);

    const count = 40;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        storage.addObservations([{ entityName: 'Hub', contents: [`obs-${i}`] }])
      )
    );

    const [entity] = await storage.getEntities(['Hub']);
    expect(entity.observations).toHaveLength(count);
  });

  it('leaves no temp files behind after writes', async () => {
    await storage.createEntities([{ name: 'A', entityType: 'T', observations: ['x'] }]);
    await storage.createEntities([{ name: 'B', entityType: 'T', observations: ['y'] }]);

    const files = await fs.readdir(testDir);
    expect(files).toEqual(['memory.jsonl']);
  });

  it('never exposes a partially written file to concurrent readers', async () => {
    await storage.createEntities([{ name: 'Seed', entityType: 'T', observations: [] }]);

    const write = storage.createEntities(
      Array.from({ length: 200 }, (_, i) => ({
        name: `N${i}`,
        entityType: 'T',
        observations: ['z'],
      }))
    );

    // Interleave reads with the in-flight write; an atomic replace means each
    // read returns either the old or new complete graph, never throws on a
    // half-written file.
    for (let i = 0; i < 20; i++) {
      const graph = await storage.loadGraph();
      expect(Array.isArray(graph.entities)).toBe(true);
    }

    await write;
    expect((await storage.loadGraph()).entities).toHaveLength(201);
  });

  it('reports the offending line number when the file is corrupt', async () => {
    const good = JSON.stringify({
      type: 'entity',
      name: 'A',
      entityType: 'T',
      observations: [],
    });
    await fs.writeFile(filePath, `${good}\n{ this is not valid json`);

    await expect(storage.loadGraph()).rejects.toThrow(/line 2/);
  });
});
