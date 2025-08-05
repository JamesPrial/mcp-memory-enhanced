import express from 'express';
import { createMemoryServer } from './server-factory.js';
import { randomUUID } from 'crypto';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(express.json());

// Custom HTTP Transport implementation
class HTTPTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  private res?: express.Response;
  
  async start(): Promise<void> {
    // HTTP transport starts immediately
  }
  
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.res) {
      this.res.json(message);
      this.res = undefined;
    }
  }
  
  async close(): Promise<void> {
    if (this.onclose) {
      this.onclose();
    }
  }
  
  setResponse(res: express.Response): void {
    this.res = res;
  }
  
  async handleRequest(request: JSONRPCRequest): Promise<void> {
    if (this.onmessage) {
      this.onmessage(request);
    }
  }
}

// SSE Transport implementation
class SSETransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  private res?: express.Response;
  
  async start(): Promise<void> {
    // SSE transport starts when connection is established
  }
  
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.res && !this.res.headersSent) {
      this.res.write(`data: ${JSON.stringify(message)}\n\n`);
    }
  }
  
  async close(): Promise<void> {
    if (this.res) {
      this.res.end();
    }
    if (this.onclose) {
      this.onclose();
    }
  }
  
  setResponse(res: express.Response): void {
    this.res = res;
  }
  
  async handleRequest(request: JSONRPCRequest): Promise<void> {
    if (this.onmessage) {
      this.onmessage(request);
    }
  }
}

// Session management
interface Session {
  id: string;
  transport: HTTPTransport | SSETransport;
  server: Awaited<ReturnType<typeof createMemoryServer>>;
  lastActivity: Date;
}

const sessions = new Map<string, Session>();

// Clean up inactive sessions every 5 minutes
setInterval(() => {
  const now = new Date();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [id, session] of sessions) {
    if (now.getTime() - session.lastActivity.getTime() > timeout) {
      console.log(`Cleaning up inactive session: ${id}`);
      session.transport.close();
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    sessions: sessions.size,
    transport: 'http',
    timestamp: new Date().toISOString()
  });
});

// Initialize or handle JSON-RPC requests
app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string || randomUUID();
    
    let session = sessions.get(sessionId);
    
    if (!session) {
      // Create new session
      const server = await createMemoryServer();
      const transport = new HTTPTransport();
      
      await server.connect(transport);
      
      session = {
        id: sessionId,
        transport,
        server,
        lastActivity: new Date()
      };
      
      sessions.set(sessionId, session);
      console.log(`Created new session: ${sessionId}`);
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Set response for this request
    (session.transport as HTTPTransport).setResponse(res);
    
    // Handle the request
    await session.transport.handleRequest(req.body);
    
    res.setHeader('X-Session-Id', sessionId);
    // Response will be sent by transport.send()
    
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    });
  }
});

// SSE endpoint for streaming
app.get('/mcp', (req, res) => {
  const sessionId = req.headers['x-session-id'] as string;
  
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({
      error: 'Session not found. Please POST to /mcp first to initialize.'
    });
    return;
  }
  
  const session = sessions.get(sessionId)!;
  session.lastActivity = new Date();
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Session-Id', sessionId);
  
  // Replace transport with SSE transport
  const sseTransport = new SSETransport();
  sseTransport.setResponse(res);
  
  // Copy callbacks from old transport
  const oldTransport = session.transport;
  sseTransport.onmessage = oldTransport.onmessage;
  sseTransport.onclose = oldTransport.onclose;
  sseTransport.onerror = oldTransport.onerror;
  
  session.transport = sseTransport;
  
  // Send initial connection event
  res.write(`data: {"type":"connected","sessionId":"${sessionId}"}\n\n`);
  
  // Clean up on disconnect
  req.on('close', () => {
    console.log(`SSE stream closed for session: ${sessionId}`);
  });
});

// Terminate session
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['x-session-id'] as string;
  
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({
      error: 'Session not found'
    });
    return;
  }
  
  const session = sessions.get(sessionId)!;
  session.transport.close();
  sessions.delete(sessionId);
  console.log(`Terminated session: ${sessionId}`);
  
  res.json({
    message: 'Session terminated',
    sessionId
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 6970;

app.listen(PORT, () => {
  console.log(`MCP Memory HTTP Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Transport type: HTTP/SSE`);
});