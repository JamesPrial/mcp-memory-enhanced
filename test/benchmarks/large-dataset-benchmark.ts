#!/usr/bin/env tsx
/**
 * Large dataset benchmark for mcp-memory-enhanced
 * Tests performance with datasets from 10K to 1M entities
 */

import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity, Relation } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  dataset: number;
  operation: string;
  jsonTime: number;
  sqliteTime: number;
  improvement: number;
  jsonMemory?: number;
  sqliteMemory?: number;
}

class LargeDatasetBenchmark {
  private testDir: string = '';
  private results: BenchmarkResult[] = [];

  async setup() {
    this.testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-large-bench-'));
    console.log('Benchmark directory:', this.testDir);
  }

  async cleanup() {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }

  generateBatch(startIdx: number, batchSize: number): { entities: Entity[], relations: Relation[] } {
    const entities: Entity[] = [];
    const relations: Relation[] = [];
    
    // Generate entities
    for (let i = 0; i < batchSize; i++) {
      const idx = startIdx + i;
      const entityType = ['Person', 'Organization', 'Project', 'Document', 'Location'][idx % 5];
      entities.push({
        name: `${entityType}_${idx}`,
        entityType,
        observations: [
          `Primary observation for ${entityType}_${idx} with detailed information`,
          `Secondary observation containing metadata and relationships for ${entityType}_${idx}`,
          `Tertiary observation with extended description and analysis of ${entityType}_${idx}`,
          `Additional context and historical data about ${entityType}_${idx}`,
          `Performance metrics and statistics related to ${entityType}_${idx}`
        ]
      });
    }
    
    // Generate relations (2.5x entities for complex graph)
    for (let i = 0; i < batchSize * 2.5; i++) {
      const fromIdx = startIdx + Math.floor(Math.random() * batchSize);
      const toIdx = startIdx + Math.floor(Math.random() * batchSize);
      if (fromIdx !== toIdx) {
        relations.push({
          from: `${['Person', 'Organization', 'Project', 'Document', 'Location'][fromIdx % 5]}_${fromIdx}`,
          to: `${['Person', 'Organization', 'Project', 'Document', 'Location'][toIdx % 5]}_${toIdx}`,
          relationType: ['manages', 'collaborates_with', 'owns', 'references', 'located_at', 'funds', 'reviews'][i % 7]
        });
      }
    }
    
    return { entities, relations };
  }

  async benchmarkEntityCreation(totalSize: number, batchSize: number = 5000) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`ENTITY CREATION BENCHMARK: ${totalSize.toLocaleString()} entities`);
    console.log(`Batch size: ${batchSize.toLocaleString()}`);
    console.log(`${'='.repeat(80)}`);

    const numBatches = Math.ceil(totalSize / batchSize);
    
    // Test JSON Storage
    console.log('\nTesting JSON Storage...');
    const jsonPath = path.join(this.testDir, `json-${totalSize}.json`);
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    
    const jsonMemBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    const jsonStart = performance.now();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, totalSize - startIdx);
      const { entities } = this.generateBatch(startIdx, currentBatchSize);
      
      await jsonStorage.createEntities(entities);
      
      if (batch % 10 === 0) {
        console.log(`  JSON: Processed ${((batch + 1) * batchSize).toLocaleString()} / ${totalSize.toLocaleString()} entities`);
      }
    }
    
    const jsonEnd = performance.now();
    const jsonMemAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    await jsonStorage.close();
    
    const jsonTime = jsonEnd - jsonStart;
    const jsonMemory = jsonMemAfter - jsonMemBefore;
    
    // Force garbage collection
    if (global.gc) global.gc();
    
    // Test SQLite Storage
    console.log('\nTesting SQLite Storage...');
    const sqlitePath = path.join(this.testDir, `sqlite-${totalSize}.db`);
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    
    const sqliteMemBefore = process.memoryUsage().heapUsed / 1024 / 1024;
    const sqliteStart = performance.now();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, totalSize - startIdx);
      const { entities } = this.generateBatch(startIdx, currentBatchSize);
      
      await sqliteStorage.createEntities(entities);
      
      if (batch % 10 === 0) {
        console.log(`  SQLite: Processed ${((batch + 1) * batchSize).toLocaleString()} / ${totalSize.toLocaleString()} entities`);
      }
    }
    
    const sqliteEnd = performance.now();
    const sqliteMemAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    await sqliteStorage.close();
    
    const sqliteTime = sqliteEnd - sqliteStart;
    const sqliteMemory = sqliteMemAfter - sqliteMemBefore;
    
    const improvement = jsonTime / sqliteTime;
    
    const result: BenchmarkResult = {
      dataset: totalSize,
      operation: 'Entity Creation',
      jsonTime,
      sqliteTime,
      improvement,
      jsonMemory,
      sqliteMemory
    };
    
    this.results.push(result);
    
    console.log(`\nResults for ${totalSize.toLocaleString()} entities:`);
    console.log(`  JSON:   ${(jsonTime / 1000).toFixed(2)}s, Memory: ${jsonMemory.toFixed(2)}MB`);
    console.log(`  SQLite: ${(sqliteTime / 1000).toFixed(2)}s, Memory: ${sqliteMemory.toFixed(2)}MB`);
    console.log(`  ✨ SQLite is ${improvement.toFixed(1)}x faster`);
    console.log(`  💾 Memory reduction: ${((1 - sqliteMemory/jsonMemory) * 100).toFixed(1)}%`);
    
    return result;
  }

  async benchmarkSearch(datasetSize: number, numSearches: number = 1000) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`SEARCH BENCHMARK: ${numSearches.toLocaleString()} searches in ${datasetSize.toLocaleString()} entities`);
    console.log(`${'='.repeat(80)}`);

    // First, create the datasets
    console.log('\nPreparing test datasets...');
    const batchSize = 5000;
    const numBatches = Math.ceil(datasetSize / batchSize);
    
    // Create JSON dataset
    const jsonPath = path.join(this.testDir, `search-json-${datasetSize}.json`);
    const jsonPrep = new JSONStorage(jsonPath);
    await jsonPrep.initialize();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, datasetSize - startIdx);
      const { entities, relations } = this.generateBatch(startIdx, currentBatchSize);
      await jsonPrep.createEntities(entities);
      await jsonPrep.createRelations(relations);
    }
    await jsonPrep.close();
    
    // Create SQLite dataset
    const sqlitePath = path.join(this.testDir, `search-sqlite-${datasetSize}.db`);
    const sqlitePrep = new SQLiteStorage(sqlitePath);
    await sqlitePrep.initialize();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, datasetSize - startIdx);
      const { entities, relations } = this.generateBatch(startIdx, currentBatchSize);
      await sqlitePrep.createEntities(entities);
      await sqlitePrep.createRelations(relations);
    }
    await sqlitePrep.close();
    
    // Generate search terms
    const searchTerms: string[] = [];
    for (let i = 0; i < numSearches; i++) {
      const randomIdx = Math.floor(Math.random() * datasetSize);
      const entityType = ['Person', 'Organization', 'Project', 'Document', 'Location'][randomIdx % 5];
      searchTerms.push(`${entityType}_${randomIdx}`);
    }
    
    // Benchmark JSON searches
    console.log('\nTesting JSON search performance...');
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    
    const jsonStart = performance.now();
    for (let i = 0; i < searchTerms.length; i++) {
      await jsonStorage.searchEntities(searchTerms[i]);
      if (i % 100 === 0) {
        console.log(`  JSON: Completed ${i} / ${numSearches} searches`);
      }
    }
    const jsonEnd = performance.now();
    await jsonStorage.close();
    const jsonTime = jsonEnd - jsonStart;
    
    // Benchmark SQLite searches
    console.log('\nTesting SQLite search performance...');
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    
    const sqliteStart = performance.now();
    for (let i = 0; i < searchTerms.length; i++) {
      await sqliteStorage.searchEntities(searchTerms[i]);
      if (i % 100 === 0) {
        console.log(`  SQLite: Completed ${i} / ${numSearches} searches`);
      }
    }
    const sqliteEnd = performance.now();
    await sqliteStorage.close();
    const sqliteTime = sqliteEnd - sqliteStart;
    
    const improvement = jsonTime / sqliteTime;
    
    const result: BenchmarkResult = {
      dataset: datasetSize,
      operation: `Search (${numSearches} queries)`,
      jsonTime,
      sqliteTime,
      improvement
    };
    
    this.results.push(result);
    
    console.log(`\nResults for ${numSearches.toLocaleString()} searches:`);
    console.log(`  JSON:   ${(jsonTime / 1000).toFixed(2)}s (${(jsonTime/numSearches).toFixed(2)}ms per search)`);
    console.log(`  SQLite: ${(sqliteTime / 1000).toFixed(2)}s (${(sqliteTime/numSearches).toFixed(2)}ms per search)`);
    console.log(`  ✨ SQLite is ${improvement.toFixed(1)}x faster`);
    
    return result;
  }

  async benchmarkStorageSize(datasetSize: number) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`STORAGE SIZE BENCHMARK: ${datasetSize.toLocaleString()} entities`);
    console.log(`${'='.repeat(80)}`);

    const batchSize = 5000;
    const numBatches = Math.ceil(datasetSize / batchSize);
    
    // Create JSON dataset
    console.log('\nCreating JSON dataset...');
    const jsonPath = path.join(this.testDir, `storage-json-${datasetSize}.json`);
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, datasetSize - startIdx);
      const { entities, relations } = this.generateBatch(startIdx, currentBatchSize);
      await jsonStorage.createEntities(entities);
      await jsonStorage.createRelations(relations);
    }
    await jsonStorage.close();
    
    // Create SQLite dataset
    console.log('Creating SQLite dataset...');
    const sqlitePath = path.join(this.testDir, `storage-sqlite-${datasetSize}.db`);
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, datasetSize - startIdx);
      const { entities, relations } = this.generateBatch(startIdx, currentBatchSize);
      await sqliteStorage.createEntities(entities);
      await sqliteStorage.createRelations(relations);
    }
    await sqliteStorage.close();
    
    // Compare file sizes
    const jsonStats = await fs.stat(jsonPath);
    const sqliteStats = await fs.stat(sqlitePath);
    
    const jsonSize = jsonStats.size / (1024 * 1024); // MB
    const sqliteSize = sqliteStats.size / (1024 * 1024); // MB
    const reduction = ((jsonSize - sqliteSize) / jsonSize) * 100;
    
    console.log(`\nStorage Size Results:`);
    console.log(`  JSON:   ${jsonSize.toFixed(2)}MB`);
    console.log(`  SQLite: ${sqliteSize.toFixed(2)}MB`);
    console.log(`  💾 Storage reduction: ${reduction.toFixed(1)}%`);
    
    return {
      dataset: datasetSize,
      jsonSize,
      sqliteSize,
      reduction
    };
  }

  printFinalSummary() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('FINAL BENCHMARK SUMMARY - LARGE DATASETS');
    console.log(`${'='.repeat(80)}`);
    
    console.log('\n📊 Performance Improvements by Dataset Size:');
    console.log('-'.repeat(60));
    
    // Group results by operation type
    const creationResults = this.results.filter(r => r.operation.includes('Creation'));
    const searchResults = this.results.filter(r => r.operation.includes('Search'));
    
    if (creationResults.length > 0) {
      console.log('\nEntity Creation:');
      creationResults.forEach(r => {
        console.log(`  ${r.dataset.toLocaleString()} entities: ${r.improvement.toFixed(1)}x faster`);
      });
      const avgCreation = creationResults.reduce((sum, r) => sum + r.improvement, 0) / creationResults.length;
      console.log(`  Average: ${avgCreation.toFixed(1)}x faster`);
      console.log(`  README claims: 250x faster`);
      console.log(`  Status: ${avgCreation >= 250 ? '✅ VALIDATED' : avgCreation >= 200 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    }
    
    if (searchResults.length > 0) {
      console.log('\nSearch Operations:');
      searchResults.forEach(r => {
        console.log(`  ${r.dataset.toLocaleString()} entities: ${r.improvement.toFixed(1)}x faster`);
      });
      const avgSearch = searchResults.reduce((sum, r) => sum + r.improvement, 0) / searchResults.length;
      console.log(`  Average: ${avgSearch.toFixed(1)}x faster`);
      console.log(`  README claims: 15x faster`);
      console.log(`  Status: ${avgSearch >= 15 ? '✅ VALIDATED' : avgSearch >= 12 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    }
    
    // Memory reduction
    const memoryResults = this.results.filter(r => r.jsonMemory && r.sqliteMemory);
    if (memoryResults.length > 0) {
      console.log('\nMemory Usage:');
      memoryResults.forEach(r => {
        const reduction = ((r.jsonMemory! - r.sqliteMemory!) / r.jsonMemory!) * 100;
        console.log(`  ${r.dataset.toLocaleString()} entities: ${reduction.toFixed(1)}% less memory`);
      });
      const avgMemReduction = memoryResults.reduce((sum, r) => {
        return sum + ((r.jsonMemory! - r.sqliteMemory!) / r.jsonMemory!) * 100;
      }, 0) / memoryResults.length;
      console.log(`  Average: ${avgMemReduction.toFixed(1)}% less memory`);
      console.log(`  README claims: 79% less memory`);
      console.log(`  Status: ${avgMemReduction >= 79 ? '✅ VALIDATED' : avgMemReduction >= 70 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

async function main() {
  console.log('MCP Memory Enhanced - Large Dataset Performance Validation');
  console.log('=' .repeat(60));
  console.log('Testing with datasets from 10K to 1M entities\n');
  
  const benchmark = new LargeDatasetBenchmark();
  await benchmark.setup();
  
  try {
    // Test increasingly large datasets
    const datasets = [
      10000,    // 10K
      50000,    // 50K
      100000,   // 100K
      500000,   // 500K
      1000000   // 1M
    ];
    
    for (const size of datasets) {
      console.log(`\n${'#'.repeat(80)}`);
      console.log(`TESTING WITH ${size.toLocaleString()} ENTITIES`);
      console.log(`${'#'.repeat(80)}`);
      
      // Entity creation benchmark
      await benchmark.benchmarkEntityCreation(size);
      
      // Search benchmark (scale searches with dataset)
      const numSearches = Math.min(10000, Math.floor(size / 10));
      await benchmark.benchmarkSearch(size, numSearches);
      
      // Storage size benchmark
      await benchmark.benchmarkStorageSize(size);
      
      // Clean up between tests to avoid memory issues
      if (global.gc) global.gc();
    }
    
    benchmark.printFinalSummary();
    
  } catch (error) {
    console.error('Benchmark error:', error);
  } finally {
    await benchmark.cleanup();
  }
}

// Run with optional GC exposed
main().catch(console.error);