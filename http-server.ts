#!/usr/bin/env node

import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServerFromFactory } from './server-factory.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { v4 as uuidv4 } from 'uuid';

interface SessionData {
  id: string;
  server: Server;
  transport: HTTPTransport | SSETransport;
  lastActivity: number;
}

const app = express();
app.use(express.json());

const sessions = new Map<string, SessionData>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Clean up inactive sessions
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      console.log(`Cleaning up inactive session: ${id}`);
      sessions.delete(id);
    }
  }
}, 60 * 1000); // Check every minute

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
    if (this.res && !this.res.headersSent) {
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
  const id = uuidv4();
  const server = await createServerFromFactory();
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
  } else {
    res.status(400).json({ error: 'Session is in SSE mode' });
  }
});

app.get('/session/:sessionId/events', async (req, res) => {
  const { sessionId } = req.params;
  
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  // Switch to SSE transport
  const sseTransport = new SSETransport();
  session.transport = sseTransport;
  await session.server.connect(sseTransport);
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  
  sseTransport.setResponse(res);
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
    sseTransport.close();
    sessions.delete(sessionId);
  });
});

app.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  session.transport.close();
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

export default function runHttpServer() {
  app.listen(PORT, () => {
    console.log(`MCP Memory HTTP Server listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}