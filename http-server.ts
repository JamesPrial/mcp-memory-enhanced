#!/usr/bin/env node

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMemoryServer } from './server-factory.js';
import { createStorageFromEnv } from './storage/factory.js';
import { KnowledgeGraphManager } from './knowledge-graph-manager.js';
import type { IStorageBackend } from './storage/interface.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { v4 as uuidv4 } from 'uuid';
import type { Server as HttpServer } from 'http';

interface SessionData {
  id: string;
  server: Server;
  transport: HTTPTransport | SSETransport;
  lastActivity: number;
  isSSE?: boolean;
}

const app = express();
app.use(express.json());

const sessions = new Map<string, SessionData>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// One storage backend / manager is shared across all sessions. Previously each
// session created its own backend (and, for SQLite, its own DB connection) that
// was never closed, leaking file descriptors as sessions came and went.
let sharedStorage: IStorageBackend | undefined;
let sharedManager: KnowledgeGraphManager | undefined;
let httpServer: HttpServer | undefined;
let cleanupInterval: ReturnType<typeof setInterval> | undefined;

class HTTPTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private res?: express.Response;

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.res) {
      this.res.json(message);
      this.res = undefined;
    }
  }

  setResponse(res: express.Response) {
    this.res = res;
  }

  handleMessage(message: JSONRPCMessage) {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  async close() {
    if (this.onclose) {
      this.onclose();
    }
  }

  async start() {
    // HTTP transport doesn't need initialization
  }

  error(error: Error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

class SSETransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private res?: express.Response;

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.res) {
      this.res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  }

  setResponse(res: express.Response) {
    this.res = res;
  }

  handleMessage(message: JSONRPCMessage) {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  async close() {
    if (this.res) {
      this.res.end();
      this.res = undefined;
    }
    if (this.onclose) {
      this.onclose();
    }
  }

  async start() {
    // SSE transport doesn't need initialization
  }

  error(error: Error) {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

async function createSession(): Promise<SessionData> {
  if (!sharedManager) {
    throw new Error('HTTP server not initialized');
  }
  const id = uuidv4();
  const server = createMemoryServer(sharedManager);
  const transport = new HTTPTransport();

  const session: SessionData = {
    id,
    server,
    transport,
    lastActivity: Date.now(),
  };

  await server.connect(transport);
  sessions.set(id, session);

  return session;
}

app.post('/session', async (_req, res) => {
  try {
    const session = await createSession();
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.post('/session/:sessionId/message', async (req, res) => {
  const { sessionId } = req.params;
  const message = req.body as JSONRPCMessage;

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  session.lastActivity = Date.now();

  if (session.transport instanceof HTTPTransport) {
    session.transport.setResponse(res);
    session.transport.handleMessage(message);
    // Response will be sent by the transport
  } else if (session.transport instanceof SSETransport) {
    // In SSE mode, handle the message and send response through SSE
    session.transport.handleMessage(message);
    res.status(202).json({ message: 'Message accepted for SSE processing' });
  } else {
    res.status(400).json({ error: 'Unknown transport mode' });
  }
});

app.get('/session/:sessionId/events', async (req, res) => {
  const { sessionId } = req.params;

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Only one SSE stream per session. A second /events call would connect the
  // server to a second transport and leak the first stream + its keep-alive.
  if (session.isSSE) {
    res.status(409).json({ error: 'Session already has an active SSE stream' });
    return;
  }

  // Mark session as SSE mode
  session.isSSE = true;
  session.lastActivity = Date.now();

  // Create SSE transport and connect to server
  const sseTransport = new SSETransport();
  session.transport = sseTransport;

  // Connect the SSE transport to the server
  await session.server.connect(sseTransport);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  sseTransport.setResponse(res);

  // Send initial connection event
  res.write(':connected\n\n');

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    void sseTransport.close();
    // Don't delete the session here - let the explicit DELETE endpoint handle it.
    // Just mark it as no longer in SSE mode so a new stream can be attached.
    if (session) {
      session.isSSE = false;
    }
  });
});

app.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  const session = sessions.get(sessionId);
  if (!session) {
    console.error(`Session ${sessionId} not found for deletion. Available sessions:`, Array.from(sessions.keys()));
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  void session.transport.close();
  sessions.delete(sessionId);
  res.json({ message: 'Session closed' });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.HTTP_PORT || 3000;

async function closeAll(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }

  // Close every live session transport so no SSE stream is left dangling.
  for (const session of sessions.values()) {
    try {
      await session.transport.close();
    } catch {
      // ignore individual transport close errors
    }
  }
  sessions.clear();

  await new Promise<void>((resolve) => {
    if (httpServer) {
      httpServer.close(() => resolve());
      // Force-close lingering keep-alive/SSE sockets so close() can complete
      // promptly instead of waiting on idle connections (Node >= 18.2).
      (httpServer as { closeAllConnections?: () => void }).closeAllConnections?.();
    } else {
      resolve();
    }
  });
  httpServer = undefined;

  if (sharedStorage) {
    try {
      await sharedStorage.close();
    } catch (error) {
      console.error('Error closing storage:', error);
    }
    sharedStorage = undefined;
    sharedManager = undefined;
  }
}

export default async function runHttpServer(): Promise<{ close: () => Promise<void> }> {
  // Initialise the single shared storage backend up front.
  sharedStorage = createStorageFromEnv();
  await sharedStorage.initialize();
  sharedManager = new KnowledgeGraphManager(sharedStorage);

  // Evict inactive sessions and release their transports.
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (now - session.lastActivity > SESSION_TIMEOUT) {
        console.log(`Cleaning up inactive session: ${id}`);
        void session.transport.close();
        sessions.delete(id);
      }
    }
  }, 60 * 1000); // Check every minute

  await new Promise<void>((resolve) => {
    httpServer = app.listen(PORT, () => {
      console.log(`MCP Memory HTTP Server listening on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      resolve();
    });
  });

  return { close: closeAll };
}
