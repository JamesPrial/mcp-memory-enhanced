#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { createStorageFromEnv } from './storage/factory.js';
import { Entity, Relation } from './types.js';
import { startHealthServer } from './health-server.js';
import { startMonitoringServer } from './monitoring/server.js';
import { getLogger } from './monitoring/logger.js';
import { metrics } from './monitoring/metrics.js';
import { validator } from './security/validator.js';

const logger = getLogger('main');

// Initialize storage backend and knowledge graph manager
let knowledgeGraphManager: KnowledgeGraphManager;
let storage: any;

async function initializeStorage() {
  try {
    storage = createStorageFromEnv();
    await storage.initialize();
    knowledgeGraphManager = new KnowledgeGraphManager(storage);
    
    // Log storage type for debugging
    const storageType = process.env.STORAGE_TYPE || 'json';
    logger.info('Storage initialized', { type: storageType });
    
    // Start monitoring if enabled
    if (process.env.ENABLE_MONITORING === 'true') {
      const monitoringPort = parseInt(process.env.MONITORING_PORT || '3001');
      await startMonitoringServer(storage, monitoringPort);
      logger.info('Monitoring server started', { port: monitoringPort });
    }
    
    // Start health server if needed
    if (process.env.ENABLE_HEALTH_SERVER === 'true') {
      const healthPort = parseInt(process.env.HEALTH_PORT || '3000');
      startHealthServer(healthPort, knowledgeGraphManager);
      logger.info('Health server started', { port: healthPort });
    }
  } catch (error) {
    logger.error('Failed to initialize storage', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// Rate limiter for tool calls
const rateLimiter = validator.createRateLimiter(100, 60000); // 100 requests per minute

// The server instance and tools exposed to Claude
const server = new Server({
  name: "memory-server",
  version: "0.6.3",
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity"
                  }
                },
                required: ["name", "entityType", "observations"]
              }
            }
          },
          required: ["entities"]
        }
      },
      {
        name: "create_relations",
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" }
                },
                required: ["from", "to", "relationType"]
              }
            }
          },
          required: ["relations"]
        }
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents to add"
                  }
                },
                required: ["entityName", "contents"]
              }
            }
          },
          required: ["observations"]
        }
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to delete"
            }
          },
          required: ["entityNames"]
        }
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: {
                    type: "array",
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  }
                },
                required: ["entityName", "observations"]
              }
            }
          },
          required: ["deletions"]
        }
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" }
                },
                required: ["from", "to", "relationType"]
              },
              description: "An array of relations to delete"
            }
          },
          required: ["relations"]
        }
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query to match against entity names, types, and observation content"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve"
            }
          },
          required: ["names"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: args } = request.params;
  const timer = metrics.startTimer(`tool_${toolName}_duration`);
  
  try {
    // Rate limiting
    const clientId = 'default'; // In production, extract from request context
    if (!rateLimiter(clientId)) {
      throw new Error('Rate limit exceeded');
    }

    logger.debug('Tool called', { tool: toolName, args });
    metrics.increment('tool_calls_total', 1, { tool: toolName });

    switch (toolName) {
      case "create_entities": {
        const entities = (args?.entities || []) as Entity[];
        
        // Validate all entities
        for (const entity of entities) {
          const validation = validator.validateEntity(entity);
          if (!validation.valid) {
            throw new Error(`Invalid entity ${entity.name}: ${validation.errors.join(', ')}`);
          }
        }
        
        const createdEntities = await knowledgeGraphManager.createEntities(entities);
        return { content: [{ type: "text", text: JSON.stringify(createdEntities, null, 2) }] };
      }

      case "create_relations": {
        const relations = (args?.relations || []) as Relation[];
        
        // Validate all relations
        for (const relation of relations) {
          const validation = validator.validateRelation(relation);
          if (!validation.valid) {
            throw new Error(`Invalid relation: ${validation.errors.join(', ')}`);
          }
        }
        
        const createdRelations = await knowledgeGraphManager.createRelations(relations);
        return { content: [{ type: "text", text: JSON.stringify(createdRelations, null, 2) }] };
      }

      case "add_observations": {
        const observations = (args?.observations || []) as Array<{ entityName: string; contents: string[] }>;
        const results = await knowledgeGraphManager.addObservations(observations);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "delete_entities": {
        const entityNames = (args?.entityNames || []) as string[];
        await knowledgeGraphManager.deleteEntities(entityNames);
        return { content: [{ type: "text", text: `Successfully deleted ${entityNames.length} entities and their relations.` }] };
      }

      case "delete_observations": {
        const deletions = (args?.deletions || []) as Array<{ entityName: string; observations: string[] }>;
        const results = await knowledgeGraphManager.deleteObservations(deletions);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "delete_relations": {
        const relations = (args?.relations || []) as Relation[];
        await knowledgeGraphManager.deleteRelations(relations);
        return { content: [{ type: "text", text: `Successfully deleted ${relations.length} relations.` }] };
      }

      case "read_graph": {
        const graph = await knowledgeGraphManager.readGraph();
        return { content: [{ type: "text", text: JSON.stringify(graph, null, 2) }] };
      }

      case "search_nodes": {
        const query = (args?.query || '') as string;
        const results = await knowledgeGraphManager.searchNodes(query);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      case "open_nodes": {
        const names = (args?.names || []) as string[];
        const results = await knowledgeGraphManager.openNodes(names);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error('Tool execution failed', error instanceof Error ? error : new Error(String(error)), { tool: toolName });
    metrics.increment('tool_errors_total', 1, { tool: toolName });
    throw error;
  } finally {
    timer();
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)), { promise });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (storage) {
    await storage.close();
  }
  process.exit(0);
});

// Main execution
async function main() {
  await initializeStorage();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Memory server started');
}

main().catch(error => {
  logger.error('Failed to start server', error instanceof Error ? error : new Error(String(error)));
  process.exit(1);
});