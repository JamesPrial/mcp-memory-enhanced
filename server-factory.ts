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

export async function createServerFromFactory(): Promise<Server> {
  const storage: IStorageBackend = createStorageFromEnv();
  await storage.initialize();
  const manager = new KnowledgeGraphManager(storage);

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

  // Tool definitions and dispatch are shared with the stdio transport via
  // ./tools.ts so the two transports can never drift.
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: memoryTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callMemoryTool(manager, name, args as Record<string, unknown> | undefined);
  });

  return server;
}
