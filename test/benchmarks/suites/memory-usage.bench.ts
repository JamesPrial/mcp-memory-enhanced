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

describe('Memory Usage Benchmarks', () => {
  const runner = new BenchmarkRunner({
    warmupIterations: 2,
    iterations: 10,
    forceGc: true,
    collectMemory: true,
  });

  const _reporter = new ReportGenerator();
  const generator = new DatasetGenerator(42);

  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-memory-bench-'));
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // Test memory usage with increasing dataset sizes (README claim: 79% less memory)
  const DATASET_SIZES = [1000, 5000, 10000, 20000];

  describe('Memory Usage Comparison', () => {
    for (const size of DATASET_SIZES) {
      test(`Memory Usage - ${size.toLocaleString()} entities`, async () => {
        const { entities, relations } = generator.generateDataset({
          entityCount: size,
          relationMultiplier: 2,
          observationsPerEntity: 3,
        });

        console.log(`\n🧪 Testing memory usage with ${size} entities and ${relations.length} relations\n`);

        // JSON Memory Usage
        const jsonResult = await runner.run(
          `JSON Memory - ${size} entities`,
          async () => {
            const storage = new JSONStorage(path.join(testDir, `json-mem-${size}.jsonl`));
            await storage.initialize();
            await storage.createEntities(entities);
            await storage.createRelations(relations);
            
            // Keep storage in memory to measure usage
            const graph = await storage.loadGraph();
            
            // Force GC before measurement
            if (global.gc) global.gc();
            
            await storage.close();
            return graph;
          },
          { iterations: 5 }
        );

        // SQLite Memory Usage
        const sqliteResult = await runner.run(
          `SQLite Memory - ${size} entities`,
          async () => {
            const storage = new SQLiteStorage(path.join(testDir, `sqlite-mem-${size}.db`));
            await storage.initialize();
            await storage.createEntities(entities);
            await storage.createRelations(relations);
            
            // Keep storage in memory to measure usage
            const graph = await storage.loadGraph();
            
            // Force GC before measurement
            if (global.gc) global.gc();
            
            await storage.close();
            return graph;
          },
          { iterations: 5 }
        );

        // Compare memory usage
        const jsonMem = jsonResult.memory!;
        const sqliteMem = sqliteResult.memory!;

        const heapReduction = ((jsonMem.heapUsed.mean - sqliteMem.heapUsed.mean) / jsonMem.heapUsed.mean) * 100;
        const rssReduction = ((jsonMem.rss.mean - sqliteMem.rss.mean) / jsonMem.rss.mean) * 100;

        console.log('📊 Memory Usage Comparison:');
        console.log('─'.repeat(50));
        console.log(`JSON Backend:`);
        console.log(`  Heap: ${(jsonMem.heapUsed.mean / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  RSS:  ${(jsonMem.rss.mean / 1024 / 1024).toFixed(2)} MB`);
        console.log(`SQLite Backend:`);
        console.log(`  Heap: ${(sqliteMem.heapUsed.mean / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  RSS:  ${(sqliteMem.rss.mean / 1024 / 1024).toFixed(2)} MB`);
        console.log(`\n✨ Memory Reduction:`);
        console.log(`  Heap: ${heapReduction.toFixed(1)}% less memory`);
        console.log(`  RSS:  ${rssReduction.toFixed(1)}% less memory\n`);

        // Also measure file sizes for storage efficiency
        const jsonPath = path.join(testDir, `json-size-test-${size}.jsonl`);
        const sqlitePath = path.join(testDir, `sqlite-size-test-${size}.db`);

        // Create files with data
        const jsonStorage = new JSONStorage(jsonPath);
        const sqliteStorage = new SQLiteStorage(sqlitePath);

        await jsonStorage.initialize();
        await jsonStorage.createEntities(entities);
        await jsonStorage.createRelations(relations);
        await jsonStorage.close();

        await sqliteStorage.initialize();
        await sqliteStorage.createEntities(entities);
        await sqliteStorage.createRelations(relations);
        await sqliteStorage.close();

        // Measure file sizes
        const jsonStats = await fs.stat(jsonPath);
        const sqliteStats = await fs.stat(sqlitePath);

        const sizeReduction = ((jsonStats.size - sqliteStats.size) / jsonStats.size) * 100;

        console.log('💾 Storage Size Comparison:');
        console.log('─'.repeat(50));
        console.log(`JSON:   ${(jsonStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`SQLite: ${(sqliteStats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Storage Reduction: ${sizeReduction.toFixed(1)}%\n`);
      });
    }
  });

  describe('Memory Growth Analysis', () => {
    test('Memory growth over operations', async () => {
      const size = 5000;
      const { entities, relations } = generator.generateDataset({
        entityCount: size,
        relationMultiplier: 2,
        observationsPerEntity: 3,
      });

      console.log('\n📈 Analyzing memory growth patterns...\n');

      const measureMemoryGrowth = async (storageFactory: () => IStorageBackend, name: string) => {
        const memorySnapshots: ReturnType<typeof process.memoryUsage>[] = [];
        
        const storage = storageFactory();
        await storage.initialize();

        // Take initial snapshot
        if (global.gc) global.gc();
        memorySnapshots.push(process.memoryUsage());

        // Create entities in batches and measure
        const batchSize = 500;
        for (let i = 0; i < entities.length; i += batchSize) {
          const batch = entities.slice(i, Math.min(i + batchSize, entities.length));
          await storage.createEntities(batch);
          
          if (global.gc) global.gc();
          memorySnapshots.push(process.memoryUsage());
        }

        // Add relations
        await storage.createRelations(relations);
        if (global.gc) global.gc();
        memorySnapshots.push(process.memoryUsage());

        // Perform searches
        const queries = generator.generateSearchQueries(entities, 50);
        for (const query of queries) {
          await storage.searchNodes(query);
        }
        if (global.gc) global.gc();
        memorySnapshots.push(process.memoryUsage());

        await storage.close();

        // Analyze growth
        const heapGrowth = memorySnapshots.map(s => s.heapUsed / 1024 / 1024);
        const maxHeap = Math.max(...heapGrowth);
        const finalHeap = heapGrowth[heapGrowth.length - 1];
        const growthRate = (finalHeap - heapGrowth[0]) / heapGrowth[0];

        console.log(`${name} Memory Growth:`);
        console.log(`  Initial: ${heapGrowth[0].toFixed(2)} MB`);
        console.log(`  Peak:    ${maxHeap.toFixed(2)} MB`);
        console.log(`  Final:   ${finalHeap.toFixed(2)} MB`);
        console.log(`  Growth:  ${(growthRate * 100).toFixed(1)}%\n`);

        return { heapGrowth, maxHeap, finalHeap, growthRate };
      };

      const jsonGrowth = await measureMemoryGrowth(
        () => new JSONStorage(path.join(testDir, `json-growth-${Date.now()}.jsonl`)),
        'JSON'
      );

      const sqliteGrowth = await measureMemoryGrowth(
        () => new SQLiteStorage(path.join(testDir, `sqlite-growth-${Date.now()}.db`)),
        'SQLite'
      );

      const peakReduction = ((jsonGrowth.maxHeap - sqliteGrowth.maxHeap) / jsonGrowth.maxHeap) * 100;
      console.log(`✨ SQLite uses ${peakReduction.toFixed(1)}% less memory at peak\n`);
    });
  });

  describe('Garbage Collection Impact', () => {
    test('GC frequency and duration', async () => {
      const size = 10000;
      const { entities, relations } = generator.generateDataset({
        entityCount: size,
        relationMultiplier: 2,
        observationsPerEntity: 3,
      });

      console.log('\n🗑️ Analyzing garbage collection impact...\n');

      const measureGcImpact = async (storage: IStorageBackend, name: string) => {
        let gcCount = 0;
        let gcDuration = 0;

        // Monitor GC if available
        if (global.gc && typeof performance !== 'undefined') {
          const observer = new (eval('PerformanceObserver'))((list: any) => {
            const entries = list.getEntries();
            for (const entry of entries) {
              if (entry.entryType === 'gc') {
                gcCount++;
                gcDuration += entry.duration;
              }
            }
          });
          observer.observe({ entryTypes: ['gc'] });

          await storage.initialize();
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          // Perform operations that might trigger GC
          for (let i = 0; i < 100; i++) {
            await storage.loadGraph();
          }

          await storage.close();
          observer.disconnect();
        } else {
          // Fallback: manual GC tracking
          await storage.initialize();
          
          const _startMem = process.memoryUsage().heapUsed;
          await storage.createEntities(entities);
          await storage.createRelations(relations);
          
          for (let i = 0; i < 100; i++) {
            const beforeGc = process.memoryUsage().heapUsed;
            if (global.gc) global.gc();
            const afterGc = process.memoryUsage().heapUsed;
            
            if (beforeGc - afterGc > 1024 * 1024) { // More than 1MB collected
              gcCount++;
            }
          }
          
          await storage.close();
        }

        console.log(`${name} GC Impact:`);
        console.log(`  GC Count: ${gcCount}`);
        if (gcDuration > 0) {
          console.log(`  Total GC Time: ${gcDuration.toFixed(2)}ms`);
          console.log(`  Avg GC Time: ${(gcDuration / gcCount).toFixed(2)}ms`);
        }
        console.log('');

        return { gcCount, gcDuration };
      };

      const jsonGc = await measureGcImpact(
        new JSONStorage(path.join(testDir, `json-gc-${Date.now()}.jsonl`)),
        'JSON'
      );

      const sqliteGc = await measureGcImpact(
        new SQLiteStorage(path.join(testDir, `sqlite-gc-${Date.now()}.db`)),
        'SQLite'
      );

      if (jsonGc.gcCount > 0 && sqliteGc.gcCount > 0) {
        const gcReduction = ((jsonGc.gcCount - sqliteGc.gcCount) / jsonGc.gcCount) * 100;
        console.log(`✨ SQLite triggers ${gcReduction.toFixed(1)}% fewer GC cycles\n`);
      }
    });
  });
});