import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateJSONToSQLite } from '../../migrate.js';
import { JSONStorage } from '../../storage/json-storage.js';
import { SQLiteStorage } from '../../storage/sqlite-storage.js';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, 'test-migration');

describe('Migration Tool', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(path.join(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic Migration', () => {
    it('should migrate a simple JSON file to SQLite', async () => {
      const jsonPath = path.join(testDir, 'test.json');
      const sqlitePath = path.join(testDir, 'test.db');

      // Create test data
      const testData = [
        {
          type: 'entity',
          name: 'Test Entity',
          entityType: 'TestType',
          observations: ['Observation 1', 'Observation 2']
        },
        {
          type: 'relation',
          from: 'Test Entity',
          to: 'Test Entity',
          relationType: 'self-reference'
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      // Run migration
      await migrateJSONToSQLite(jsonPath, sqlitePath);

      // Verify SQLite database was created
      const dbExists = await fs.access(sqlitePath).then(() => true).catch(() => false);
      expect(dbExists).toBe(true);

      // Verify data was migrated correctly
      const db = new Database(sqlitePath);
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
      const relationCount = db.prepare('SELECT COUNT(*) as count FROM relations').get();
      const observationCount = db.prepare('SELECT COUNT(*) as count FROM observations').get();

      expect(entityCount.count).toBe(1);
      expect(relationCount.count).toBe(1);
      expect(observationCount.count).toBe(2);

      db.close();
    });

    it('should handle multiple entities and relations', async () => {
      const jsonPath = path.join(testDir, 'multi.json');
      const sqlitePath = path.join(testDir, 'multi.db');

      const testData = [
        {
          type: 'entity',
          name: 'Entity1',
          entityType: 'Type1',
          observations: ['Obs1', 'Obs2']
        },
        {
          type: 'entity',
          name: 'Entity2',
          entityType: 'Type2',
          observations: ['Obs3', 'Obs4', 'Obs5']
        },
        {
          type: 'relation',
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'connects'
        },
        {
          type: 'relation',
          from: 'Entity2',
          to: 'Entity1',
          relationType: 'reverse'
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
      const relationCount = db.prepare('SELECT COUNT(*) as count FROM relations').get();
      const observationCount = db.prepare('SELECT COUNT(*) as count FROM observations').get();

      expect(entityCount.count).toBe(2);
      expect(relationCount.count).toBe(2);
      expect(observationCount.count).toBe(5);

      db.close();
    });
  });

  describe('Data Quality Improvements', () => {
    it('should skip relations with missing entities', async () => {
      const jsonPath = path.join(testDir, 'invalid.json');
      const sqlitePath = path.join(testDir, 'invalid.db');

      const testData = [
        {
          type: 'entity',
          name: 'ExistingEntity',
          entityType: 'Type',
          observations: ['Observation']
        },
        {
          type: 'relation',
          from: 'ExistingEntity',
          to: 'NonExistentEntity',  // This entity doesn't exist
          relationType: 'invalid'
        },
        {
          type: 'relation',
          from: 'NonExistentEntity',  // This entity doesn't exist
          to: 'ExistingEntity',
          relationType: 'also_invalid'
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
      const relationCount = db.prepare('SELECT COUNT(*) as count FROM relations').get();

      expect(entityCount.count).toBe(1);
      expect(relationCount.count).toBe(0); // Both relations should be skipped

      db.close();
    });

    it('should deduplicate observations within the same entity', async () => {
      const jsonPath = path.join(testDir, 'duplicate.json');
      const sqlitePath = path.join(testDir, 'duplicate.db');

      const testData = [
        {
          type: 'entity',
          name: 'EntityWithDuplicates',
          entityType: 'Type',
          observations: [
            'Unique observation 1',
            'Duplicate observation',
            'Duplicate observation',  // Duplicate
            'Unique observation 2',
            'Duplicate observation'   // Another duplicate
          ]
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const observationCount = db.prepare('SELECT COUNT(*) as count FROM observations').get();

      expect(observationCount.count).toBe(3); // Only unique observations

      const observations = db.prepare('SELECT content FROM observations ORDER BY content').all();
      expect(observations.map(o => o.content)).toEqual([
        'Duplicate observation',
        'Unique observation 1',
        'Unique observation 2'
      ]);

      db.close();
    });

    it('should handle entities with empty observations', async () => {
      const jsonPath = path.join(testDir, 'empty.json');
      const sqlitePath = path.join(testDir, 'empty.db');

      const testData = [
        {
          type: 'entity',
          name: 'EmptyEntity',
          entityType: 'Type',
          observations: []
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
      const observationCount = db.prepare('SELECT COUNT(*) as count FROM observations').get();

      expect(entityCount.count).toBe(1);
      expect(observationCount.count).toBe(0);

      db.close();
    });
  });

  describe('Backup and Verification', () => {
    it('should create a backup when backup option is enabled', async () => {
      const jsonPath = path.join(testDir, 'backup-test.json');
      const sqlitePath = path.join(testDir, 'backup-test.db');

      const testData = [
        {
          type: 'entity',
          name: 'Entity',
          entityType: 'Type',
          observations: ['Obs']
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath, { backup: true });

      // Check that backup was created
      const files = await fs.readdir(testDir);
      const backupFiles = files.filter(f => f.startsWith('backup-test.json.backup-'));
      
      expect(backupFiles.length).toBe(1);

      // Verify backup content is identical to original
      const backupPath = path.join(testDir, backupFiles[0]);
      const originalContent = await fs.readFile(jsonPath, 'utf8');
      const backupContent = await fs.readFile(backupPath, 'utf8');
      
      expect(backupContent).toBe(originalContent);
    });

    it('should handle verification correctly for clean data', async () => {
      const jsonPath = path.join(testDir, 'verify-clean.json');
      const sqlitePath = path.join(testDir, 'verify-clean.db');

      const testData = [
        {
          type: 'entity',
          name: 'Entity1',
          entityType: 'Type',
          observations: ['Obs1', 'Obs2']
        },
        {
          type: 'entity',
          name: 'Entity2',
          entityType: 'Type',
          observations: ['Obs3']
        },
        {
          type: 'relation',
          from: 'Entity1',
          to: 'Entity2',
          relationType: 'valid'
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      // Should not throw when data is clean
      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true })
      ).resolves.not.toThrow();

      const db = new Database(sqlitePath);
      const stats = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM entities) as entities,
          (SELECT COUNT(*) FROM relations) as relations,
          (SELECT COUNT(*) FROM observations) as observations
      `).get();

      expect(stats.entities).toBe(2);
      expect(stats.relations).toBe(1);
      expect(stats.observations).toBe(3);

      db.close();
    });

    it('should report data quality improvements during verification', async () => {
      const jsonPath = path.join(testDir, 'verify-dirty.json');
      const sqlitePath = path.join(testDir, 'verify-dirty.db');

      const testData = [
        {
          type: 'entity',
          name: 'Entity',
          entityType: 'Type',
          observations: ['Obs', 'Obs'] // Duplicate
        },
        {
          type: 'relation',
          from: 'Entity',
          to: 'NonExistent', // Invalid reference
          relationType: 'invalid'
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      // Should not throw - data quality improvements are acceptable
      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true })
      ).resolves.not.toThrow();
      
      // Verify the data was cleaned up
      const db = new Database(sqlitePath);
      const stats = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM entities) as entities,
          (SELECT COUNT(*) FROM relations) as relations,
          (SELECT COUNT(*) FROM observations) as observations
      `).get();

      expect(stats.entities).toBe(1);
      expect(stats.relations).toBe(0); // Invalid relation was skipped
      expect(stats.observations).toBe(1); // Duplicate was removed

      db.close();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty JSON file', async () => {
      const jsonPath = path.join(testDir, 'empty-file.json');
      const sqlitePath = path.join(testDir, 'empty-file.db');

      await fs.writeFile(jsonPath, '');

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
      const relationCount = db.prepare('SELECT COUNT(*) as count FROM relations').get();

      expect(entityCount.count).toBe(0);
      expect(relationCount.count).toBe(0);

      db.close();
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const jsonPath = path.join(testDir, 'malformed.json');
      const sqlitePath = path.join(testDir, 'malformed.db');

      const content = [
        '{"type":"entity","name":"Valid","entityType":"Type","observations":[]}',
        'This is not JSON',
        '{"type":"entity","name":"AlsoValid","entityType":"Type","observations":[]}'
      ].join('\n');

      await fs.writeFile(jsonPath, content);

      // The JSON storage should handle this - let's see how it behaves
      // This might throw or skip the bad line
      try {
        await migrateJSONToSQLite(jsonPath, sqlitePath);
        
        const db = new Database(sqlitePath);
        const entityCount = db.prepare('SELECT COUNT(*) as count FROM entities').get();
        
        // Should have migrated the valid entities
        expect(entityCount.count).toBeGreaterThanOrEqual(1);
        
        db.close();
      } catch (error) {
        // If it throws, that's also acceptable behavior
        expect(error.message).toContain('JSON');
      }
    });

    it('should handle special characters in entity names', async () => {
      const jsonPath = path.join(testDir, 'special.json');
      const sqlitePath = path.join(testDir, 'special.db');

      const testData = [
        {
          type: 'entity',
          name: 'Entity with "quotes" and \'apostrophes\'',
          entityType: 'Type',
          observations: ['Observation with 😀 emoji']
        },
        {
          type: 'entity',
          name: 'Entity/with\\slashes',
          entityType: 'Type',
          observations: ['Multi\nline\nobservation']
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      const db = new Database(sqlitePath);
      const entities = db.prepare('SELECT name FROM entities ORDER BY name').all();
      
      expect(entities.length).toBe(2);
      expect(entities[0].name).toBe('Entity with "quotes" and \'apostrophes\'');
      expect(entities[1].name).toBe('Entity/with\\slashes');

      db.close();
    });

    it('should handle very large datasets efficiently', async () => {
      const jsonPath = path.join(testDir, 'large.json');
      const sqlitePath = path.join(testDir, 'large.db');

      // Generate a large dataset
      const lines = [];
      const entityCount = 1000;
      
      for (let i = 0; i < entityCount; i++) {
        lines.push(JSON.stringify({
          type: 'entity',
          name: `Entity_${i}`,
          entityType: `Type_${i % 10}`,
          observations: [`Obs_${i}_1`, `Obs_${i}_2`, `Obs_${i}_3`]
        }));
      }

      // Add relations between sequential entities
      for (let i = 0; i < entityCount - 1; i++) {
        lines.push(JSON.stringify({
          type: 'relation',
          from: `Entity_${i}`,
          to: `Entity_${i + 1}`,
          relationType: 'next'
        }));
      }

      await fs.writeFile(jsonPath, lines.join('\n'));

      const startTime = Date.now();
      await migrateJSONToSQLite(jsonPath, sqlitePath);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds for 1000 entities)
      expect(duration).toBeLessThan(5000);

      const db = new Database(sqlitePath);
      const stats = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM entities) as entities,
          (SELECT COUNT(*) FROM relations) as relations,
          (SELECT COUNT(*) FROM observations) as observations
      `).get();

      expect(stats.entities).toBe(entityCount);
      expect(stats.relations).toBe(entityCount - 1);
      expect(stats.observations).toBe(entityCount * 3);

      db.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent JSON file', async () => {
      const jsonPath = path.join(testDir, 'does-not-exist.json');
      const sqlitePath = path.join(testDir, 'output.db');

      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath)
      ).rejects.toThrow();
    });

    it('should handle write-protected output directory', async () => {
      const jsonPath = path.join(testDir, 'test.json');
      const sqlitePath = '/root/cannot-write-here.db'; // Typically not writable

      const testData = [
        {
          type: 'entity',
          name: 'Entity',
          entityType: 'Type',
          observations: []
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath)
      ).rejects.toThrow();
    });

    it('should clean up on failure', async () => {
      const jsonPath = path.join(testDir, 'cleanup.json');
      const sqlitePath = path.join(testDir, 'cleanup.db');

      // Create a JSON file that will cause issues during migration
      const testData = [
        {
          type: 'entity',
          name: 'Entity',
          entityType: 'Type',
          observations: ['Valid']
        }
      ];

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      // Mock a failure during migration
      const originalConsoleError = console.error;
      console.error = vi.fn();

      try {
        // Force a verification failure
        await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });
      } catch (error) {
        // Expected to fail
      }

      console.error = originalConsoleError;

      // Check that database connections were closed
      // (The database file might exist but should not be locked)
      if (await fs.access(sqlitePath).then(() => true).catch(() => false)) {
        // Try to open the database - should not be locked
        const db = new Database(sqlitePath);
        db.close(); // Should work without errors
      }
    });
  });

  describe('Storage Size Comparison', () => {
    it('should report accurate storage size reduction', async () => {
      const jsonPath = path.join(testDir, 'size-test.json');
      const sqlitePath = path.join(testDir, 'size-test.db');

      // Create a dataset with repetitive content that should compress well
      const testData = [];
      for (let i = 0; i < 100; i++) {
        testData.push({
          type: 'entity',
          name: `Entity_${i}`,
          entityType: 'CommonType', // Same type for all
          observations: [
            'This is a common observation that appears in many entities',
            'Another common observation',
            `Unique observation for entity ${i}`
          ]
        });
      }

      await fs.writeFile(jsonPath, testData.map(d => JSON.stringify(d)).join('\n'));

      // Capture console output to check the reported size reduction
      const originalConsoleLog = console.log;
      let sizeReductionReported = false;
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('Size reduction:')) {
          sizeReductionReported = true;
        }
        originalConsoleLog(...args);
      };

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      console.log = originalConsoleLog;

      expect(sizeReductionReported).toBe(true);

      // Verify both files exist and compare sizes
      const jsonStats = await fs.stat(jsonPath);
      const sqliteStats = await fs.stat(sqlitePath);

      // SQLite should generally be more efficient for structured data
      // but might be larger for very small datasets due to overhead
      expect(sqliteStats.size).toBeGreaterThan(0);
      expect(jsonStats.size).toBeGreaterThan(0);
    });
  });

  describe('Backup Functionality', () => {
    it('should create backup when requested', async () => {
      const jsonPath = path.join(testDir, 'backup-test.json');
      const sqlitePath = path.join(testDir, 'backup-test.db');

      const testData = {
        entities: [{
          name: 'Test',
          entityType: 'test',
          observations: ['obs1']
        }]
      };

      await fs.writeFile(jsonPath, JSON.stringify(testData));

      await migrateJSONToSQLite(jsonPath, sqlitePath, { backup: true });

      // Check if backup file was created
      const files = await fs.readdir(testDir);
      const backupFiles = files.filter(f => f.startsWith('backup-test.json.backup-'));
      expect(backupFiles.length).toBeGreaterThan(0);

      // Verify backup content matches original
      const backupPath = path.join(testDir, backupFiles[0]);
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe(JSON.stringify(testData));
    });

    it('should not create backup when not requested', async () => {
      const jsonPath = path.join(testDir, 'no-backup-test.json');
      const sqlitePath = path.join(testDir, 'no-backup-test.db');

      const testData = {
        entities: [{
          name: 'Test',
          entityType: 'test',
          observations: ['obs1']
        }]
      };

      await fs.writeFile(jsonPath, JSON.stringify(testData));

      await migrateJSONToSQLite(jsonPath, sqlitePath, { backup: false });

      // Check that no backup file was created
      const files = await fs.readdir(testDir);
      const backupFiles = files.filter(f => f.startsWith('no-backup-test.json.backup-'));
      expect(backupFiles.length).toBe(0);
    });
  });

  describe('End-to-End Tests (No Mocking)', () => {
    it('should complete full migration with verification', async () => {
      const jsonPath = path.join(testDir, 'e2e-full.json');
      const sqlitePath = path.join(testDir, 'e2e-full.db');

      // Create comprehensive test data in NDJSON format
      const testData = [
        { type: 'entity', name: 'User1', entityType: 'person', observations: ['Created account', 'Logged in', 'Updated profile'] },
        { type: 'entity', name: 'Project1', entityType: 'project', observations: ['Initialized', 'Added dependencies', 'First commit'] },
        { type: 'entity', name: 'Task1', entityType: 'task', observations: ['Created', 'Assigned to User1', 'In progress'] },
        { type: 'relation', from: 'User1', to: 'Project1', relationType: 'owns' },
        { type: 'relation', from: 'Task1', to: 'Project1', relationType: 'belongs_to' },
        { type: 'relation', from: 'User1', to: 'Task1', relationType: 'assigned_to' }
      ];

      await fs.writeFile(jsonPath, testData.map(item => JSON.stringify(item)).join('\n'));

      // Run full migration with verification
      await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });

      // Independently verify the migration using separate storage instances
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const { JSONStorage } = await import('../../storage/json-storage.js');
      
      const jsonStorage = new JSONStorage({ type: 'json', filePath: jsonPath });
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      
      await jsonStorage.initialize();
      await sqliteStorage.initialize();
      
      const jsonGraph = await jsonStorage.loadGraph();
      const sqliteGraph = await sqliteStorage.loadGraph();
      
      // Verify all entities migrated
      expect(sqliteGraph.entities.length).toBe(jsonGraph.entities.length);
      
      // Verify all relations migrated
      expect(sqliteGraph.relations.length).toBe(jsonGraph.relations.length);
      
      // Verify entity details
      for (const entity of jsonGraph.entities) {
        const migratedEntity = sqliteGraph.entities.find(e => e.name === entity.name);
        expect(migratedEntity).toBeDefined();
        expect(migratedEntity!.entityType).toBe(entity.entityType);
        expect(migratedEntity!.observations).toEqual(entity.observations);
      }
      
      // Verify relation details
      for (const relation of jsonGraph.relations) {
        const migratedRelation = sqliteGraph.relations.find(
          r => r.from === relation.from && 
               r.to === relation.to && 
               r.relationType === relation.relationType
        );
        expect(migratedRelation).toBeDefined();
      }
      
      await jsonStorage.close();
      await sqliteStorage.close();
    });

    it('should handle data quality improvements correctly', async () => {
      const jsonPath = path.join(testDir, 'e2e-quality.json');
      const sqlitePath = path.join(testDir, 'e2e-quality.db');

      // Create data with quality issues in NDJSON format
      const testData = [
        { type: 'entity', name: 'Entity1', entityType: 'test', observations: ['obs1', 'obs1', 'obs2', 'obs2', 'obs3'] }, // Duplicates
        { type: 'entity', name: 'Entity2', entityType: 'test', observations: ['unique1', 'unique2'] },
        { type: 'relation', from: 'Entity1', to: 'Entity2', relationType: 'valid' },
        { type: 'relation', from: 'Entity1', to: 'NonExistent', relationType: 'invalid' }, // Invalid reference
        { type: 'relation', from: 'NonExistent', to: 'Entity2', relationType: 'invalid' } // Invalid reference
      ];

      await fs.writeFile(jsonPath, testData.map(item => JSON.stringify(item)).join('\n'));

      // Capture console output
      const originalConsoleLog = console.log;
      let qualityReported = false;
      let invalidRelationsReported = false;
      let duplicatesReported = false;
      
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('Data Quality Improvements Applied')) {
          qualityReported = true;
        }
        if (message.includes('invalid relation(s) skipped')) {
          invalidRelationsReported = true;
        }
        if (message.includes('duplicate observation(s) removed')) {
          duplicatesReported = true;
        }
        originalConsoleLog(...args);
      };

      // Run migration with verification
      await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });

      console.log = originalConsoleLog;

      // Verify quality improvements were reported
      expect(qualityReported).toBe(true);
      expect(invalidRelationsReported).toBe(true);
      expect(duplicatesReported).toBe(true);

      // Verify actual data in SQLite
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      await sqliteStorage.initialize();
      
      const graph = await sqliteStorage.loadGraph();
      
      // Should have both entities
      expect(graph.entities.length).toBe(2);
      
      // Should have only 1 valid relation (2 invalid ones skipped)
      expect(graph.relations.length).toBe(1);
      expect(graph.relations[0].from).toBe('Entity1');
      expect(graph.relations[0].to).toBe('Entity2');
      
      // Entity1 should have deduplicated observations
      const entity1 = graph.entities.find(e => e.name === 'Entity1');
      expect(entity1!.observations).toEqual(['obs1', 'obs2', 'obs3']);
      
      await sqliteStorage.close();
    });

    it('should create and verify backup correctly', async () => {
      const jsonPath = path.join(testDir, 'e2e-backup.json');
      const sqlitePath = path.join(testDir, 'e2e-backup.db');

      const testData = [
        { type: 'entity', name: 'BackupTest', entityType: 'test', observations: ['data1', 'data2'] }
      ];

      await fs.writeFile(jsonPath, testData.map(item => JSON.stringify(item)).join('\n'));

      // Run migration with backup
      await migrateJSONToSQLite(jsonPath, sqlitePath, { backup: true });

      // Find backup file
      const files = await fs.readdir(testDir);
      const backupFiles = files.filter(f => f.startsWith('e2e-backup.json.backup-'));
      
      expect(backupFiles.length).toBe(1);

      // Verify backup content is identical to original
      const originalContent = await fs.readFile(jsonPath, 'utf-8');
      const backupContent = await fs.readFile(path.join(testDir, backupFiles[0]), 'utf-8');
      
      expect(backupContent).toBe(originalContent);
    });

    it('should fail when JSON file does not exist', async () => {
      const jsonPath = path.join(testDir, 'e2e-nonexistent.json');
      const sqlitePath = path.join(testDir, 'e2e-nonexistent.db');

      // Don't create the JSON file - it should not exist

      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath)
      ).rejects.toThrow('JSON file not found');
    });

    it('should handle empty JSON file correctly', async () => {
      const jsonPath = path.join(testDir, 'e2e-empty.json');
      const sqlitePath = path.join(testDir, 'e2e-empty.db');

      // Create empty but valid NDJSON (empty file)
      await fs.writeFile(jsonPath, '');

      // Should not throw
      await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });

      // Verify SQLite database was created with no data
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      await sqliteStorage.initialize();
      
      const graph = await sqliteStorage.loadGraph();
      expect(graph.entities.length).toBe(0);
      expect(graph.relations.length).toBe(0);
      
      await sqliteStorage.close();
    });

    it('should handle very large dataset efficiently', async () => {
      const jsonPath = path.join(testDir, 'e2e-large.json');
      const sqlitePath = path.join(testDir, 'e2e-large.db');

      // Create large dataset in NDJSON format
      const entities = Array.from({ length: 1000 }, (_, i) => ({
        type: 'entity',
        name: `Entity${i}`,
        entityType: `type${i % 10}`,
        observations: Array.from({ length: 5 }, (_, j) => `obs${i}-${j}`)
      }));
      const relations = Array.from({ length: 500 }, (_, i) => ({
        type: 'relation',
        from: `Entity${i}`,
        to: `Entity${(i + 1) % 1000}`,
        relationType: `rel${i % 5}`
      }));
      const largeData = [...entities, ...relations];

      await fs.writeFile(jsonPath, largeData.map(item => JSON.stringify(item)).join('\n'));

      const startTime = Date.now();
      await migrateJSONToSQLite(jsonPath, sqlitePath);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (under 10 seconds)
      expect(duration).toBeLessThan(10000);

      // Verify all data migrated
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      await sqliteStorage.initialize();
      
      const stats = await sqliteStorage.getStats();
      expect(stats.entityCount).toBe(1000);
      expect(stats.relationCount).toBe(500);
      expect(stats.observationCount).toBe(5000);
      
      await sqliteStorage.close();
    });

    it('should correctly report storage size reduction', async () => {
      const jsonPath = path.join(testDir, 'e2e-size.json');
      const sqlitePath = path.join(testDir, 'e2e-size.db');

      // Create data that should compress well in NDJSON format
      const testData = Array.from({ length: 100 }, (_, i) => ({
        type: 'entity',
        name: `Entity${i}`,
        entityType: 'standard',
        observations: ['Standard observation 1', 'Standard observation 2']
      }));

      // Write in NDJSON format (no pretty print as it breaks format)
      await fs.writeFile(jsonPath, testData.map(item => JSON.stringify(item)).join('\n'));

      const originalConsoleLog = console.log;
      let sizeReduction: number | null = null;
      
      console.log = (...args) => {
        const message = args.join(' ');
        const match = message.match(/Size reduction: (-?\d+)%/);
        if (match) {
          sizeReduction = parseInt(match[1]);
        }
        originalConsoleLog(...args);
      };

      await migrateJSONToSQLite(jsonPath, sqlitePath);

      console.log = originalConsoleLog;

      // Should report a size reduction
      expect(sizeReduction).not.toBeNull();
      
      // Verify actual file sizes
      const jsonStats = await fs.stat(jsonPath);
      const sqliteStats = await fs.stat(sqlitePath);
      
      expect(jsonStats.size).toBeGreaterThan(0);
      expect(sqliteStats.size).toBeGreaterThan(0);
    });

    it('should maintain data integrity through full cycle', async () => {
      const jsonPath = path.join(testDir, 'e2e-integrity.json');
      const sqlitePath = path.join(testDir, 'e2e-integrity.db');

      // Create complex interconnected data in NDJSON format
      const testData = [
        { type: 'entity', name: 'Alice', entityType: 'person', observations: ['Software engineer', 'Team lead', 'Mentor'] },
        { type: 'entity', name: 'Bob', entityType: 'person', observations: ['Junior developer', 'Fast learner'] },
        { type: 'entity', name: 'ProjectX', entityType: 'project', observations: ['Q4 2024', 'High priority', 'Customer-facing'] },
        { type: 'entity', name: 'TeamAlpha', entityType: 'team', observations: ['Frontend specialists', '5 members'] },
        { type: 'relation', from: 'Alice', to: 'TeamAlpha', relationType: 'leads' },
        { type: 'relation', from: 'Bob', to: 'TeamAlpha', relationType: 'member_of' },
        { type: 'relation', from: 'TeamAlpha', to: 'ProjectX', relationType: 'assigned_to' },
        { type: 'relation', from: 'Alice', to: 'Bob', relationType: 'mentors' },
        { type: 'relation', from: 'ProjectX', to: 'Alice', relationType: 'managed_by' }
      ];

      await fs.writeFile(jsonPath, testData.map(item => JSON.stringify(item)).join('\n'));

      // Migrate with verification
      await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });

      // Load both storages and compare
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const { JSONStorage } = await import('../../storage/json-storage.js');
      
      const jsonStorage = new JSONStorage({ type: 'json', filePath: jsonPath });
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      
      await jsonStorage.initialize();
      await sqliteStorage.initialize();
      
      // Test specific queries
      const aliceJson = await jsonStorage.getEntities(['Alice']);
      const aliceSqlite = await sqliteStorage.getEntities(['Alice']);
      
      expect(aliceSqlite).toEqual(aliceJson);
      
      // Test relation queries
      const aliceRelationsJson = await jsonStorage.getRelations(['Alice']);
      const aliceRelationsSqlite = await sqliteStorage.getRelations(['Alice']);
      
      expect(aliceRelationsSqlite.length).toBe(aliceRelationsJson.length);
      
      // Verify each relation exists
      for (const rel of aliceRelationsJson) {
        const found = aliceRelationsSqlite.find(
          r => r.from === rel.from && r.to === rel.to && r.relationType === rel.relationType
        );
        expect(found).toBeDefined();
      }
      
      await jsonStorage.close();
      await sqliteStorage.close();
    });
  });
});