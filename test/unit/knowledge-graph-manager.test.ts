import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeGraphManager } from '../../knowledge-graph-manager.js';
import { IStorageBackend } from '../../storage/interface.js';
import { Entity, Relation, KnowledgeGraph } from '../../types.js';

describe('KnowledgeGraphManager', () => {
  let mockStorage: IStorageBackend;
  let manager: KnowledgeGraphManager;

  beforeEach(() => {
    // Create a mock storage backend
    mockStorage = {
      createEntities: vi.fn(),
      createRelations: vi.fn(),
      addObservations: vi.fn(),
      deleteEntities: vi.fn(),
      deleteObservations: vi.fn(),
      deleteRelations: vi.fn(),
      loadGraph: vi.fn(),
      searchEntities: vi.fn(),
      getEntities: vi.fn(),
      getRelations: vi.fn(),
      getStats: vi.fn(),
      saveGraph: vi.fn(),
      clearAll: vi.fn(),
      close: vi.fn(),
    };

    manager = new KnowledgeGraphManager(mockStorage);
  });

  describe('createEntities', () => {
    it('should delegate to storage backend', async () => {
      const entities: Entity[] = [
        { name: 'Entity1', type: 'Person', observations: ['obs1'] },
        { name: 'Entity2', type: 'Place', observations: ['obs2'] },
      ];
      const expectedResult = entities;
      
      vi.mocked(mockStorage.createEntities).mockResolvedValue(expectedResult);

      const result = await manager.createEntities(entities);

      expect(mockStorage.createEntities).toHaveBeenCalledWith(entities);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty array', async () => {
      const entities: Entity[] = [];
      vi.mocked(mockStorage.createEntities).mockResolvedValue([]);

      const result = await manager.createEntities(entities);

      expect(mockStorage.createEntities).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });

    it('should propagate errors from storage', async () => {
      const entities: Entity[] = [{ name: 'Test', type: 'Type', observations: [] }];
      const error = new Error('Storage error');
      
      vi.mocked(mockStorage.createEntities).mockRejectedValue(error);

      await expect(manager.createEntities(entities)).rejects.toThrow('Storage error');
    });
  });

  describe('createRelations', () => {
    it('should delegate to storage backend', async () => {
      const relations: Relation[] = [
        { from: 'Entity1', to: 'Entity2', type: 'knows' },
        { from: 'Entity2', to: 'Entity3', type: 'located_at' },
      ];
      
      vi.mocked(mockStorage.createRelations).mockResolvedValue(relations);

      const result = await manager.createRelations(relations);

      expect(mockStorage.createRelations).toHaveBeenCalledWith(relations);
      expect(result).toEqual(relations);
    });

    it('should handle empty relations array', async () => {
      vi.mocked(mockStorage.createRelations).mockResolvedValue([]);

      const result = await manager.createRelations([]);

      expect(mockStorage.createRelations).toHaveBeenCalledWith([]);
      expect(result).toEqual([]);
    });
  });

  describe('addObservations', () => {
    it('should delegate to storage backend', async () => {
      const observations = [
        { entityName: 'Entity1', contents: ['new obs 1', 'new obs 2'] },
        { entityName: 'Entity2', contents: ['new obs 3'] },
      ];
      const expectedResult = [
        { entityName: 'Entity1', addedObservations: ['new obs 1', 'new obs 2'] },
        { entityName: 'Entity2', addedObservations: ['new obs 3'] },
      ];
      
      vi.mocked(mockStorage.addObservations).mockResolvedValue(expectedResult);

      const result = await manager.addObservations(observations);

      expect(mockStorage.addObservations).toHaveBeenCalledWith(observations);
      expect(result).toEqual(expectedResult);
    });

    it('should handle empty observations', async () => {
      const observations = [{ entityName: 'Entity1', contents: [] }];
      const expectedResult = [{ entityName: 'Entity1', addedObservations: [] }];
      
      vi.mocked(mockStorage.addObservations).mockResolvedValue(expectedResult);

      const result = await manager.addObservations(observations);

      expect(result).toEqual(expectedResult);
    });
  });

  describe('deleteEntities', () => {
    it('should delegate to storage backend', async () => {
      const entityNames = ['Entity1', 'Entity2'];
      
      vi.mocked(mockStorage.deleteEntities).mockResolvedValue(undefined);

      await manager.deleteEntities(entityNames);

      expect(mockStorage.deleteEntities).toHaveBeenCalledWith(entityNames);
    });

    it('should handle empty array', async () => {
      vi.mocked(mockStorage.deleteEntities).mockResolvedValue(undefined);

      await manager.deleteEntities([]);

      expect(mockStorage.deleteEntities).toHaveBeenCalledWith([]);
    });

    it('should propagate errors', async () => {
      const error = new Error('Delete failed');
      vi.mocked(mockStorage.deleteEntities).mockRejectedValue(error);

      await expect(manager.deleteEntities(['Entity1'])).rejects.toThrow('Delete failed');
    });
  });

  describe('deleteObservations', () => {
    it('should delegate to storage backend', async () => {
      const deletions = [
        { entityName: 'Entity1', observations: ['obs1', 'obs2'] },
        { entityName: 'Entity2', observations: ['obs3'] },
      ];
      
      vi.mocked(mockStorage.deleteObservations).mockResolvedValue(undefined);

      await manager.deleteObservations(deletions);

      expect(mockStorage.deleteObservations).toHaveBeenCalledWith(deletions);
    });
  });

  describe('deleteRelations', () => {
    it('should delegate to storage backend', async () => {
      const relations: Relation[] = [
        { from: 'Entity1', to: 'Entity2', type: 'knows' },
      ];
      
      vi.mocked(mockStorage.deleteRelations).mockResolvedValue(undefined);

      await manager.deleteRelations(relations);

      expect(mockStorage.deleteRelations).toHaveBeenCalledWith(relations);
    });
  });

  describe('readGraph', () => {
    it('should delegate to storage loadGraph', async () => {
      const graph: KnowledgeGraph = {
        entities: [
          { name: 'Entity1', type: 'Person', observations: ['obs1'] },
        ],
        relations: [
          { from: 'Entity1', to: 'Entity2', type: 'knows' },
        ],
      };
      
      vi.mocked(mockStorage.loadGraph).mockResolvedValue(graph);

      const result = await manager.readGraph();

      expect(mockStorage.loadGraph).toHaveBeenCalled();
      expect(result).toEqual(graph);
    });

    it('should handle empty graph', async () => {
      const emptyGraph: KnowledgeGraph = {
        entities: [],
        relations: [],
      };
      
      vi.mocked(mockStorage.loadGraph).mockResolvedValue(emptyGraph);

      const result = await manager.readGraph();

      expect(result).toEqual(emptyGraph);
    });
  });

  describe('searchNodes', () => {
    it('should search entities and filter relations', async () => {
      const query = 'test query';
      const entities: Entity[] = [
        { name: 'Entity1', type: 'Person', observations: ['matches query'] },
        { name: 'Entity2', type: 'Place', observations: ['also matches'] },
      ];
      const allRelations: Relation[] = [
        { from: 'Entity1', to: 'Entity2', type: 'visits' }, // Should be included
        { from: 'Entity1', to: 'Entity3', type: 'knows' },  // Should be excluded (Entity3 not in results)
        { from: 'Entity2', to: 'Entity1', type: 'contains' }, // Should be included
      ];
      
      vi.mocked(mockStorage.searchEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue(allRelations);

      const result = await manager.searchNodes(query);

      expect(mockStorage.searchEntities).toHaveBeenCalledWith(query);
      expect(mockStorage.getRelations).toHaveBeenCalledWith([]);
      expect(result.entities).toEqual(entities);
      expect(result.relations).toHaveLength(2);
      expect(result.relations).toContainEqual({ from: 'Entity1', to: 'Entity2', type: 'visits' });
      expect(result.relations).toContainEqual({ from: 'Entity2', to: 'Entity1', type: 'contains' });
    });

    it('should handle no matching entities', async () => {
      vi.mocked(mockStorage.searchEntities).mockResolvedValue([]);
      vi.mocked(mockStorage.getRelations).mockResolvedValue([]);

      const result = await manager.searchNodes('no matches');

      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('should handle entities with no relations', async () => {
      const entities: Entity[] = [
        { name: 'IsolatedEntity', type: 'Thing', observations: ['alone'] },
      ];
      
      vi.mocked(mockStorage.searchEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue([]);

      const result = await manager.searchNodes('isolated');

      expect(result.entities).toEqual(entities);
      expect(result.relations).toEqual([]);
    });
  });

  describe('openNodes', () => {
    it('should get specific entities and filter relations', async () => {
      const names = ['Entity1', 'Entity2'];
      const entities: Entity[] = [
        { name: 'Entity1', type: 'Person', observations: ['obs1'] },
        { name: 'Entity2', type: 'Place', observations: ['obs2'] },
      ];
      const allRelations: Relation[] = [
        { from: 'Entity1', to: 'Entity2', type: 'visits' }, // Should be included
        { from: 'Entity1', to: 'Entity3', type: 'knows' },  // Should be excluded
        { from: 'Entity2', to: 'Entity1', type: 'contains' }, // Should be included
        { from: 'Entity3', to: 'Entity1', type: 'references' }, // Should be excluded
      ];
      
      vi.mocked(mockStorage.getEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue(allRelations);

      const result = await manager.openNodes(names);

      expect(mockStorage.getEntities).toHaveBeenCalledWith(names);
      expect(mockStorage.getRelations).toHaveBeenCalledWith(names);
      expect(result.entities).toEqual(entities);
      expect(result.relations).toHaveLength(2);
      expect(result.relations).toContainEqual({ from: 'Entity1', to: 'Entity2', type: 'visits' });
      expect(result.relations).toContainEqual({ from: 'Entity2', to: 'Entity1', type: 'contains' });
    });

    it('should handle empty names array', async () => {
      vi.mocked(mockStorage.getEntities).mockResolvedValue([]);
      vi.mocked(mockStorage.getRelations).mockResolvedValue([]);

      const result = await manager.openNodes([]);

      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('should handle non-existent entities', async () => {
      const names = ['NonExistent1', 'NonExistent2'];
      
      vi.mocked(mockStorage.getEntities).mockResolvedValue([]);
      vi.mocked(mockStorage.getRelations).mockResolvedValue([]);

      const result = await manager.openNodes(names);

      expect(mockStorage.getEntities).toHaveBeenCalledWith(names);
      expect(result.entities).toEqual([]);
      expect(result.relations).toEqual([]);
    });

    it('should use Set for efficient filtering', async () => {
      const names = Array.from({ length: 100 }, (_, i) => `Entity${i}`);
      const entities = names.map(name => ({
        name,
        type: 'Type',
        observations: [],
      }));
      const relations: Relation[] = [
        { from: 'Entity0', to: 'Entity99', type: 'connects' },
        { from: 'Entity50', to: 'Entity51', type: 'adjacent' },
      ];
      
      vi.mocked(mockStorage.getEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue(relations);

      const result = await manager.openNodes(names);

      expect(result.relations).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should delegate to storage backend', async () => {
      const stats = {
        entityCount: 10,
        relationCount: 5,
        observationCount: 25,
        storageSize: 1024,
      };
      
      vi.mocked(mockStorage.getStats).mockResolvedValue(stats);

      const result = await manager.getStats();

      expect(mockStorage.getStats).toHaveBeenCalled();
      expect(result).toEqual(stats);
    });

    it('should handle stats without storageSize', async () => {
      const stats = {
        entityCount: 5,
        relationCount: 2,
        observationCount: 10,
      };
      
      vi.mocked(mockStorage.getStats).mockResolvedValue(stats);

      const result = await manager.getStats();

      expect(result).toEqual(stats);
      expect(result.storageSize).toBeUndefined();
    });

    it('should handle zero stats', async () => {
      const stats = {
        entityCount: 0,
        relationCount: 0,
        observationCount: 0,
      };
      
      vi.mocked(mockStorage.getStats).mockResolvedValue(stats);

      const result = await manager.getStats();

      expect(result.entityCount).toBe(0);
      expect(result.relationCount).toBe(0);
      expect(result.observationCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should propagate searchEntities errors', async () => {
      const error = new Error('Search failed');
      vi.mocked(mockStorage.searchEntities).mockRejectedValue(error);

      await expect(manager.searchNodes('query')).rejects.toThrow('Search failed');
    });

    it('should propagate getEntities errors', async () => {
      const error = new Error('Get entities failed');
      vi.mocked(mockStorage.getEntities).mockRejectedValue(error);

      await expect(manager.openNodes(['Entity1'])).rejects.toThrow('Get entities failed');
    });

    it('should propagate getRelations errors in searchNodes', async () => {
      vi.mocked(mockStorage.searchEntities).mockResolvedValue([]);
      vi.mocked(mockStorage.getRelations).mockRejectedValue(new Error('Get relations failed'));

      await expect(manager.searchNodes('query')).rejects.toThrow('Get relations failed');
    });

    it('should propagate getStats errors', async () => {
      const error = new Error('Stats unavailable');
      vi.mocked(mockStorage.getStats).mockRejectedValue(error);

      await expect(manager.getStats()).rejects.toThrow('Stats unavailable');
    });
  });

  describe('edge cases', () => {
    it('should handle entities with duplicate names in searchNodes', async () => {
      const entities: Entity[] = [
        { name: 'Duplicate', type: 'Type1', observations: ['obs1'] },
        { name: 'Duplicate', type: 'Type2', observations: ['obs2'] },
      ];
      const relations: Relation[] = [
        { from: 'Duplicate', to: 'Duplicate', type: 'self-reference' },
      ];
      
      vi.mocked(mockStorage.searchEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue(relations);

      const result = await manager.searchNodes('duplicate');

      expect(result.relations).toContainEqual({ from: 'Duplicate', to: 'Duplicate', type: 'self-reference' });
    });

    it('should handle self-referencing relations in openNodes', async () => {
      const entities: Entity[] = [
        { name: 'SelfRef', type: 'Type', observations: [] },
      ];
      const relations: Relation[] = [
        { from: 'SelfRef', to: 'SelfRef', type: 'recursive' },
      ];
      
      vi.mocked(mockStorage.getEntities).mockResolvedValue(entities);
      vi.mocked(mockStorage.getRelations).mockResolvedValue(relations);

      const result = await manager.openNodes(['SelfRef']);

      expect(result.relations).toHaveLength(1);
      expect(result.relations[0]).toEqual({ from: 'SelfRef', to: 'SelfRef', type: 'recursive' });
    });

    it('should handle very long entity names', async () => {
      const longName = 'A'.repeat(1000);
      const entities: Entity[] = [
        { name: longName, type: 'Type', observations: [] },
      ];
      
      vi.mocked(mockStorage.createEntities).mockResolvedValue(entities);

      const result = await manager.createEntities(entities);

      expect(result[0].name).toHaveLength(1000);
    });

    it('should handle special characters in queries', async () => {
      const specialQuery = 'test!@#$%^&*()_+-=[]{}|;\':",./<>?';
      
      vi.mocked(mockStorage.searchEntities).mockResolvedValue([]);
      vi.mocked(mockStorage.getRelations).mockResolvedValue([]);

      const result = await manager.searchNodes(specialQuery);

      expect(mockStorage.searchEntities).toHaveBeenCalledWith(specialQuery);
      expect(result.entities).toEqual([]);
    });
  });
});