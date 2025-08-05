import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { createStorageFromEnv } from './storage/factory.js';
import { toolSchemas } from './server-factory-schemas.js';
import { z } from 'zod';

const CreateEntitiesSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      entityType: z.string(),
      observations: z.array(z.string()),
    })
  ),
});

const CreateRelationsSchema = z.object({
  relations: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relationType: z.string(),
    })
  ),
});

const AddObservationsSchema = z.object({
  observations: z.array(
    z.object({
      entityName: z.string(),
      contents: z.array(z.string()),
    })
  ),
});

const DeleteEntitiesSchema = z.object({
  entityNames: z.array(z.string()),
});

const DeleteObservationsSchema = z.object({
  deletions: z.array(
    z.object({
      entityName: z.string(),
      observations: z.array(z.string()),
    })
  ),
});

const DeleteRelationsSchema = z.object({
  relations: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relationType: z.string(),
    })
  ),
});

const SearchNodesSchema = z.object({
  query: z.string(),
});

const OpenNodesSchema = z.object({
  names: z.array(z.string()),
});

export async function createMemoryServer(): Promise<Server> {
  const storage = createStorageFromEnv();
  await storage.initialize();
  
  const manager = new KnowledgeGraphManager(storage);

  const server = new Server({
    name: "memory",
    version: "1.0.0",
  }, {
    capabilities: {
      tools: {},
    },
  });

  // Register all tools
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      switch (toolName) {
        case "memory__create_entities": {
          const parsed = CreateEntitiesSchema.parse(args);
          const results = await manager.createEntities(parsed.entities);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        case "memory__create_relations": {
          const parsed = CreateRelationsSchema.parse(args);
          const results = await manager.createRelations(parsed.relations);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        case "memory__add_observations": {
          const parsed = AddObservationsSchema.parse(args);
          const results = await manager.addObservations(parsed.observations);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        case "memory__delete_entities": {
          const parsed = DeleteEntitiesSchema.parse(args);
          await manager.deleteEntities(parsed.entityNames);
          return {
            content: [{
              type: "text",
              text: `Successfully deleted ${parsed.entityNames.length} entities`,
            }],
          };
        }

        case "memory__delete_observations": {
          const parsed = DeleteObservationsSchema.parse(args);
          await manager.deleteObservations(parsed.deletions);
          return {
            content: [{ type: "text", text: "Observations deleted successfully" }],
          };
        }

        case "memory__delete_relations": {
          const parsed = DeleteRelationsSchema.parse(args);
          await manager.deleteRelations(parsed.relations);
          return {
            content: [{
              type: "text",
              text: `Successfully deleted ${parsed.relations.length} relations`,
            }],
          };
        }

        case "memory__read_graph": {
          const graph = await manager.readGraph();
          return {
            content: [{ type: "text", text: JSON.stringify(graph, null, 2) }],
          };
        }

        case "memory__search_nodes": {
          const parsed = SearchNodesSchema.parse(args);
          const results = await manager.searchNodes(parsed.query);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        case "memory__open_nodes": {
          const parsed = OpenNodesSchema.parse(args);
          const results = await manager.openNodes(parsed.names);
          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "memory__create_entities",
          description: "Create multiple new entities in the knowledge graph",
          inputSchema: toolSchemas.memory__create_entities,
        },
        {
          name: "memory__create_relations",
          description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
          inputSchema: toolSchemas.memory__create_relations,
        },
        {
          name: "memory__add_observations",
          description: "Add new observations to existing entities in the knowledge graph",
          inputSchema: toolSchemas.memory__add_observations,
        },
        {
          name: "memory__delete_entities",
          description: "Delete multiple entities and their associated relations from the knowledge graph",
          inputSchema: toolSchemas.memory__delete_entities,
        },
        {
          name: "memory__delete_observations",
          description: "Delete specific observations from entities in the knowledge graph",
          inputSchema: toolSchemas.memory__delete_observations,
        },
        {
          name: "memory__delete_relations",
          description: "Delete multiple relations from the knowledge graph",
          inputSchema: toolSchemas.memory__delete_relations,
        },
        {
          name: "memory__read_graph",
          description: "Read the entire knowledge graph",
          inputSchema: toolSchemas.memory__read_graph,
        },
        {
          name: "memory__search_nodes",
          description: "Search for nodes in the knowledge graph based on a query",
          inputSchema: toolSchemas.memory__search_nodes,
        },
        {
          name: "memory__open_nodes",
          description: "Open specific nodes in the knowledge graph by their names",
          inputSchema: toolSchemas.memory__open_nodes,
        },
      ],
    };
  });

  return server;
}