#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import { createStorageFromEnv } from './storage/factory.js';
import { startHealthServer } from './health-server.js';
import { memoryTools, callMemoryTool } from './tools.js';
import { VERSION } from './version.js';

// Initialize storage backend and knowledge graph manager
let knowledgeGraphManager: KnowledgeGraphManager;

// Cleanup callbacks run (in reverse order) on graceful shutdown.
const cleanups: Array<() => Promise<void> | void> = [];
let shuttingDown = false;

async function shutdown(reason: string, code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`Shutting down (${reason})...`);
  for (const cleanup of [...cleanups].reverse()) {
    try {
      await cleanup();
    } catch (err) {
      console.error('Error during shutdown cleanup:', err);
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

async function initializeStorage() {
  const storage = createStorageFromEnv();
  await storage.initialize();
  knowledgeGraphManager = new KnowledgeGraphManager(storage);
  cleanups.push(() => storage.close());

  // Log storage type for debugging
  const storageType = process.env.STORAGE_TYPE || 'json';
  console.error(`Using ${storageType} storage backend`);
}

// The server instance and tools exposed to Claude. Tool definitions and the
// dispatch logic are shared with the HTTP/SSE transport via ./tools.ts.
const server = new Server({
  name: "memory",
  version: VERSION,
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: memoryTools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return callMemoryTool(
    knowledgeGraphManager,
    name,
    args as Record<string, unknown> | undefined
  );
});

async function main() {
  // Check if HTTP/SSE transport is requested
  const transportType = process.env.TRANSPORT_TYPE?.toLowerCase();
  if (transportType === 'http' || transportType === 'sse') {
    // Use dynamic import for HTTP server
    const { default: runHttpServer } = await import('./http-server.js');
    const handle = await runHttpServer();
    cleanups.push(() => handle.close());
    return;
  }

  // Initialize storage before starting server
  await initializeStorage();

  // Start health check server if port is specified
  const healthPort = parseInt(process.env.PORT || '6970', 10);
  if (!isNaN(healthPort) && healthPort > 0 && healthPort <= 65535) {
    const healthServer = startHealthServer(healthPort, knowledgeGraphManager);
    cleanups.push(() => new Promise<void>((resolve) => healthServer.close(() => resolve())));
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Knowledge Graph MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
