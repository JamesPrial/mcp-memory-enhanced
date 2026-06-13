#!/usr/bin/env tsx
/**
 * Focused large dataset benchmark
 * Tests 100K, 500K, and 1M entities
 */

import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

class FocusedBenchmark {
  private testDir: string = '';
  private results: any[] = [];

  async setup() {
    this.testDir = await fs.mkdtemp(path.join(tmpdir(), 'mcp-focused-bench-'));
    console.log('Benchmark directory:', this.testDir);
  }

  async cleanup() {
    try {
      await fs.rm(this.testDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }

  generateBatch(startIdx: number, batchSize: number): Entity[] {
    const entities: Entity[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const idx = startIdx + i;
      const entityType = ['Person', 'Organization', 'Project', 'Document', 'Location'][idx % 5];
      entities.push({
        name: `${entityType}_${idx}`,
        entityType,
        observations: [
          `Primary observation for ${entityType}_${idx} with comprehensive details and metadata`,
          `Secondary observation containing relationship data and cross-references for ${entityType}_${idx}`,
          `Tertiary observation with extended analysis, historical context, and performance metrics for ${entityType}_${idx}`,
          `Quaternary observation including predictions, projections, and future planning data for ${entityType}_${idx}`,
          `Quinary observation with meta-analysis, pattern recognition, and emergent properties of ${entityType}_${idx}`
        ]
      });
    }
    
    return entities;
  }

  async benchmarkLargeDataset(totalSize: number) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`BENCHMARKING ${totalSize.toLocaleString()} ENTITIES`);
    console.log(`${'='.repeat(80)}`);

    const batchSize = 10000; // Larger batches for better performance
    const numBatches = Math.ceil(totalSize / batchSize);
    
    // Test JSON Storage - Entity Creation
    console.log('\n📝 Testing JSON Entity Creation...');
    const jsonPath = path.join(this.testDir, `json-${totalSize}.json`);
    const jsonStorage = new JSONStorage(jsonPath);
    await jsonStorage.initialize();
    
    const jsonMemBefore = process.memoryUsage();
    const jsonStart = performance.now();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, totalSize - startIdx);
      const entities = this.generateBatch(startIdx, currentBatchSize);
      
      await jsonStorage.createEntities(entities);
      
      // Progress every 10%
      const progress = ((batch + 1) / numBatches) * 100;
      if (progress % 10 === 0) {
        console.log(`  Progress: ${progress.toFixed(0)}%`);
      }
    }
    
    const jsonEnd = performance.now();
    const jsonMemAfter = process.memoryUsage();
    const jsonTime = jsonEnd - jsonStart;
    const jsonMemUsed = (jsonMemAfter.heapUsed - jsonMemBefore.heapUsed) / (1024 * 1024);
    const jsonRSS = (jsonMemAfter.rss - jsonMemBefore.rss) / (1024 * 1024);
    
    // Get final graph for size check
    const jsonGraph = await jsonStorage.readGraph();
    const jsonEntityCount = jsonGraph.entities.length;
    await jsonStorage.close();
    
    // Check file size
    try {
      const jsonStats = await fs.stat(jsonPath);
      const jsonFileSize = jsonStats.size / (1024 * 1024);
      console.log(`  File size: ${jsonFileSize.toFixed(2)}MB`);
    } catch {
      console.log(`  File size: Could not determine`);
    }
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test SQLite Storage - Entity Creation
    console.log('\n⚡ Testing SQLite Entity Creation...');
    const sqlitePath = path.join(this.testDir, `sqlite-${totalSize}.db`);
    const sqliteStorage = new SQLiteStorage(sqlitePath);
    await sqliteStorage.initialize();
    
    const sqliteMemBefore = process.memoryUsage();
    const sqliteStart = performance.now();
    
    for (let batch = 0; batch < numBatches; batch++) {
      const startIdx = batch * batchSize;
      const currentBatchSize = Math.min(batchSize, totalSize - startIdx);
      const entities = this.generateBatch(startIdx, currentBatchSize);
      
      await sqliteStorage.createEntities(entities);
      
      // Progress every 10%
      const progress = ((batch + 1) / numBatches) * 100;
      if (progress % 10 === 0) {
        console.log(`  Progress: ${progress.toFixed(0)}%`);
      }
    }
    
    const sqliteEnd = performance.now();
    const sqliteMemAfter = process.memoryUsage();
    const sqliteTime = sqliteEnd - sqliteStart;
    const sqliteMemUsed = (sqliteMemAfter.heapUsed - sqliteMemBefore.heapUsed) / (1024 * 1024);
    const sqliteRSS = (sqliteMemAfter.rss - sqliteMemBefore.rss) / (1024 * 1024);
    
    // Get final graph for size check
    const sqliteGraph = await sqliteStorage.readGraph();
    const sqliteEntityCount = sqliteGraph.entities.length;
    await sqliteStorage.close();
    
    // Check file size
    try {
      const sqliteStats = await fs.stat(sqlitePath);
      const sqliteFileSize = sqliteStats.size / (1024 * 1024);
      console.log(`  File size: ${sqliteFileSize.toFixed(2)}MB`);
    } catch {
      console.log(`  File size: Could not determine`);
    }
    
    // Calculate improvements
    const timeImprovement = jsonTime / sqliteTime;
    const memImprovement = jsonMemUsed / sqliteMemUsed;
    const _rssImprovement = jsonRSS / sqliteRSS;
    
    // Search benchmark with smaller sample
    console.log('\n🔍 Testing Search Performance (1000 random searches)...');
    
    // Prepare search terms
    const searchTerms: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const randomIdx = Math.floor(Math.random() * totalSize);
      const entityType = ['Person', 'Organization', 'Project', 'Document', 'Location'][randomIdx % 5];
      searchTerms.push(`${entityType}_${randomIdx}`);
    }
    
    // JSON search
    console.log('  Testing JSON search...');
    const jsonSearchStorage = new JSONStorage(jsonPath);
    await jsonSearchStorage.initialize();
    const jsonSearchStart = performance.now();
    
    for (const term of searchTerms) {
      await jsonSearchStorage.searchEntities(term);
    }
    
    const jsonSearchEnd = performance.now();
    const jsonSearchTime = jsonSearchEnd - jsonSearchStart;
    await jsonSearchStorage.close();
    
    // SQLite search
    console.log('  Testing SQLite search...');
    const sqliteSearchStorage = new SQLiteStorage(sqlitePath);
    await sqliteSearchStorage.initialize();
    const sqliteSearchStart = performance.now();
    
    for (const term of searchTerms) {
      await sqliteSearchStorage.searchEntities(term);
    }
    
    const sqliteSearchEnd = performance.now();
    const sqliteSearchTime = sqliteSearchEnd - sqliteSearchStart;
    await sqliteSearchStorage.close();
    
    const searchImprovement = jsonSearchTime / sqliteSearchTime;
    
    // Print results
    console.log(`\n${'='.repeat(80)}`);
    console.log(`RESULTS FOR ${totalSize.toLocaleString()} ENTITIES`);
    console.log(`${'='.repeat(80)}`);
    
    console.log('\n📊 Entity Creation Performance:');
    console.log(`  JSON:   ${(jsonTime / 1000).toFixed(2)}s (${jsonEntityCount.toLocaleString()} entities created)`);
    console.log(`  SQLite: ${(sqliteTime / 1000).toFixed(2)}s (${sqliteEntityCount.toLocaleString()} entities created)`);
    console.log(`  ✨ SQLite is ${timeImprovement.toFixed(1)}x faster`);
    
    console.log('\n💾 Memory Usage:');
    console.log(`  JSON:   Heap: ${jsonMemUsed.toFixed(2)}MB, RSS: ${jsonRSS.toFixed(2)}MB`);
    console.log(`  SQLite: Heap: ${sqliteMemUsed.toFixed(2)}MB, RSS: ${sqliteRSS.toFixed(2)}MB`);
    console.log(`  ✨ SQLite uses ${((1 - sqliteMemUsed/jsonMemUsed) * 100).toFixed(1)}% less heap memory`);
    console.log(`  ✨ SQLite uses ${((1 - sqliteRSS/jsonRSS) * 100).toFixed(1)}% less RSS memory`);
    
    console.log('\n🔍 Search Performance (1000 searches):');
    console.log(`  JSON:   ${(jsonSearchTime / 1000).toFixed(2)}s (${(jsonSearchTime).toFixed(2)}ms per search)`);
    console.log(`  SQLite: ${(sqliteSearchTime / 1000).toFixed(2)}s (${(sqliteSearchTime).toFixed(2)}ms per search)`);
    console.log(`  ✨ SQLite is ${searchImprovement.toFixed(1)}x faster`);
    
    this.results.push({
      entities: totalSize,
      creationImprovement: timeImprovement,
      searchImprovement: searchImprovement,
      memoryReduction: (1 - sqliteMemUsed/jsonMemUsed) * 100
    });
    
    return {
      timeImprovement,
      memImprovement,
      searchImprovement
    };
  }

  printFinalSummary() {
    console.log(`\n${'='.repeat(80)}`);
    console.log('FINAL VALIDATION SUMMARY');
    console.log(`${'='.repeat(80)}`);
    
    if (this.results.length === 0) {
      console.log('No results to summarize');
      return;
    }
    
    // Calculate averages
    const avgCreation = this.results.reduce((sum, r) => sum + r.creationImprovement, 0) / this.results.length;
    const avgSearch = this.results.reduce((sum, r) => sum + r.searchImprovement, 0) / this.results.length;
    const avgMemory = this.results.reduce((sum, r) => sum + r.memoryReduction, 0) / this.results.length;
    
    console.log('\n📈 Performance Claims Validation:');
    console.log('-'.repeat(60));
    
    console.log('\nEntity Creation:');
    this.results.forEach(r => {
      console.log(`  ${r.entities.toLocaleString()} entities: ${r.creationImprovement.toFixed(1)}x faster`);
    });
    console.log(`  Average: ${avgCreation.toFixed(1)}x faster`);
    console.log(`  README claim: 250x faster`);
    
    if (avgCreation >= 250) {
      console.log(`  ✅ VALIDATED - Claim is accurate!`);
    } else if (avgCreation >= 200) {
      console.log(`  ⚠️  CLOSE - Within 20% of claim (${((avgCreation/250)*100).toFixed(0)}%)`);
    } else if (avgCreation >= 100) {
      console.log(`  ⚠️  PARTIAL - Significant improvement but below claim`);
    } else {
      console.log(`  ❌ NOT VALIDATED - Only ${((avgCreation/250)*100).toFixed(0)}% of claimed improvement`);
    }
    
    console.log('\nSearch Operations:');
    this.results.forEach(r => {
      console.log(`  ${r.entities.toLocaleString()} entities: ${r.searchImprovement.toFixed(1)}x faster`);
    });
    console.log(`  Average: ${avgSearch.toFixed(1)}x faster`);
    console.log(`  README claim: 15x faster`);
    
    if (avgSearch >= 15) {
      console.log(`  ✅ VALIDATED - Claim is accurate!`);
    } else if (avgSearch >= 12) {
      console.log(`  ⚠️  CLOSE - Within 20% of claim (${((avgSearch/15)*100).toFixed(0)}%)`);
    } else {
      console.log(`  ❌ NOT VALIDATED - Only ${((avgSearch/15)*100).toFixed(0)}% of claimed improvement`);
    }
    
    console.log('\nMemory Usage:');
    this.results.forEach(r => {
      console.log(`  ${r.entities.toLocaleString()} entities: ${r.memoryReduction.toFixed(1)}% less memory`);
    });
    console.log(`  Average: ${avgMemory.toFixed(1)}% less memory`);
    console.log(`  README claim: 79% less memory`);
    
    if (avgMemory >= 79) {
      console.log(`  ✅ VALIDATED - Claim is accurate!`);
    } else if (avgMemory >= 70) {
      console.log(`  ⚠️  CLOSE - Within 10% of claim`);
    } else {
      console.log(`  ❌ NOT VALIDATED - Only ${avgMemory.toFixed(1)}% reduction`);
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

async function main() {
  console.log('MCP Memory Enhanced - Focused Large Dataset Validation');
  console.log('Testing with 100K, 500K, and 1M entities');
  console.log('=' .repeat(60) + '\n');
  
  const benchmark = new FocusedBenchmark();
  await benchmark.setup();
  
  try {
    // Test with increasingly large datasets
    const datasets = [100000, 500000, 1000000];
    
    for (const size of datasets) {
      await benchmark.benchmarkLargeDataset(size);
      
      // Give system time to recover between tests
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
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