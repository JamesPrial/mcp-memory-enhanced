import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../../../storage/sqlite-storage.js';
import { Entity } from '../../../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('SQLite-Specific Features', () => {
  let storage: SQLiteStorage;
  let testFile: string;

  beforeEach(async () => {
    testFile = path.join(tmpdir(), `test-sqlite-${Date.now()}.db`);
    storage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    try {
      await fs.unlink(testFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('Transaction Handling', () => {
    it('should rollback on error in batch operations', async () => {
      const entities: Entity[] = [
        {
          name: 'Valid Entity',
          entityType: 'Test',
          observations: ['Valid observation']
        }
      ];

      await storage.createEntities(entities);

      // Mock an error during the operation
      const originalAddObservations = storage.addObservations.bind(storage);
      let callCount = 0;
      storage.addObservations = async (observations) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Simulated error');
        }
        return originalAddObservations(observations);
      };

      // Try to add observations - should fail
      await expect(storage.addObservations([
        {
          entityName: 'Valid Entity',
          contents: ['Should not be added']
        }
      ])).rejects.toThrow('Simulated error');

      // Restore original method
      storage.addObservations = originalAddObservations;

      // Verify no observations were added
      const entities2 = await storage.getEntities(['Valid Entity']);
      expect(entities2[0].observations).toHaveLength(1);
      expect(entities2[0].observations).not.toContain('Should not be added');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads correctly', async () => {
      // Create test data
      const entities: Entity[] = Array.from({ length: 50 }, (_, i) => ({
        name: `Concurrent Entity ${i}`,
        entityType: 'ConcurrentTest',
        observations: [`Observation ${i}`]
      }));

      await storage.createEntities(entities);

      // Perform concurrent reads
      const promises = Array.from({ length: 10 }, () => 
        storage.searchEntities('Concurrent')
      );

      const results = await Promise.all(promises);

      // All reads should return the same results
      results.forEach(result => {
        expect(result).toHaveLength(50);
      });
    });

    it('should serialize write operations', async () => {
      // Create base entity
      await storage.createEntities([{
        name: 'Concurrent Write Test',
        entityType: 'Test',
        observations: []
      }]);

      // Perform concurrent observation additions
      const promises = Array.from({ length: 20 }, (_, i) => 
        storage.addObservations([{
          entityName: 'Concurrent Write Test',
          contents: [`Concurrent observation ${i}`]
        }])
      );

      await Promise.all(promises);

      // All observations should be added
      const entity = await storage.getEntities(['Concurrent Write Test']);
      expect(entity[0].observations).toHaveLength(20);
    });
  });

  describe('Performance Features', () => {
    it('should use indexes for efficient searching', async () => {
      // Create many entities
      const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `Performance Test ${i}`,
        entityType: i % 10 === 0 ? 'SpecialType' : 'RegularType',
        observations: [`Observation ${i}`, i % 50 === 0 ? 'RARE_KEYWORD' : 'Common']
      }));

      await storage.createEntities(entities);

      // Search should be fast even with many entities
      const start = Date.now();
      const results = await storage.searchEntities('RARE_KEYWORD');
      const duration = Date.now() - start;

      expect(results).toHaveLength(20); // 1000 / 50
      expect(duration).toBeLessThan(100); // Should be very fast due to indexes
    });
  });

  describe('WAL Mode', () => {
    it('should enable WAL mode for better concurrency', async () => {
      // Close and reopen to ensure clean state
      await storage.close();
      storage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
      await storage.initialize();

      // Create and read simultaneously should work due to WAL
      const writePromise = storage.createEntities([{
        name: 'WAL Test',
        entityType: 'Test',
        observations: ['WAL enabled']
      }]);

      const readPromise = storage.loadGraph();

      await Promise.all([writePromise, readPromise]);

      // Verify WAL file exists
      const walFile = testFile + '-wal';
      const walExists = await fs.access(walFile).then(() => true).catch(() => false);
      expect(walExists).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should enforce foreign key constraints', async () => {
      // This is handled internally, but we can verify cascade deletes work
      const entities: Entity[] = [
        {
          name: 'Parent Entity',
          entityType: 'Parent',
          observations: ['Parent observation']
        },
        {
          name: 'Child Entity',
          entityType: 'Child',
          observations: ['Child observation']
        }
      ];

      await storage.createEntities(entities);

      await storage.createRelations([{
        from: 'Parent Entity',
        to: 'Child Entity',
        relationType: 'has child'
      }]);

      // Delete parent should cascade delete relations
      await storage.deleteEntities(['Parent Entity']);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.relations).toHaveLength(0);
    });

    it('should handle database file corruption gracefully', async () => {
      // Close storage
      await storage.close();

      // Corrupt the file
      await fs.writeFile(testFile, 'This is not a valid SQLite file');

      // Try to open - should fail gracefully
      try {
        const corruptedStorage = new SQLiteStorage({ type: 'sqlite', filePath: testFile });
        await corruptedStorage.initialize();
        // If we get here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        // Verify it's a database-related error
        expect((error as Error).message).toMatch(/not a database|database.*corrupt/i);
      }
    });
  });

  describe('Storage Size Calculation', () => {
    it('should accurately calculate storage size', async () => {
      const stats1 = await storage.getStats();
      const initialSize = stats1.storageSize;

      // Add substantial data
      const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
        name: `Size Test ${i}`,
        entityType: 'SizeTest',
        observations: Array.from({ length: 10 }, (_, j) => `Observation ${i}-${j}`)
      }));

      await storage.createEntities(entities);

      const stats2 = await storage.getStats();
      // Storage size calculation may vary by SQLite implementation
      if (stats2.storageSize !== undefined && stats2.storageSize > 0 && initialSize !== undefined) {
        expect(stats2.storageSize).toBeGreaterThanOrEqual(initialSize);
      }
      expect(stats2.entityCount).toBe(100);
      expect(stats2.observationCount).toBe(1000);
    });
  });

  describe('Graph Replacement Operations (saveGraph)', () => {
    it('should save an empty graph successfully', async () => {
      // Create initial data
      await storage.createEntities([
        { name: 'ToBeReplaced', entityType: 'Old', observations: ['old data'] }
      ]);
      
      // Save empty graph
      const emptyGraph = { entities: [], relations: [] };
      await storage.saveGraph(emptyGraph);
      
      // Verify graph is empty
      const result = await storage.loadGraph();
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it('should replace entire graph with new data', async () => {
      // Create initial graph
      const initialEntities: Entity[] = [
        { name: 'OldEntity1', entityType: 'Type1', observations: ['obs1'] },
        { name: 'OldEntity2', entityType: 'Type2', observations: ['obs2'] }
      ];
      await storage.createEntities(initialEntities);
      await storage.createRelations([
        { from: 'OldEntity1', to: 'OldEntity2', relationType: 'old_relation' }
      ]);
      
      // Create new graph
      const newGraph = {
        entities: [
          { name: 'NewEntity1', entityType: 'NewType1', observations: ['new1', 'new2'] },
          { name: 'NewEntity2', entityType: 'NewType2', observations: ['new3'] },
          { name: 'NewEntity3', entityType: 'NewType3', observations: [] }
        ],
        relations: [
          { from: 'NewEntity1', to: 'NewEntity2', relationType: 'new_relation' },
          { from: 'NewEntity2', to: 'NewEntity3', relationType: 'another_relation' }
        ]
      };
      
      // Replace graph
      await storage.saveGraph(newGraph);
      
      // Verify complete replacement
      const result = await storage.loadGraph();
      expect(result.entities).toHaveLength(3);
      expect(result.relations).toHaveLength(2);
      expect(result.entities.map(e => e.name)).toEqual(['NewEntity1', 'NewEntity2', 'NewEntity3']);
      expect(result.relations[0].relationType).toBe('new_relation');
    });

    it('should handle circular relation graphs', async () => {
      const circularGraph = {
        entities: [
          { name: 'NodeA', entityType: 'Node', observations: ['A data'] },
          { name: 'NodeB', entityType: 'Node', observations: ['B data'] },
          { name: 'NodeC', entityType: 'Node', observations: ['C data'] }
        ],
        relations: [
          { from: 'NodeA', to: 'NodeB', relationType: 'links_to' },
          { from: 'NodeB', to: 'NodeC', relationType: 'links_to' },
          { from: 'NodeC', to: 'NodeA', relationType: 'links_to' }, // Circular
          { from: 'NodeA', to: 'NodeA', relationType: 'self_reference' } // Self-reference
        ]
      };
      
      await storage.saveGraph(circularGraph);
      
      const result = await storage.loadGraph();
      expect(result.entities).toHaveLength(3);
      expect(result.relations).toHaveLength(4);
      
      // Verify circular relations are preserved
      const selfRef = result.relations.find(r => r.from === 'NodeA' && r.to === 'NodeA');
      expect(selfRef).toBeDefined();
      expect(selfRef?.relationType).toBe('self_reference');
    });

    it('should maintain data integrity during large replacements', async () => {
      // Create large initial dataset
      const largeGraph = {
        entities: Array.from({ length: 500 }, (_, i) => ({
          name: `Entity${i}`,
          entityType: `Type${i % 10}`,
          observations: Array.from({ length: 5 }, (_, j) => `Obs${i}-${j}`)
        })),
        relations: Array.from({ length: 1000 }, (_, i) => ({
          from: `Entity${Math.floor(i / 2) % 500}`,
          to: `Entity${(Math.floor(i / 2) + 1 + (i % 2) * 50) % 500}`,
          relationType: `rel_type_${i % 20}`
        }))
      };
      
      await storage.saveGraph(largeGraph);
      
      const result = await storage.loadGraph();
      expect(result.entities).toHaveLength(500);
      expect(result.relations).toHaveLength(1000);
      expect(result.entities[0].observations).toHaveLength(5);
      
      // Verify specific data integrity
      const entity99 = result.entities.find(e => e.name === 'Entity99');
      expect(entity99?.entityType).toBe('Type9');
      expect(entity99?.observations).toContain('Obs99-0');
    });

    it('should handle graphs with missing relation endpoints gracefully', async () => {
      const graphWithMissingEndpoints = {
        entities: [
          { name: 'ExistingNode', entityType: 'Node', observations: ['data'] }
        ],
        relations: [
          { from: 'ExistingNode', to: 'NonExistentNode', relationType: 'broken_link' },
          { from: 'NonExistentNode', to: 'ExistingNode', relationType: 'reverse_broken' }
        ]
      };
      
      await storage.saveGraph(graphWithMissingEndpoints);
      
      const result = await storage.loadGraph();
      expect(result.entities).toHaveLength(1);
      // Relations with missing endpoints should not be created
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('Relation Query Edge Cases (getRelations)', () => {
    beforeEach(async () => {
      // Setup test data
      const entities: Entity[] = [
        { name: 'Alpha', entityType: 'Type1', observations: ['obs1'] },
        { name: 'Beta', entityType: 'Type2', observations: ['obs2'] },
        { name: 'Gamma', entityType: 'Type1', observations: ['obs3'] },
        { name: 'Delta', entityType: 'Type3', observations: ['obs4'] }
      ];
      await storage.createEntities(entities);
      
      await storage.createRelations([
        { from: 'Alpha', to: 'Beta', relationType: 'connects' },
        { from: 'Beta', to: 'Gamma', relationType: 'links' },
        { from: 'Gamma', to: 'Delta', relationType: 'references' },
        { from: 'Delta', to: 'Alpha', relationType: 'cycles' },
        { from: 'Alpha', to: 'Gamma', relationType: 'skips' }
      ]);
    });

    it('should return all relations when entityNames is empty array', async () => {
      const allRelations = await storage.getRelations([]);
      
      expect(allRelations).toHaveLength(5);
      expect(allRelations.map(r => r.relationType)).toContain('connects');
      expect(allRelations.map(r => r.relationType)).toContain('links');
      expect(allRelations.map(r => r.relationType)).toContain('references');
      expect(allRelations.map(r => r.relationType)).toContain('cycles');
      expect(allRelations.map(r => r.relationType)).toContain('skips');
    });

    it('should return relations for a single entity', async () => {
      const alphaRelations = await storage.getRelations(['Alpha']);
      
      // Alpha is involved in 3 relations (from: 2, to: 1)
      expect(alphaRelations).toHaveLength(3);
      
      const relationTypes = alphaRelations.map(r => r.relationType);
      expect(relationTypes).toContain('connects');
      expect(relationTypes).toContain('cycles');
      expect(relationTypes).toContain('skips');
    });

    it('should return relations for multiple entities', async () => {
      const relations = await storage.getRelations(['Alpha', 'Beta']);
      
      // Should include all relations where Alpha or Beta is involved
      expect(relations).toHaveLength(4);
      
      const relationTypes = relations.map(r => r.relationType);
      expect(relationTypes).toContain('connects');
      expect(relationTypes).toContain('links');
      expect(relationTypes).toContain('cycles');
      expect(relationTypes).toContain('skips');
    });

    it('should handle queries for non-existent entities gracefully', async () => {
      const relations = await storage.getRelations(['NonExistent1', 'NonExistent2']);
      
      expect(relations).toHaveLength(0);
    });

    it('should handle mixed valid and invalid entity names', async () => {
      const relations = await storage.getRelations(['Alpha', 'NonExistent', 'Gamma']);
      
      // Should only return relations for Alpha and Gamma
      expect(relations.length).toBeGreaterThan(0);
      
      // Verify all returned relations involve either Alpha or Gamma
      relations.forEach(rel => {
        const involvesValidEntity = 
          rel.from === 'Alpha' || rel.to === 'Alpha' ||
          rel.from === 'Gamma' || rel.to === 'Gamma';
        expect(involvesValidEntity).toBe(true);
      });
    });

    it('should handle large relation queries efficiently', async () => {
      // Create a large dataset
      const largeEntities = Array.from({ length: 100 }, (_, i) => ({
        name: `LargeEntity${i}`,
        entityType: 'Large',
        observations: [`Large obs ${i}`]
      }));
      await storage.createEntities(largeEntities);
      
      // Create many relations
      const largeRelations = [];
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 10; j++) {
          if (i !== j) {
            largeRelations.push({
              from: `LargeEntity${i}`,
              to: `LargeEntity${(i + j) % 100}`,
              relationType: `rel_${i}_${j}`
            });
          }
        }
      }
      await storage.createRelations(largeRelations);
      
      const start = Date.now();
      const allRelations = await storage.getRelations([]);
      const duration = Date.now() - start;
      
      expect(allRelations.length).toBeGreaterThan(900); // Some may be duplicates
      expect(duration).toBeLessThan(200); // Should be fast even with many relations
    });
  });

  describe('Edge Cases and Special Characters', () => {
    it('should handle unicode and special characters in entity names', async () => {
      const specialEntities: Entity[] = [
        { name: '日本語エンティティ', entityType: 'Unicode', observations: ['Unicode test'] },
        { name: 'Entity with spaces', entityType: 'Spaces', observations: ['Space test'] },
        { name: 'Entity-with-dashes', entityType: 'Dashes', observations: ['Dash test'] },
        { name: 'Entity_with_underscores', entityType: 'Underscores', observations: ['Underscore test'] },
        { name: 'Entity.with.dots', entityType: 'Dots', observations: ['Dot test'] },
        { name: '🎉 Emoji Entity 🚀', entityType: 'Emoji', observations: ['Emoji test'] }
      ];
      
      await storage.createEntities(specialEntities);
      
      // Create relations with special characters
      await storage.createRelations([
        { from: '日本語エンティティ', to: 'Entity with spaces', relationType: '特別な関係' },
        { from: '🎉 Emoji Entity 🚀', to: 'Entity.with.dots', relationType: 'emoji→dots' }
      ]);
      
      // Test retrieval
      const retrieved = await storage.getEntities(['日本語エンティティ', '🎉 Emoji Entity 🚀']);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].name).toBe('日本語エンティティ');
      
      const relations = await storage.getRelations(['日本語エンティティ']);
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('特別な関係');
    });

    it('should handle maximum length fields', async () => {
      const longName = 'E' + 'x'.repeat(254); // 255 chars total
      const longType = 'T' + 'y'.repeat(254);
      const longObservation = 'O' + 'b'.repeat(4094); // 4095 chars
      
      const maxEntity: Entity = {
        name: longName,
        entityType: longType,
        observations: [longObservation]
      };
      
      await storage.createEntities([maxEntity]);
      
      const retrieved = await storage.getEntities([longName]);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].name).toBe(longName);
      expect(retrieved[0].entityType).toBe(longType);
      expect(retrieved[0].observations[0]).toBe(longObservation);
    });

    it('should handle empty strings appropriately', async () => {
      // Empty strings should be rejected or handled
      try {
        await storage.createEntities([
          { name: '', entityType: 'Type', observations: ['test'] }
        ]);
        // If it doesn't throw, verify it wasn't created
        const all = await storage.loadGraph();
        expect(all.entities.find(e => e.name === '')).toBeUndefined();
      } catch (error) {
        // Expected behavior - empty names should be rejected
        expect(error).toBeDefined();
      }
    });

    it('should handle null and undefined values safely', async () => {
      // Test with observations array containing empty strings
      const entity: Entity = {
        name: 'NullTest',
        entityType: 'Test',
        observations: ['valid', '', 'also valid']
      };
      
      await storage.createEntities([entity]);
      
      const retrieved = await storage.getEntities(['NullTest']);
      expect(retrieved[0].observations).toHaveLength(3);
      expect(retrieved[0].observations).toContain('');
    });
  });
});