#!/usr/bin/env tsx
import { JSONStorage } from './storage/json-storage.js';
import { SQLiteStorage } from './storage/sqlite-storage.js';
import { Entity, Relation } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { performance } from 'perf_hooks';

// Test with 10,000 entities as claimed in README
const ENTITY_COUNT = 10000;

// Generate test data
function generateTestData(size: number): { entities: Entity[], relations: Relation[] } {
  const entities: Entity[] = [];
  const relations: Relation[] = [];
  
  for (let i = 0; i < size; i++) {
    const entityType = ['Person', 'Organization', 'Project'][i % 3];
    entities.push({
      name: `${entityType}_${i}`,
      entityType,
      observations: [
        `Observation 1 for ${entityType}_${i}`,
        `Observation 2 for ${entityType}_${i}`,
        `Detailed description with longer text content for testing memory usage`
      ]
    });
  }
  
  // Generate 2x relations
  for (let i = 0; i < size * 2; i++) {
    const fromIdx = Math.floor(Math.random() * size);
    const toIdx = Math.floor(Math.random() * size);
    if (fromIdx !== toIdx) {
      relations.push({
        from: entities[fromIdx].name,
        to: entities[toIdx].name,
        relationType: ['works_for', 'collaborates_with', 'manages'][i % 3]
      });
    }
  }
  
  return { entities, relations };
}

async function runBenchmark() {
  console.log('🚀 MCP Memory Enhanced - Performance Validation');
  console.log('=' .repeat(60));
  console.log(`Testing with ${ENTITY_COUNT} entities\n`);
  
  const testDir = await fs.mkdtemp(path.join(tmpdir(), 'benchmark-'));
  const { entities, relations } = generateTestData(ENTITY_COUNT);
  
  // Test 1: Entity Creation Speed
  console.log('📊 Test 1: Entity Creation Speed');
  console.log('-'.repeat(40));
  
  // JSON Backend
  const jsonStart = performance.now();
  const jsonStorage = new JSONStorage({ type: 'json', filePath: path.join(testDir, 'test.jsonl') });
  await jsonStorage.initialize();
  for (let i = 0; i < entities.length; i += 100) {
    await jsonStorage.createEntities(entities.slice(i, i + 100));
  }
  await jsonStorage.close();
  const jsonTime = performance.now() - jsonStart;
  
  // SQLite Backend
  const sqliteStart = performance.now();
  const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: path.join(testDir, 'test.db') });
  await sqliteStorage.initialize();
  for (let i = 0; i < entities.length; i += 100) {
    await sqliteStorage.createEntities(entities.slice(i, i + 100));
  }
  await sqliteStorage.close();
  const sqliteTime = performance.now() - sqliteStart;
  
  const creationSpeedup = jsonTime / sqliteTime;
  console.log(`JSON:   ${jsonTime.toFixed(2)}ms`);
  console.log(`SQLite: ${sqliteTime.toFixed(2)}ms`);
  console.log(`✨ SQLite is ${creationSpeedup.toFixed(1)}x faster\n`);
  
  // Test 2: Search Performance
  console.log('📊 Test 2: Search Performance');
  console.log('-'.repeat(40));
  
  // Pre-populate for search test
  const jsonSearch = new JSONStorage({ type: 'json', filePath: path.join(testDir, 'search.jsonl') });
  const sqliteSearch = new SQLiteStorage({ type: 'sqlite', filePath: path.join(testDir, 'search.db') });
  
  await jsonSearch.initialize();
  await jsonSearch.createEntities(entities);
  await jsonSearch.createRelations(relations);
  
  await sqliteSearch.initialize();
  await sqliteSearch.createEntities(entities);
  await sqliteSearch.createRelations(relations);
  
  // Run searches
  const searchQueries = ['Person', 'Organization', 'Project', '5000', '9999'];
  
  const jsonSearchStart = performance.now();
  for (const query of searchQueries) {
    await jsonSearch.searchEntities(query);
  }
  const jsonSearchTime = performance.now() - jsonSearchStart;
  
  const sqliteSearchStart = performance.now();
  for (const query of searchQueries) {
    await sqliteSearch.searchEntities(query);
  }
  const sqliteSearchTime = performance.now() - sqliteSearchStart;
  
  const searchSpeedup = jsonSearchTime / sqliteSearchTime;
  console.log(`JSON:   ${jsonSearchTime.toFixed(2)}ms`);
  console.log(`SQLite: ${sqliteSearchTime.toFixed(2)}ms`);
  console.log(`✨ SQLite is ${searchSpeedup.toFixed(1)}x faster\n`);
  
  await jsonSearch.close();
  await sqliteSearch.close();
  
  // Test 3: Memory Usage
  console.log('📊 Test 3: Memory Usage');
  console.log('-'.repeat(40));
  
  // Force GC if available
  if (global.gc) global.gc();
  
  const jsonMem = new JSONStorage({ type: 'json', filePath: path.join(testDir, 'memory.jsonl') });
  await jsonMem.initialize();
  await jsonMem.createEntities(entities);
  await jsonMem.createRelations(relations);
  
  if (global.gc) global.gc();
  const jsonMemUsage = process.memoryUsage();
  await jsonMem.close();
  
  const sqliteMem = new SQLiteStorage({ type: 'sqlite', filePath: path.join(testDir, 'memory.db') });
  await sqliteMem.initialize();
  await sqliteMem.createEntities(entities);
  await sqliteMem.createRelations(relations);
  
  if (global.gc) global.gc();
  const sqliteMemUsage = process.memoryUsage();
  await sqliteMem.close();
  
  const memReduction = ((jsonMemUsage.heapUsed - sqliteMemUsage.heapUsed) / jsonMemUsage.heapUsed) * 100;
  console.log(`JSON:   ${(jsonMemUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`SQLite: ${(sqliteMemUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  console.log(`✨ SQLite uses ${memReduction.toFixed(1)}% less memory\n`);
  
  // Test 4: Storage Size
  console.log('📊 Test 4: Storage Size');
  console.log('-'.repeat(40));
  
  const jsonPath = path.join(testDir, 'size.jsonl');
  const sqlitePath = path.join(testDir, 'size.db');
  
  const jsonSize = new JSONStorage({ type: 'json', filePath: jsonPath });
  await jsonSize.initialize();
  await jsonSize.createEntities(entities);
  await jsonSize.createRelations(relations);
  await jsonSize.close();
  
  const sqliteSize = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
  await sqliteSize.initialize();
  await sqliteSize.createEntities(entities);
  await sqliteSize.createRelations(relations);
  await sqliteSize.close();
  
  const jsonStats = await fs.stat(jsonPath);
  const sqliteStats = await fs.stat(sqlitePath);
  
  const sizeReduction = ((jsonStats.size - sqliteStats.size) / jsonStats.size) * 100;
  console.log(`JSON:   ${(jsonStats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`SQLite: ${(sqliteStats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`✨ SQLite is ${sizeReduction.toFixed(1)}% smaller\n`);
  
  // Summary
  console.log('=' .repeat(60));
  console.log('📈 PERFORMANCE SUMMARY');
  console.log('=' .repeat(60));
  console.log(`Entity Creation: ${creationSpeedup.toFixed(1)}x faster (Claimed: 250x)`);
  console.log(`Search:          ${searchSpeedup.toFixed(1)}x faster (Claimed: 15x)`);
  console.log(`Memory:          ${memReduction.toFixed(1)}% less (Claimed: 79%)`);
  console.log(`Storage:         ${sizeReduction.toFixed(1)}% smaller (Claimed: 30%)`);
  console.log('=' .repeat(60));
  
  // Cleanup
  await fs.rm(testDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);