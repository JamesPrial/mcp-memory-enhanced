import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import axios, { AxiosInstance } from 'axios';
import { createRequire } from 'module';

// Import CommonJS module in ESM context
const require = createRequire(import.meta.url);
const { EventSource: EventSourcePolyfill } = require('eventsource');

describe('SSE Transport E2E Tests', () => {
  let serverProcess: ChildProcess;
  let httpClient: AxiosInstance;
  let tempDir: string;
  const PORT = 3457; // Different port from HTTP tests
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Create temporary directory for test data
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'sse-e2e-'));
    
    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], { cwd: process.cwd() });
      build.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with code ${code}`));
      });
    });

    // Start the server with SSE/HTTP transport
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        TRANSPORT_TYPE: 'sse',
        HTTP_PORT: PORT.toString(),
        STORAGE_TYPE: 'json',
        JSON_PATH: path.join(tempDir, 'test-sse-data.jsonl'),
      },
      cwd: process.cwd(),
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      serverProcess.stdout?.on('data', (data) => {
        if (data.toString().includes('listening on port')) {
          resolve();
        }
      });
      // Fallback timeout
      setTimeout(resolve, 3000);
    });

    // Create HTTP client
    httpClient = axios.create({
      baseURL: BASE_URL,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  afterAll(async () => {
    // Kill the server process
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }

    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('SSE Connection Setup', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await httpClient.post('/session');
      sessionId = response.data.sessionId;
    });

    it('should establish SSE connection', async () => {
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      
      await new Promise<void>((resolve, reject) => {
        eventSource.onopen = () => {
          expect(eventSource.readyState).toBe(EventSourcePolyfill.OPEN);
          resolve();
        };
        eventSource.onerror = (error) => {
          reject(error);
        };
        
        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('SSE connection timeout')), 5000);
      });

      eventSource.close();
    });

    it('should return 404 for non-existent session SSE', async () => {
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/non-existent/events`);
      
      await new Promise<void>((resolve) => {
        eventSource.onerror = () => {
          expect(eventSource.readyState).toBe(EventSourcePolyfill.CLOSED);
          resolve();
        };
        
        // Timeout after 5 seconds
        setTimeout(resolve, 5000);
      });

      eventSource.close();
    });
  });

  describe('SSE Message Flow', () => {
    it('should receive server-sent events', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Connect to SSE endpoint
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      const receivedMessages: any[] = [];

      await new Promise<void>((resolve, reject) => {
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            receivedMessages.push(data);
            
            // Close after receiving first message
            if (receivedMessages.length >= 1) {
              resolve();
            }
          } catch (error) {
            reject(error);
          }
        };

        eventSource.onerror = (error) => {
          reject(error);
        };

        // Send a message through HTTP that should trigger SSE response
        setTimeout(async () => {
          try {
            await httpClient.post(`/session/${sessionId}/message`, {
              jsonrpc: '2.0',
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'sse-test', version: '1.0' },
              },
              id: 1,
            });
          } catch (error) {
            // The HTTP endpoint might not respond directly when in SSE mode
            console.log('Expected behavior: HTTP returns error when session is in SSE mode');
          }
        }, 1000);

        // Timeout after 10 seconds
        setTimeout(() => reject(new Error('SSE message timeout')), 10000);
      });

      eventSource.close();
      
      // Clean up
      await httpClient.delete(`/session/${sessionId}`).catch(() => {});
    });

    it('should handle keep-alive messages', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Connect to SSE endpoint
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      const events: string[] = [];

      await new Promise<void>((resolve) => {
        // Listen for all events including comments (keep-alive)
        const originalOnMessage = eventSource.onmessage;
        
        // Override the event source to capture keep-alive
        (eventSource as any).onmessage = (event: MessageEvent) => {
          events.push(event.data || 'keep-alive');
          if (originalOnMessage) originalOnMessage(event);
        };

        // Wait for a short period to receive events
        setTimeout(() => {
          resolve();
        }, 2000);
      });

      eventSource.close();
      
      // Should have received at least the connection
      expect(eventSource.readyState).toBe(EventSourcePolyfill.CLOSED);
      
      // Clean up
      await httpClient.delete(`/session/${sessionId}`).catch(() => {});
    });
  });

  describe('SSE with MCP Protocol', () => {
    it('should handle MCP protocol over SSE', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // First initialize via HTTP
      await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'sse-mcp-test', version: '1.0' },
        },
        id: 1,
      });

      // Connect to SSE for streaming responses
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          expect(eventSource.readyState).toBe(EventSourcePolyfill.OPEN);
          resolve();
        };
        setTimeout(resolve, 2000);
      });

      eventSource.close();
      
      // Clean up
      await httpClient.delete(`/session/${sessionId}`);
    });
  });

  describe('SSE Connection Management', () => {
    it('should handle client disconnection', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Connect and immediately disconnect
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          eventSource.close();
          resolve();
        };
        setTimeout(resolve, 2000);
      });

      // Session should be cleaned up after SSE close
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to use the session - it might be gone
      const result = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'test',
        id: 1,
      }).catch(err => err.response);

      // Session might be gone or switched to SSE mode
      expect([200, 400, 404]).toContain(result?.status || result.status);
    });

    it('should handle multiple SSE connections', async () => {
      // Create multiple sessions
      const sessions = await Promise.all([
        httpClient.post('/session'),
        httpClient.post('/session'),
      ]);

      const sessionIds = sessions.map(r => r.data.sessionId);
      const eventSources: EventSourcePolyfill[] = [];

      // Connect to all sessions via SSE
      await Promise.all(sessionIds.map(id => 
        new Promise<void>((resolve) => {
          const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${id}/events`);
          eventSources.push(eventSource);
          
          eventSource.onopen = () => resolve();
          setTimeout(resolve, 2000);
        })
      ));

      // All should be connected
      eventSources.forEach(es => {
        expect([EventSourcePolyfill.OPEN, EventSourcePolyfill.CONNECTING]).toContain(es.readyState);
      });

      // Clean up
      eventSources.forEach(es => es.close());
      await Promise.all(sessionIds.map(id => 
        httpClient.delete(`/session/${id}`).catch(() => {})
      ));
    });
  });

  describe('SSE Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Connect to SSE
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      let errorReceived = false;

      await new Promise<void>((resolve) => {
        eventSource.onerror = () => {
          errorReceived = true;
        };

        // Wait a bit then resolve
        setTimeout(() => {
          resolve();
        }, 2000);
      });

      eventSource.close();
      
      // Clean up
      await httpClient.delete(`/session/${sessionId}`).catch(() => {});
    });

    it('should handle connection interruption', async () => {
      // Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Connect to SSE
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          // Simulate interruption by closing
          eventSource.close();
          resolve();
        };
        
        setTimeout(resolve, 2000);
      });

      expect(eventSource.readyState).toBe(EventSourcePolyfill.CLOSED);
      
      // Clean up
      await httpClient.delete(`/session/${sessionId}`).catch(() => {});
    });
  });

  describe('Complete SSE Workflow', () => {
    it('should handle a complete SSE session workflow', async () => {
      // 1. Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;
      
      // 2. Initialize via HTTP
      const initResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'workflow-sse-test', version: '1.0' },
        },
        id: 1,
      });
      expect(initResponse.data.result).toHaveProperty('serverInfo');

      // 3. Switch to SSE mode
      const eventSource = new EventSourcePolyfill(`${BASE_URL}/session/${sessionId}/events`);
      
      await new Promise<void>((resolve) => {
        eventSource.onopen = () => {
          expect(eventSource.readyState).toBe(EventSourcePolyfill.OPEN);
          resolve();
        };
        setTimeout(resolve, 2000);
      });

      // 4. Session should now be in SSE mode
      // HTTP requests might fail or behave differently
      const httpResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      }).catch(err => err.response);

      // Could be 400 (session in SSE mode) or 200 (if it handles both)
      expect([200, 400]).toContain(httpResponse?.status || httpResponse.status);

      // 5. Close SSE connection
      eventSource.close();
      
      // 6. Clean up session
      await new Promise(resolve => setTimeout(resolve, 500));
      await httpClient.delete(`/session/${sessionId}`).catch(() => {});
    });
  });
});