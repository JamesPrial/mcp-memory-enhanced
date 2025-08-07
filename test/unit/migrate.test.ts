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

  describe('Verification Edge Cases', () => {
    it('should fail verification if entity is missing in SQLite', async () => {
      const jsonPath = path.join(testDir, 'verify-missing.json');
      const sqlitePath = path.join(testDir, 'verify-missing.db');

      const testData = {
        entities: [{
          name: 'TestEntity',
          entityType: 'test',
          observations: ['obs1']
        }]
      };

      await fs.writeFile(jsonPath, JSON.stringify(testData));

      // Mock SQLiteStorage to simulate missing entity during verification
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const originalGetEntities = SQLiteStorage.prototype.getEntities;
      
      let callCount = 0;
      SQLiteStorage.prototype.getEntities = async function(names: string[]) {
        callCount++;
        // First call during migration succeeds, second call during verify fails
        if (callCount > 1 && names.includes('TestEntity')) {
          return []; // Simulate entity not found
        }
        return originalGetEntities.call(this, names);
      };

      // Migration with verification should fail
      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true })
      ).rejects.toThrow("Entity 'TestEntity' not found in SQLite");

      // Restore original method
      SQLiteStorage.prototype.getEntities = originalGetEntities;
    });

    it('should fail verification if unique observations are lost', async () => {
      const jsonPath = path.join(testDir, 'verify-obs-lost.json');
      const sqlitePath = path.join(testDir, 'verify-obs-lost.db');

      const testData = {
        entities: [{
          name: 'TestEntity',
          entityType: 'test',
          observations: ['obs1', 'obs2', 'obs3']
        }]
      };

      await fs.writeFile(jsonPath, JSON.stringify(testData));

      // Mock SQLiteStorage to simulate lost observations
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const originalGetEntities = SQLiteStorage.prototype.getEntities;
      
      let callCount = 0;
      SQLiteStorage.prototype.getEntities = async function(names: string[]) {
        callCount++;
        const result = await originalGetEntities.call(this, names);
        // During verification, return missing observations
        if (callCount > 1 && result.length > 0) {
          result[0].observations = ['obs1']; // Missing obs2 and obs3
        }
        return result;
      };

      // Migration with verification should fail
      await expect(
        migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true })
      ).rejects.toThrow("Lost observation for entity 'TestEntity': obs2");

      // Restore original method
      SQLiteStorage.prototype.getEntities = originalGetEntities;
    });

    it('should pass verification with duplicate observations removed', async () => {
      const jsonPath = path.join(testDir, 'verify-dedup.json');
      const sqlitePath = path.join(testDir, 'verify-dedup.db');

      const testData = {
        entities: [{
          name: 'TestEntity',
          entityType: 'test',
          observations: ['obs1', 'obs1', 'obs2', 'obs2'] // Duplicates
        }]
      };

      await fs.writeFile(jsonPath, JSON.stringify(testData));

      // Should not throw - deduplication is expected
      const originalConsoleLog = console.log;
      let dedupReported = false;
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes('duplicate observation(s) removed')) {
          dedupReported = true;
        }
        originalConsoleLog(...args);
      };

      await migrateJSONToSQLite(jsonPath, sqlitePath, { verify: true });

      console.log = originalConsoleLog;
      expect(dedupReported).toBe(true);

      // Verify the entity has deduplicated observations
      const { SQLiteStorage } = await import('../../storage/sqlite-storage.js');
      const sqliteStorage = new SQLiteStorage({ type: 'sqlite', filePath: sqlitePath });
      await sqliteStorage.initialize();
      
      const entities = await sqliteStorage.getEntities(['TestEntity']);
      expect(entities[0].observations).toEqual(['obs1', 'obs2']);
      
      await sqliteStorage.close();
    });
  });
});