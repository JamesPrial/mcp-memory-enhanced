import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { createStorageFromEnv } from './storage/factory.js';
import type { IStorageBackend } from './storage/interface.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { memoryTools, callMemoryTool } from './tools.js';
import { VERSION } from './version.js';

/**
 * Build an MCP server bound to an existing KnowledgeGraphManager. Tool
 * definitions and dispatch are shared with the stdio transport via ./tools.ts
 * so the two transports can never drift. Callers that handle many sessions
 * should share one manager (and therefore one storage backend) across them.
 */
export function createMemoryServer(manager: KnowledgeGraphManager): Server {
  const server = new Server(
    {
      name: 'memory',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: memoryTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callMemoryTool(manager, name, args as Record<string, unknown> | undefined);
  });

  return server;
}

/**
 * Convenience factory that creates a storage backend from the environment and
 * returns a server bound to it. Each call creates its own backend, so prefer
 * createMemoryServer with a shared manager when serving multiple sessions.
 */
export async function createServerFromFactory(): Promise<Server> {
  const storage: IStorageBackend = createStorageFromEnv();
  await storage.initialize();
  const manager = new KnowledgeGraphManager(storage);
  return createMemoryServer(manager);
}
