import { describe, test, beforeAll, afterAll, expect } from 'vitest';
import { BenchmarkRunner } from '../infrastructure/benchmark-runner.js';
import { DatasetGenerator } from '../infrastructure/dataset-generator.js';
import { ReportGenerator } from '../infrastructure/report-generator.js';
import { JSONStorage } from '../../../storage/json-storage.js';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

/**
 * Validation benchmark suite specifically designed to verify README performance claims
 */
describe('README Claims Validation', () => {
  const runner = new BenchmarkRunner({
    warmupIterations: 5,
    iterations: 30,
    forceGc: true,
    collectMemory: true,
  });

  const _reporter = new ReportGenerator();
  const generator = new DatasetGenerator(42);

  // Test with 10,000 entities as stated in README
  const VALIDATION_SIZE = 10000;
  const { entities, relations } = generator.generateDataset({
    entityCount: VALIDATION_SIZE,
    relationMultiplier: 2,
    observationsPerEntity: 3,
  });

  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-validate-'));
    console.log('\n' + '='.repeat(70));
    console.log('MCP MEMORY ENHANCED - PERFORMANCE CLAIMS VALIDATION');
    console.log('='.repeat(70));
    console.log(`Dataset: ${VALIDATION_SIZE} entities, ${relations.length} relations`);
    console.log(`Environment: Node ${process.version}, ${process.platform} ${process.arch}`);
    console.log('='.repeat(70) + '\n');
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    
    // Generate summary report
    console.log('\n' + '='.repeat(70));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(70) + '\n');
  });

  test('Claim 1: Entity Creation - 250x faster', async () => {
    console.log('\n📊 VALIDATING: Entity Creation Speed (Claimed: 250x faster)\n');

    const results = await runner.runComparison(
      'Entity Creation',
      {
        'JSON': async () => {
          const storage = new JSONStorage(path.join(testDir, `json-create-${Date.now()}.jsonl`));
          await storage.initialize();
          
          // Batch creation as mentioned in README
          const batchSize = 100;
          for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);
            await storage.createEntities(batch);
          }
          
          await storage.close();
        },
        'SQLite': async () => {
          const storage = new SQLiteStorage(path.join(testDir, `sqlite-create-${Date.now()}.db`));
          await storage.initialize();
          
          // Same batch creation
          const batchSize = 100;
          for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);
            await storage.createEntities(batch);
          }
          
          await storage.close();
        },
      },
      { iterations: 10 } // Fewer iterations due to dataset size
    );

    const jsonTime = results['JSON'].stats.mean;
    const sqliteTime = results['SQLite'].stats.mean;
    const speedup = jsonTime / sqliteTime;

    console.log(`  JSON Backend:   ${jsonTime.toFixed(2)}ms`);
    console.log(`  SQLite Backend: ${sqliteTime.toFixed(2)}ms`);
    console.log(`  Actual Speedup: ${speedup.toFixed(1)}x`);
    console.log(`  Claimed: 250x | Actual: ${speedup.toFixed(1)}x | ${speedup >= 225 ? '✅ VALID' : '❌ INVALID'}`);
    
    expect(speedup).toBeGreaterThanOrEqual(225); // Allow 10% variance
  });

  test('Claim 2: Search Performance - 15x faster', async () => {
    console.log('\n📊 VALIDATING: Search Performance (Claimed: 15x faster)\n');

    // Pre-populate storages
    const jsonStorage = new JSONStorage(path.join(testDir, 'json-search.jsonl'));
    const sqliteStorage = new SQLiteStorage(path.join(testDir, 'sqlite-search.db'));
    
    await jsonStorage.initialize();
    await sqliteStorage.initialize();
    
    await jsonStorage.createEntities(entities);
    await jsonStorage.createRelations(relations);
    
    await sqliteStorage.createEntities(entities);
    await sqliteStorage.createRelations(relations);

    // Generate search queries that would return ~1000 results as mentioned in README
    const searchQueries = generator.generateSearchQueries(entities, 50);

    const results = await runner.runComparison(
      'Search Operations',
      {
        'JSON': async () => {
          for (const query of searchQueries) {
            const results = await jsonStorage.searchEntities(query);
            // Ensure we're getting substantial results
            if (results.length > 100) break;
          }
        },
        'SQLite': async () => {
          for (const query of searchQueries) {
            const results = await sqliteStorage.searchEntities(query);
            if (results.length > 100) break;
          }
        },
      },
      { iterations: 50 }
    );

    await jsonStorage.close();
    await sqliteStorage.close();

    const speedup = results['JSON'].stats.mean / results['SQLite'].stats.mean;

    console.log(`  JSON Backend:   ${results['JSON'].stats.mean.toFixed(2)}ms`);
    console.log(`  SQLite Backend: ${results['SQLite'].stats.mean.toFixed(2)}ms`);
    console.log(`  Actual Speedup: ${speedup.toFixed(1)}x`);
    console.log(`  Claimed: 15x | Actual: ${speedup.toFixed(1)}x | ${speedup >= 13.5 ? '✅ VALID' : '❌ INVALID'}`);
    
    expect(speedup).toBeGreaterThanOrEqual(13.5); // Allow 10% variance
  });

  test('Claim 3: Memory Usage - 79% less', async () => {
    console.log('\n📊 VALIDATING: Memory Usage (Claimed: 79% less)\n');

    let _jsonMemory: number = 0;
    let _sqliteMemory: number = 0;

    // Measure JSON memory usage
    const jsonResult = await runner.run(
      'JSON Memory Usage',
      async () => {
        const storage = new JSONStorage(path.join(testDir, 'json-memory.jsonl'));
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.createRelations(relations);
        
        // Force GC and measure
        if (global.gc) global.gc();
        const mem = process.memoryUsage();
        _jsonMemory = mem.heapUsed;
        
        await storage.close();
      },
      { iterations: 5 }
    );

    // Measure SQLite memory usage
    const sqliteResult = await runner.run(
      'SQLite Memory Usage',
      async () => {
        const storage = new SQLiteStorage(path.join(testDir, 'sqlite-memory.db'));
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.createRelations(relations);
        
        // Force GC and measure
        if (global.gc) global.gc();
        const mem = process.memoryUsage();
        _sqliteMemory = mem.heapUsed;
        
        await storage.close();
      },
      { iterations: 5 }
    );

    const memoryReduction = ((jsonResult.memory!.heapUsed.mean - sqliteResult.memory!.heapUsed.mean) / 
                            jsonResult.memory!.heapUsed.mean) * 100;

    console.log(`  JSON Memory:   ${(jsonResult.memory!.heapUsed.mean / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  SQLite Memory: ${(sqliteResult.memory!.heapUsed.mean / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Actual Reduction: ${memoryReduction.toFixed(1)}%`);
    console.log(`  Claimed: 79% | Actual: ${memoryReduction.toFixed(1)}% | ${memoryReduction >= 71 ? '✅ VALID' : '❌ INVALID'}`);
    
    expect(memoryReduction).toBeGreaterThanOrEqual(71); // Allow 10% variance
  });

  test('Claim 4: Storage Size - 30% smaller', async () => {
    console.log('\n📊 VALIDATING: Storage Size (Claimed: 30% smaller)\n');

    const jsonPath = path.join(testDir, 'json-size.jsonl');
    const sqlitePath = path.join(testDir, 'sqlite-size.db');

    // Create and populate JSON storage
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    await jsonStorage.createEntities(entities);
    await jsonStorage.createRelations(relations);
    await jsonStorage.close();

    // Create and populate SQLite storage
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    await sqliteStorage.createEntities(entities);
    await sqliteStorage.createRelations(relations);
    await sqliteStorage.close();

    // Measure file sizes
    const jsonStats = await fs.stat(jsonPath);
    const sqliteStats = await fs.stat(sqlitePath);
    
    const sizeReduction = ((jsonStats.size - sqliteStats.size) / jsonStats.size) * 100;

    console.log(`  JSON Size:   ${(jsonStats.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  SQLite Size: ${(sqliteStats.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Actual Reduction: ${sizeReduction.toFixed(1)}%`);
    console.log(`  Claimed: 30% | Actual: ${sizeReduction.toFixed(1)}% | ${sizeReduction >= 27 ? '✅ VALID' : '❌ INVALID'}`);
    
    expect(sizeReduction).toBeGreaterThanOrEqual(27); // Allow 10% variance
  });
});