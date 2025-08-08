#!/usr/bin/env tsx
/**
 * Simple large dataset benchmark focusing on core metrics
 */

import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import { Entity } from '../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

async function benchmark(size: number) {
  const testDir = await fs.mkdtemp(path.join(tmpdir(), 'bench-'));
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing ${size.toLocaleString()} entities`);
  console.log(`${'='.repeat(80)}`);
  
  // Generate test data in batches
  function generateBatch(start: number, batchSize: number): Entity[] {
    const entities: Entity[] = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = start + i;
      entities.push({
        name: `Entity_${idx}`,
        entityType: ['Person', 'Org', 'Project'][idx % 3],
        observations: [
          `Primary data for Entity_${idx} with extensive details`,
          `Secondary data including relationships and metadata for Entity_${idx}`,
          `Tertiary observations with analysis and metrics for Entity_${idx}`,
          `Additional context and historical information about Entity_${idx}`,
          `Extended attributes and properties of Entity_${idx}`
        ]
      });
    }
    return entities;
  }
  
  const batchSize = 10000;
  const numBatches = Math.ceil(size / batchSize);
  
  // Benchmark JSON
  console.log('\nJSON Storage:');
  const jsonPath = path.join(testDir, 'test.json');
  const jsonStorage = new JSONStorage(jsonPath);
  await jsonStorage.initialize();
  
  const jsonStart = performance.now();
  const jsonMemBefore = process.memoryUsage().heapUsed / (1024 * 1024);
  
  for (let i = 0; i < numBatches; i++) {
    const batch = generateBatch(i * batchSize, Math.min(batchSize, size - i * batchSize));
    await jsonStorage.createEntities(batch);
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  ${((i + 1) * batchSize).toLocaleString()}...`);
    }
  }
  console.log('');
  
  const jsonEnd = performance.now();
  const jsonMemAfter = process.memoryUsage().heapUsed / (1024 * 1024);
  const jsonTime = (jsonEnd - jsonStart) / 1000;
  const jsonMem = jsonMemAfter - jsonMemBefore;
  
  await jsonStorage.close();
  
  // Check file size
  let jsonFileSize = 0;
  try {
    const stats = await fs.stat(jsonPath);
    jsonFileSize = stats.size / (1024 * 1024);
  } catch (e) {}
  
  console.log(`  Time: ${jsonTime.toFixed(2)}s`);
  console.log(`  Memory: ${jsonMem.toFixed(2)}MB`);
  console.log(`  File size: ${jsonFileSize.toFixed(2)}MB`);
  
  // Force GC
  if (global.gc) global.gc();
  
  // Benchmark SQLite
  console.log('\nSQLite Storage:');
  const sqlitePath = path.join(testDir, 'test.db');
  const sqliteStorage = new SQLiteStorage(sqlitePath);
  await sqliteStorage.initialize();
  
  const sqliteStart = performance.now();
  const sqliteMemBefore = process.memoryUsage().heapUsed / (1024 * 1024);
  
  for (let i = 0; i < numBatches; i++) {
    const batch = generateBatch(i * batchSize, Math.min(batchSize, size - i * batchSize));
    await sqliteStorage.createEntities(batch);
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  ${((i + 1) * batchSize).toLocaleString()}...`);
    }
  }
  console.log('');
  
  const sqliteEnd = performance.now();
  const sqliteMemAfter = process.memoryUsage().heapUsed / (1024 * 1024);
  const sqliteTime = (sqliteEnd - sqliteStart) / 1000;
  const sqliteMem = sqliteMemAfter - sqliteMemBefore;
  
  await sqliteStorage.close();
  
  // Check file size
  let sqliteFileSize = 0;
  try {
    const stats = await fs.stat(sqlitePath);
    sqliteFileSize = stats.size / (1024 * 1024);
  } catch (e) {}
  
  console.log(`  Time: ${sqliteTime.toFixed(2)}s`);
  console.log(`  Memory: ${sqliteMem.toFixed(2)}MB`);
  console.log(`  File size: ${sqliteFileSize.toFixed(2)}MB`);
  
  // Search benchmark
  console.log('\nSearch Performance (1000 searches):');
  
  // Prepare search terms
  const searchTerms: string[] = [];
  for (let i = 0; i < 1000; i++) {
    searchTerms.push(`Entity_${Math.floor(Math.random() * size)}`);
  }
  
  // JSON search
  const jsonSearch = new JSONStorage(jsonPath);
  await jsonSearch.initialize();
  const jsonSearchStart = performance.now();
  for (const term of searchTerms) {
    await jsonSearch.searchEntities(term);
  }
  const jsonSearchTime = performance.now() - jsonSearchStart;
  await jsonSearch.close();
  
  // SQLite search
  const sqliteSearch = new SQLiteStorage(sqlitePath);
  await sqliteSearch.initialize();
  const sqliteSearchStart = performance.now();
  for (const term of searchTerms) {
    await sqliteSearch.searchEntities(term);
  }
  const sqliteSearchTime = performance.now() - sqliteSearchStart;
  await sqliteSearch.close();
  
  console.log(`  JSON: ${(jsonSearchTime / 1000).toFixed(2)}s`);
  console.log(`  SQLite: ${(sqliteSearchTime / 1000).toFixed(2)}s`);
  
  // Results
  const creationImprovement = jsonTime / sqliteTime;
  const searchImprovement = jsonSearchTime / sqliteSearchTime;
  const memoryReduction = ((jsonMem - sqliteMem) / jsonMem) * 100;
  const storageReduction = ((jsonFileSize - sqliteFileSize) / jsonFileSize) * 100;
  
  console.log(`\n✨ Performance Improvements:`);
  console.log(`  Entity creation: ${creationImprovement.toFixed(1)}x faster`);
  console.log(`  Search: ${searchImprovement.toFixed(1)}x faster`);
  console.log(`  Memory: ${memoryReduction.toFixed(1)}% less`);
  console.log(`  Storage: ${storageReduction.toFixed(1)}% smaller`);
  
  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true });
  
  return {
    size,
    creationImprovement,
    searchImprovement,
    memoryReduction,
    storageReduction
  };
}

async function main() {
  console.log('MCP Memory Enhanced - Large Dataset Performance Validation');
  console.log('=' .repeat(60));
  
  const results = [];
  
  // Test with large datasets
  for (const size of [100000, 500000, 1000000]) {
    try {
      const result = await benchmark(size);
      results.push(result);
      
      // Give system time to recover
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`Error benchmarking ${size}:`, error);
    }
  }
  
  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('VALIDATION SUMMARY');
  console.log(`${'='.repeat(80)}`);
  
  if (results.length > 0) {
    const avgCreation = results.reduce((sum, r) => sum + r.creationImprovement, 0) / results.length;
    const avgSearch = results.reduce((sum, r) => sum + r.searchImprovement, 0) / results.length;
    const avgMemory = results.reduce((sum, r) => sum + r.memoryReduction, 0) / results.length;
    const avgStorage = results.reduce((sum, r) => sum + r.storageReduction, 0) / results.length;
    
    console.log('\nAverage Improvements Across All Tests:');
    console.log(`  Entity Creation: ${avgCreation.toFixed(1)}x faster`);
    console.log(`    README claims: 250x`);
    console.log(`    Status: ${avgCreation >= 250 ? '✅ VALIDATED' : avgCreation >= 200 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    
    console.log(`\n  Search: ${avgSearch.toFixed(1)}x faster`);
    console.log(`    README claims: 15x`);
    console.log(`    Status: ${avgSearch >= 15 ? '✅ VALIDATED' : avgSearch >= 12 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    
    console.log(`\n  Memory: ${avgMemory.toFixed(1)}% less`);
    console.log(`    README claims: 79%`);
    console.log(`    Status: ${avgMemory >= 79 ? '✅ VALIDATED' : avgMemory >= 70 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
    
    console.log(`\n  Storage: ${avgStorage.toFixed(1)}% smaller`);
    console.log(`    README claims: 30%`);
    console.log(`    Status: ${avgStorage >= 30 ? '✅ VALIDATED' : avgStorage >= 25 ? '⚠️ CLOSE' : '❌ NOT VALIDATED'}`);
  }
  
  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);