import { describe, beforeAll, afterAll, test } from 'vitest';
import { BenchmarkRunner } from '../infrastructure/benchmark-runner.js';
import { DatasetGenerator } from '../infrastructure/dataset-generator.js';
import { ReportGenerator } from '../infrastructure/report-generator.js';
import { IStorageBackend } from '../../../storage/interface.js';
import { JSONStorage } from '../../../storage/json-storage.js';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Core Operations Benchmarks', () => {
  const runner = new BenchmarkRunner({
    warmupIterations: 5,
    iterations: 50,
    forceGc: true,
  });

  const reporter = new ReportGenerator();
  const generator = new DatasetGenerator(42); // Fixed seed for reproducibility

  let testDir: string;
  let jsonStorage: IStorageBackend;
  let sqliteStorage: IStorageBackend;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-core-bench-'));
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Test different dataset sizes to validate README claims
  const DATASET_SIZES = [100, 1000, 10000];

  for (const size of DATASET_SIZES) {
    describe(`Dataset Size: ${size.toLocaleString()} entities`, () => {
      const { entities, relations } = generator.generateDataset({
        entityCount: size,
        relationMultiplier: 2,
        observationsPerEntity: 3,
      });

      // Entity Creation Benchmark (README claim: 250x faster)
      describe('Entity Creation', () => {
        test('JSON vs SQLite - Individual Creation', async () => {
          const results = await runner.runComparison(
            `Entity Creation (${size} entities)`,
            {
              'JSON': async () => {
                const storage = new JSONStorage(path.join(testDir, `json-${Date.now()}.jsonl`));
                await storage.initialize();
                
                for (const entity of entities) {
                  await storage.createEntities([entity]);
                }
                
                await storage.close();
              },
              'SQLite': async () => {
                const storage = new SQLiteStorage(path.join(testDir, `sqlite-${Date.now()}.db`));
                await storage.initialize();
                
                for (const entity of entities) {
                  await storage.createEntities([entity]);
                }
                
                await storage.close();
              },
            },
            { iterations: size < 10000 ? 10 : 5 } // Fewer iterations for large datasets
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          // Calculate speedup
          const jsonTime = results['JSON'].stats.mean;
          const sqliteTime = results['SQLite'].stats.mean;
          const speedup = jsonTime / sqliteTime;

          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for individual entity creation\n`);
        });

        test('JSON vs SQLite - Batch Creation', async () => {
          const results = await runner.runComparison(
            `Batch Entity Creation (${size} entities)`,
            {
              'JSON': async () => {
                const storage = new JSONStorage(path.join(testDir, `json-batch-${Date.now()}.jsonl`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.close();
              },
              'SQLite': async () => {
                const storage = new SQLiteStorage(path.join(testDir, `sqlite-batch-${Date.now()}.db`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.close();
              },
            },
            { iterations: 20 }
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;
          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for batch entity creation\n`);
        });
      });

      // Search Performance Benchmark (README claim: 15x faster)
      describe('Search Performance', () => {
        beforeAll(async () => {
          // Pre-populate storage for search tests
          jsonStorage = new JSONStorage(path.join(testDir, `json-search-${size}.jsonl`));
          sqliteStorage = new SQLiteStorage(path.join(testDir, `sqlite-search-${size}.db`));
          
          await jsonStorage.initialize();
          await sqliteStorage.initialize();
          
          await jsonStorage.createEntities(entities);
          await jsonStorage.createRelations(relations);
          
          await sqliteStorage.createEntities(entities);
          await sqliteStorage.createRelations(relations);
        });

        afterAll(async () => {
          await jsonStorage.close();
          await sqliteStorage.close();
        });

        test('JSON vs SQLite - Search Operations', async () => {
          const searchQueries = generator.generateSearchQueries(entities, 20);
          
          const results = await runner.runComparison(
            `Search Performance (${size} entities)`,
            {
              'JSON': async () => {
                for (const query of searchQueries) {
                  await jsonStorage.searchEntities(query);
                }
              },
              'SQLite': async () => {
                for (const query of searchQueries) {
                  await sqliteStorage.searchEntities(query);
                }
              },
            },
            { iterations: 30 }
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;
          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for search operations\n`);
        });

        test('JSON vs SQLite - Full Graph Read', async () => {
          const results = await runner.runComparison(
            `Full Graph Read (${size} entities)`,
            {
              'JSON': async () => {
                await jsonStorage.loadGraph();
              },
              'SQLite': async () => {
                await sqliteStorage.loadGraph();
              },
            },
            { iterations: 20 }
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;
          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for full graph reads\n`);
        });
      });

      // Relation Operations
      describe('Relation Operations', () => {
        test('JSON vs SQLite - Relation Creation', async () => {
          const results = await runner.runComparison(
            `Relation Creation (${relations.length} relations)`,
            {
              'JSON': async () => {
                const storage = new JSONStorage(path.join(testDir, `json-rel-${Date.now()}.jsonl`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.createRelations(relations);
                await storage.close();
              },
              'SQLite': async () => {
                const storage = new SQLiteStorage(path.join(testDir, `sqlite-rel-${Date.now()}.db`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.createRelations(relations);
                await storage.close();
              },
            },
            { iterations: 10 }
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;
          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for relation creation\n`);
        });
      });

      // Delete Operations
      describe('Delete Operations', () => {
        test('JSON vs SQLite - Entity Deletion', async () => {
          const deleteCount = Math.floor(size * 0.1); // Delete 10% of entities
          const entitiesToDelete = entities.slice(0, deleteCount).map(e => e.name);

          const results = await runner.runComparison(
            `Entity Deletion (${deleteCount} entities)`,
            {
              'JSON': async () => {
                const storage = new JSONStorage(path.join(testDir, `json-del-${Date.now()}.jsonl`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.deleteEntities(entitiesToDelete);
                await storage.close();
              },
              'SQLite': async () => {
                const storage = new SQLiteStorage(path.join(testDir, `sqlite-del-${Date.now()}.db`));
                await storage.initialize();
                await storage.createEntities(entities);
                await storage.deleteEntities(entitiesToDelete);
                await storage.close();
              },
            },
            { iterations: 10 }
          );

          const report = await reporter.generateReport(Object.values(results), 'console');
          console.log(report);

          const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;
          console.log(`\n📈 SQLite is ${speedup.toFixed(1)}x faster for entity deletion\n`);
        });
      });
    });
  }
});