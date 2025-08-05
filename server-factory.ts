import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { createStorageFromEnv } from './storage/factory.js';
import type { IStorageBackend } from './storage/interface.js';
import { Entity, Relation } from './types.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { 
  CreateEntitiesSchema,
  CreateRelationsSchema,
  AddObservationsSchema,
  DeleteEntitiesSchema,
  DeleteObservationsSchema,
  DeleteRelationsSchema,
  ReadGraphSchema,
  SearchNodesSchema,
  OpenNodesSchema,
} from './server-factory-schemas.js';

export async function createServerFromFactory(): Promise<Server> {
  const storage: IStorageBackend = createStorageFromEnv();
  await storage.initialize();
  const manager = new KnowledgeGraphManager(storage);
  
  const server = new Server(
    {
      name: 'memory',
      version: '0.6.3',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Memory Management Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'memory__create_entities',
          description: 'Create multiple new entities in the knowledge graph',
          inputSchema: CreateEntitiesSchema,
        },
        {
          name: 'memory__create_relations',
          description: 'Create multiple new relations between entities in the knowledge graph. Relations should be in active voice',
          inputSchema: CreateRelationsSchema,
        },
        {
          name: 'memory__add_observations',
          description: 'Add new observations to existing entities in the knowledge graph',
          inputSchema: AddObservationsSchema,
        },
        {
          name: 'memory__delete_entities',
          description: 'Delete multiple entities and their associated relations from the knowledge graph',
          inputSchema: DeleteEntitiesSchema,
        },
        {
          name: 'memory__delete_observations',
          description: 'Delete specific observations from entities in the knowledge graph',
          inputSchema: DeleteObservationsSchema,
        },
        {
          name: 'memory__delete_relations',
          description: 'Delete multiple relations from the knowledge graph',
          inputSchema: DeleteRelationsSchema,
        },
        {
          name: 'memory__read_graph',
          description: 'Read the entire knowledge graph',
          inputSchema: ReadGraphSchema,
        },
        {
          name: 'memory__search_nodes',
          description: 'Search for nodes in the knowledge graph based on a query',
          inputSchema: SearchNodesSchema,
        },
        {
          name: 'memory__open_nodes',
          description: 'Open specific nodes in the knowledge graph by their names',
          inputSchema: OpenNodesSchema,
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
      }
      
      switch (name) {
        case 'memory__create_entities':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.createEntities(args.entities as Entity[])) }] };
        
        case 'memory__create_relations':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.createRelations(args.relations as Relation[])) }] };
        
        case 'memory__add_observations':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.addObservations(args.observations as { entityName: string; contents: string[] }[])) }] };
        
        case 'memory__delete_entities':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.deleteEntities(args.entityNames as string[])) }] };
        
        case 'memory__delete_observations':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[])) }] };
        
        case 'memory__delete_relations':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.deleteRelations(args.relations as Relation[])) }] };
        
        case 'memory__read_graph':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.readGraph()) }] };
        
        case 'memory__search_nodes':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.searchNodes(args.query as string)) }] };
        
        case 'memory__open_nodes':
          return { content: [{ type: 'text', text: JSON.stringify(await manager.openNodes(args.names as string[])) }] };
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

  return server;
}