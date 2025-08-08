#!/usr/bin/env tsx
/**
 * Comprehensive benchmark validation script for mcp-memory-enhanced
 * Validates the performance claims in the README
 */

import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  operation: string;
  jsonTime: number;
  sqliteTime: number;
  improvement: number;
  jsonMemory?: number;
  sqliteMemory?: number;
  memoryReduction?: number;
}

class BenchmarkRunner {
  private results: BenchmarkResult[] = [];
  private testDir: string = '';

  async setup() {
    this.testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-bench-'));
    console.log('Benchmark directory:', this.testDir);
  }

  async cleanup() {
    await fs.rm(this.testDir, { recursive: true, force: true });
  }

  generateTestData(size: number): { entities: Entity[], relations: Relation[] } {
    const entities: Entity[] = [];
    const relations: Relation[] = [];
    
    for (let i = 0; i < size; i++) {
      const entityType = ['Person', 'Organization', 'Project'][i % 3];
      entities.push({
        name: `${entityType}_${i}`,
        entityType,
        observations: [
          `Primary observation for ${entityType}_${i}`,
          `Secondary observation with more details about ${entityType}_${i}`,
          `Extended description of ${entityType}_${i} with comprehensive information and metadata`
        ]
      });
    }
    
    // Generate realistic relation count (2x entities)
    for (let i = 0; i < size * 2; i++) {
      const fromIdx = Math.floor(Math.random() * size);
      const toIdx = Math.floor(Math.random() * size);
      if (fromIdx !== toIdx) {
        relations.push({
          from: entities[fromIdx].name,
          to: entities[toIdx].name,
          relationType: ['works_for', 'collaborates_with', 'manages', 'funds'][i % 4]
        });
      }
    }
    
    return { entities, relations };
  }

  async measureOperation(
    name: string,
    jsonOp: () => Promise<void>,
    sqliteOp: () => Promise<void>
  ): Promise<BenchmarkResult> {
    // Warm up
    await jsonOp();
    await sqliteOp();
    
    // Measure JSON
    const jsonMemBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    const jsonStart = performance.now();
    await jsonOp();
    const jsonEnd = performance.now();
    const jsonMemAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    const jsonTime = jsonEnd - jsonStart;
    const jsonMemory = jsonMemAfter - jsonMemBefore;
    
    // Force GC if available
    if (global.gc) global.gc();
    
    // Measure SQLite
    const sqliteMemBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    const sqliteStart = performance.now();
    await sqliteOp();
    const sqliteEnd = performance.now();
    const sqliteMemAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    const sqliteTime = sqliteEnd - sqliteStart;
    const sqliteMemory = sqliteMemAfter - sqliteMemBefore;
    
    const improvement = (jsonTime / sqliteTime);
    const memoryReduction = ((jsonMemory - sqliteMemory) / jsonMemory) * 100;
    
    const result: BenchmarkResult = {
      operation: name,
      jsonTime,
      sqliteTime,
      improvement,
      jsonMemory,
      sqliteMemory,
      memoryReduction
    };
    
    this.results.push(result);
    return result;
  }

  async runEntityCreationBenchmark(entityCount: number) {
    console.log(`\n=== Entity Creation Benchmark (${entityCount} entities) ===`);
    
    const { entities } = this.generateTestData(entityCount);
    
    const result = await this.measureOperation(
      `Create ${entityCount} entities`,
      async () => {
        const storage = new JSONStorage(path.join(this.testDir, `json-${Date.now()}.json`));
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.close();
      },
      async () => {
        const storage = new SQLiteStorage(path.join(this.testDir, `sqlite-${Date.now()}.db`));
        await storage.initialize();
        await storage.createEntities(entities);
        await storage.close();
      }
    );
    
    console.log(`JSON Time: ${result.jsonTime.toFixed(2)}ms`);
    console.log(`SQLite Time: ${result.sqliteTime.toFixed(2)}ms`);
    console.log(`SQLite is ${result.improvement.toFixed(1)}x faster`);
    console.log(`Memory: JSON ${result.jsonMemory?.toFixed(2)}MB vs SQLite ${result.sqliteMemory?.toFixed(2)}MB`);
    
    return result;
  }

  async runSearchBenchmark(entityCount: number, searchCount: number) {
    console.log(`\n=== Search Benchmark (${searchCount} searches in ${entityCount} entities) ===`);
    
    const { entities, relations } = this.generateTestData(entityCount);
    
    // Prepare databases
    const jsonPath = path.join(this.testDir, 'search-json.json');
    const sqlitePath = path.join(this.testDir, 'search-sqlite.db');
    
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    await jsonStorage.createEntities(entities);
    await jsonStorage.createRelations(relations);
    await jsonStorage.close();
    
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    await sqliteStorage.createEntities(entities);
    await sqliteStorage.createRelations(relations);
    await sqliteStorage.close();
    
    const searchTerms = Array.from({ length: searchCount }, (_, i) => 
      `${['Person', 'Organization', 'Project'][i % 3]}_${Math.floor(Math.random() * entityCount)}`
    );
    
    const result = await this.measureOperation(
      `Search ${searchCount} times`,
      async () => {
        const storage = new JSONStorage(jsonPath);
        await storage.initialize();
        for (const term of searchTerms) {
          await storage.searchNodes(term);
        }
        await storage.close();
      },
      async () => {
        const storage = new SQLiteStorage(sqlitePath);
        await storage.initialize();
        for (const term of searchTerms) {
          await storage.searchNodes(term);
        }
        await storage.close();
      }
    );
    
    console.log(`JSON Time: ${result.jsonTime.toFixed(2)}ms`);
    console.log(`SQLite Time: ${result.sqliteTime.toFixed(2)}ms`);
    console.log(`SQLite is ${result.improvement.toFixed(1)}x faster`);
    
    return result;
  }

  async runMemoryBenchmark(entityCount: number) {
    console.log(`\n=== Memory Usage Benchmark (${entityCount} entities) ===`);
    
    const { entities, relations } = this.generateTestData(entityCount);
    
    // Force GC before measurement
    if (global.gc) global.gc();
    
    // Measure JSON storage size and memory
    const jsonPath = path.join(this.testDir, 'memory-test.json');
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    await jsonStorage.createEntities(entities);
    await jsonStorage.createRelations(relations);
    await jsonStorage.close();
    
    const jsonStats = await fs.stat(jsonPath);
    const jsonFileSize = jsonStats.size / 1024 / 1024; // MB
    
    // Measure SQLite storage size and memory
    const sqlitePath = path.join(this.testDir, 'memory-test.db');
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    await sqliteStorage.createEntities(entities);
    await sqliteStorage.createRelations(relations);
    await sqliteStorage.close();
    
    const sqliteStats = await fs.stat(sqlitePath);
    const sqliteFileSize = sqliteStats.size / 1024 / 1024; // MB
    
    const storageReduction = ((jsonFileSize - sqliteFileSize) / jsonFileSize) * 100;
    
    console.log(`JSON File Size: ${jsonFileSize.toFixed(2)}MB`);
    console.log(`SQLite File Size: ${sqliteFileSize.toFixed(2)}MB`);
    console.log(`Storage Reduction: ${storageReduction.toFixed(1)}%`);
    
    return {
      jsonFileSize,
      sqliteFileSize,
      storageReduction
    };
  }

  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK VALIDATION SUMMARY');
    console.log('='.repeat(80));
    
    console.log('\nClaimed vs Actual Performance Improvements:');
    console.log('-'.repeat(50));
    
    // Entity creation claim: 250x faster
    const entityResults = this.results.filter(r => r.operation.includes('Create'));
    const avgEntityImprovement = entityResults.reduce((sum, r) => sum + r.improvement, 0) / entityResults.length;
    console.log(`Entity Creation:`);
    console.log(`  Claimed: 250x faster`);
    console.log(`  Actual: ${avgEntityImprovement.toFixed(1)}x faster`);
    console.log(`  Status: ${avgEntityImprovement >= 250 ? '✅ VALIDATED' : '❌ NOT VALIDATED'}`);
    
    // Search claim: 15x faster
    const searchResults = this.results.filter(r => r.operation.includes('Search'));
    const avgSearchImprovement = searchResults.reduce((sum, r) => sum + r.improvement, 0) / searchResults.length;
    console.log(`\nSearch Operations:`);
    console.log(`  Claimed: 15x faster`);
    console.log(`  Actual: ${avgSearchImprovement.toFixed(1)}x faster`);
    console.log(`  Status: ${avgSearchImprovement >= 15 ? '✅ VALIDATED' : '❌ NOT VALIDATED'}`);
    
    // Memory claim: 79% less
    const memoryResults = this.results.filter(r => r.memoryReduction !== undefined);
    const avgMemoryReduction = memoryResults.reduce((sum, r) => sum + (r.memoryReduction || 0), 0) / memoryResults.length;
    console.log(`\nMemory Usage:`);
    console.log(`  Claimed: 79% less memory`);
    console.log(`  Actual: ${avgMemoryReduction.toFixed(1)}% less memory`);
    console.log(`  Status: ${avgMemoryReduction >= 79 ? '✅ VALIDATED' : '❌ NOT VALIDATED'}`);
    
    console.log('\n' + '='.repeat(80));
  }
}

async function main() {
  console.log('MCP Memory Enhanced - Performance Validation Benchmark');
  console.log('=' .repeat(60));
  console.log('Validating README performance claims...\n');
  
  const runner = new BenchmarkRunner();
  await runner.setup();
  
  try {
    // Run benchmarks with different dataset sizes
    await runner.runEntityCreationBenchmark(100);
    await runner.runEntityCreationBenchmark(1000);
    await runner.runEntityCreationBenchmark(10000);
    
    await runner.runSearchBenchmark(1000, 100);
    await runner.runSearchBenchmark(10000, 500);
    
    await runner.runMemoryBenchmark(1000);
    await runner.runMemoryBenchmark(10000);
    
    runner.printSummary();
    
  } finally {
    await runner.cleanup();
  }
}

// Run with optional GC exposed
main().catch(console.error);