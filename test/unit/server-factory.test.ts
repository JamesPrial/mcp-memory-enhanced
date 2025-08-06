import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createServerFromFactory } from '../../server-factory.js';
import * as storageFactory from '../../storage/factory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Mock the storage factory module
vi.mock('../../storage/factory.js', () => ({
  createStorageFromEnv: vi.fn()
}));

// Mock the Server class
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn()
  }))
}));

describe('server-factory', () => {
  let mockStorage: any;
  let mockServer: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock storage
    mockStorage = {
      initialize: vi.fn().mockResolvedValue(undefined),
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

    // Setup storage factory mock to return our mock storage
    vi.mocked(storageFactory.createStorageFromEnv).mockReturnValue(mockStorage);

    // Create mock server instance
    mockServer = {
      setRequestHandler: vi.fn()
    };

    // Mock Server constructor to return our mock server
    vi.mocked(Server).mockImplementation(() => mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createServerFromFactory', () => {
    it('should create storage from environment', async () => {
      await createServerFromFactory();
      
      expect(storageFactory.createStorageFromEnv).toHaveBeenCalledOnce();
    });

    it('should initialize storage', async () => {
      await createServerFromFactory();
      
      expect(mockStorage.initialize).toHaveBeenCalledOnce();
    });

    it('should create server with correct config', async () => {
      await createServerFromFactory();
      
      expect(Server).toHaveBeenCalledWith(
        {
          name: 'memory',
          version: '0.6.3'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );
    });

    it('should register ListToolsRequest handler', async () => {
      await createServerFromFactory();
      
      const calls = mockServer.setRequestHandler.mock.calls;
      const listToolsCall = calls.find((call: any[]) => 
        call[0] && call[0].parse && typeof call[1] === 'function'
      );
      
      expect(listToolsCall).toBeDefined();
    });

    it('should register CallToolRequest handler', async () => {
      await createServerFromFactory();
      
      const calls = mockServer.setRequestHandler.mock.calls;
      expect(calls).toHaveLength(2);
    });

    it('should return the created server', async () => {
      const result = await createServerFromFactory();
      
      expect(result).toBe(mockServer);
    });

    it('should handle storage initialization errors', async () => {
      const error = new Error('Storage init failed');
      mockStorage.initialize.mockRejectedValue(error);
      
      await expect(createServerFromFactory()).rejects.toThrow('Storage init failed');
    });
  });

  describe('ListToolsRequest handler', () => {
    it('should return all tool definitions', async () => {
      await createServerFromFactory();
      
      // Get the handler function
      const listToolsHandler = mockServer.setRequestHandler.mock.calls[0][1];
      
      const response = await listToolsHandler();
      
      expect(response.tools).toHaveLength(9);
      expect(response.tools[0].name).toBe('memory__create_entities');
      expect(response.tools[1].name).toBe('memory__create_relations');
      expect(response.tools[2].name).toBe('memory__add_observations');
      expect(response.tools[3].name).toBe('memory__delete_entities');
      expect(response.tools[4].name).toBe('memory__delete_observations');
      expect(response.tools[5].name).toBe('memory__delete_relations');
      expect(response.tools[6].name).toBe('memory__read_graph');
      expect(response.tools[7].name).toBe('memory__search_nodes');
      expect(response.tools[8].name).toBe('memory__open_nodes');
    });

    it('should include correct descriptions for tools', async () => {
      await createServerFromFactory();
      
      const listToolsHandler = mockServer.setRequestHandler.mock.calls[0][1];
      const response = await listToolsHandler();
      
      const createEntities = response.tools.find((t: any) => t.name === 'memory__create_entities');
      expect(createEntities.description).toBe('Create multiple new entities in the knowledge graph');
      
      const searchNodes = response.tools.find((t: any) => t.name === 'memory__search_nodes');
      expect(searchNodes.description).toBe('Search for nodes in the knowledge graph based on a query');
    });

    it('should include input schemas for all tools', async () => {
      await createServerFromFactory();
      
      const listToolsHandler = mockServer.setRequestHandler.mock.calls[0][1];
      const response = await listToolsHandler();
      
      response.tools.forEach((tool: any) => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });
  });

  describe('CallToolRequest handler', () => {
    let callToolHandler: any;

    beforeEach(async () => {
      await createServerFromFactory();
      // Get the CallToolRequest handler (second setRequestHandler call)
      callToolHandler = mockServer.setRequestHandler.mock.calls[1][1];
      
      // Setup mock responses for storage methods
      mockStorage.createEntities.mockResolvedValue([
        { name: 'Entity1', type: 'Person', observations: ['obs1'] }
      ]);
      mockStorage.createRelations.mockResolvedValue([
        { from: 'Entity1', to: 'Entity2', type: 'knows' }
      ]);
      mockStorage.addObservations.mockResolvedValue([
        { entityName: 'Entity1', addedObservations: ['new obs'] }
      ]);
      mockStorage.deleteEntities.mockResolvedValue(undefined);
      mockStorage.deleteObservations.mockResolvedValue(undefined);
      mockStorage.deleteRelations.mockResolvedValue(undefined);
      mockStorage.loadGraph.mockResolvedValue({ entities: [], relations: [] });
      mockStorage.searchEntities.mockResolvedValue([]);
      mockStorage.getEntities.mockResolvedValue([]);
      mockStorage.getRelations.mockResolvedValue([]);
    });

    it('should handle memory__create_entities', async () => {
      const request = {
        params: {
          name: 'memory__create_entities',
          arguments: {
            entities: [
              { name: 'Entity1', entityType: 'Person', observations: ['obs1'] }
            ]
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Entity1');
    });

    it('should handle memory__create_relations', async () => {
      const request = {
        params: {
          name: 'memory__create_relations',
          arguments: {
            relations: [
              { from: 'Entity1', to: 'Entity2', relationType: 'knows' }
            ]
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe('Entity1');
    });

    it('should handle memory__add_observations', async () => {
      const request = {
        params: {
          name: 'memory__add_observations',
          arguments: {
            observations: [
              { entityName: 'Entity1', contents: ['new obs'] }
            ]
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text);
      expect(result[0].entityName).toBe('Entity1');
    });

    it('should handle memory__delete_entities', async () => {
      const request = {
        params: {
          name: 'memory__delete_entities',
          arguments: {
            entityNames: ['Entity1', 'Entity2']
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('should handle memory__delete_observations', async () => {
      const request = {
        params: {
          name: 'memory__delete_observations',
          arguments: {
            deletions: [
              { entityName: 'Entity1', observations: ['obs1'] }
            ]
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('should handle memory__delete_relations', async () => {
      const request = {
        params: {
          name: 'memory__delete_relations',
          arguments: {
            relations: [
              { from: 'Entity1', to: 'Entity2', relationType: 'knows' }
            ]
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
    });

    it('should handle memory__read_graph', async () => {
      const request = {
        params: {
          name: 'memory__read_graph',
          arguments: {}
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('relations');
    });

    it('should handle memory__search_nodes', async () => {
      const request = {
        params: {
          name: 'memory__search_nodes',
          arguments: {
            query: 'test query'
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('relations');
    });

    it('should handle memory__open_nodes', async () => {
      const request = {
        params: {
          name: 'memory__open_nodes',
          arguments: {
            names: ['Entity1', 'Entity2']
          }
        }
      };

      const response = await callToolHandler(request);
      
      expect(response.content).toHaveLength(1);
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('entities');
      expect(result).toHaveProperty('relations');
    });

    it('should throw error for unknown tool', async () => {
      const request = {
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      await expect(callToolHandler(request)).rejects.toThrow('Unknown tool: unknown_tool');
    });

    it('should throw error when no arguments provided', async () => {
      const request = {
        params: {
          name: 'memory__create_entities',
          arguments: null
        }
      };

      await expect(callToolHandler(request)).rejects.toThrow('No arguments provided for tool: memory__create_entities');
    });

    it('should handle errors from manager methods', async () => {
      mockStorage.createEntities.mockRejectedValue(new Error('Storage error'));
      
      const request = {
        params: {
          name: 'memory__create_entities',
          arguments: {
            entities: []
          }
        }
      };

      await expect(callToolHandler(request)).rejects.toThrow('Storage error');
    });
  });
});