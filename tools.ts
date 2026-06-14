import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { Entity, Relation } from './types.js';
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
  GetStatsSchema,
} from './server-factory-schemas.js';

/**
 * Single source of truth for the memory tools, shared by every transport
 * (stdio in index.ts and HTTP/SSE in server-factory.ts) so the two can never
 * drift in tool names, schemas, descriptions, or behaviour.
 *
 * Tool names are prefixed with `memory__` to namespace them on clients that
 * connect to multiple MCP servers.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export const memoryTools: ToolDefinition[] = [
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
  {
    name: 'memory__get_stats',
    description: 'Get statistics about the knowledge graph storage',
    inputSchema: GetStatsSchema,
  },
];

function toText(value: unknown): CallToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

/**
 * Execute a memory tool by name. Shared by all transports so behaviour is
 * identical regardless of how the request arrived.
 */
export async function callMemoryTool(
  manager: KnowledgeGraphManager,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<CallToolResult> {
  // read_graph and get_stats take no arguments.
  if (name === 'memory__read_graph') {
    return toText(await manager.readGraph());
  }
  if (name === 'memory__get_stats') {
    return toText(await manager.getStats());
  }

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  switch (name) {
    case 'memory__create_entities':
      return toText(await manager.createEntities(args.entities as Entity[]));
    case 'memory__create_relations':
      return toText(await manager.createRelations(args.relations as Relation[]));
    case 'memory__add_observations':
      return toText(await manager.addObservations(args.observations as { entityName: string; contents: string[] }[]));
    case 'memory__delete_entities':
      await manager.deleteEntities(args.entityNames as string[]);
      return toText('Entities deleted successfully');
    case 'memory__delete_observations':
      await manager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return toText('Observations deleted successfully');
    case 'memory__delete_relations':
      await manager.deleteRelations(args.relations as Relation[]);
      return toText('Relations deleted successfully');
    case 'memory__search_nodes':
      return toText(await manager.searchNodes(args.query as string));
    case 'memory__open_nodes':
      return toText(await manager.openNodes(args.names as string[]));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
