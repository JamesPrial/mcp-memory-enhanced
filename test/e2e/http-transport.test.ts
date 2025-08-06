import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import axios, { AxiosInstance } from 'axios';

describe('HTTP Transport E2E Tests', () => {
  let serverProcess: ChildProcess;
  let httpClient: AxiosInstance;
  let tempDir: string;
  const PORT = 3456; // Use a different port to avoid conflicts
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    // Create temporary directory for test data
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'http-e2e-'));
    
    // Build the project first
    await new Promise<void>((resolve, reject) => {
      const build = spawn('npm', ['run', 'build'], { cwd: process.cwd() });
      build.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Build failed with code ${code}`));
      });
    });

    // Start the server with HTTP transport
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        TRANSPORT_TYPE: 'http',
        HTTP_PORT: PORT.toString(),
        STORAGE_TYPE: 'json',
        JSON_PATH: path.join(tempDir, 'test-data.jsonl'),
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

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await httpClient.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
      expect(response.data).toHaveProperty('sessions', 0);
      expect(response.data).toHaveProperty('timestamp');
    });
  });

  describe('Session Management', () => {
    let sessionId: string;

    it('should create a new session', async () => {
      const response = await httpClient.post('/session');
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sessionId');
      sessionId = response.data.sessionId;
      expect(sessionId).toBeTruthy();
    });

    it('should handle multiple session creation', async () => {
      const sessions = await Promise.all([
        httpClient.post('/session'),
        httpClient.post('/session'),
        httpClient.post('/session'),
      ]);

      const sessionIds = sessions.map(r => r.data.sessionId);
      const uniqueIds = new Set(sessionIds);
      
      expect(uniqueIds.size).toBe(3); // All should be unique
      
      // Clean up
      await Promise.all(sessionIds.map(id => 
        httpClient.delete(`/session/${id}`).catch(() => {})
      ));
    });

    it('should delete a session', async () => {
      const createResponse = await httpClient.post('/session');
      const sessionId = createResponse.data.sessionId;
      
      const deleteResponse = await httpClient.delete(`/session/${sessionId}`);
      
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.data).toEqual({ message: 'Session closed' });
      
      // Verify session is gone
      await expect(
        httpClient.post(`/session/${sessionId}/message`, {
          jsonrpc: '2.0',
          method: 'test',
        })
      ).rejects.toThrow();
    });

    it('should return 404 for non-existent session', async () => {
      await expect(
        httpClient.delete('/session/non-existent-id')
      ).rejects.toMatchObject({
        response: {
          status: 404,
          data: { error: 'Session not found' },
        },
      });
    });
  });

  describe('Message Handling', () => {
    let sessionId: string;

    beforeEach(async () => {
      const response = await httpClient.post('/session');
      sessionId = response.data.sessionId;
    });

    it('should handle MCP initialization message', async () => {
      const message = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
        id: 1,
      };

      const response = await httpClient.post(`/session/${sessionId}/message`, message);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('jsonrpc', '2.0');
      expect(response.data).toHaveProperty('id', 1);
      expect(response.data).toHaveProperty('result');
      expect(response.data.result).toHaveProperty('protocolVersion');
      expect(response.data.result).toHaveProperty('serverInfo');
    });

    it('should handle tool listing', async () => {
      // First initialize
      await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

      // Then list tools
      const response = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toHaveProperty('tools');
      expect(Array.isArray(response.data.result.tools)).toBe(true);
      expect(response.data.result.tools.length).toBeGreaterThan(0);
    });

    it('should handle tool calls', async () => {
      // Initialize session
      await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
        id: 1,
      });

      // Call create_entities tool
      const response = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'memory__create_entities',
          arguments: {
            entities: [
              {
                name: 'HTTP Test Entity',
                entityType: 'Test',
                observations: ['Created via HTTP'],
              },
            ],
          },
        },
        id: 2,
      });

      expect(response.status).toBe(200);
      // Log to see what we're actually getting
      if (!response.data.result) {
        console.log('Tool call response:', JSON.stringify(response.data, null, 2));
      }
      expect(response.data).toHaveProperty('result');
      expect(response.data.result).toHaveProperty('content');
    });

    it('should handle errors gracefully', async () => {
      const response = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'invalid_method',
        id: 1,
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('error');
    });

    it('should handle malformed JSON-RPC messages', async () => {
      const response = await httpClient.post(`/session/${sessionId}/message`, {
        invalid: 'message',
      }).catch(err => err.response);

      // Malformed messages might return 400 or 200 with error or timeout
      if (response) {
        expect([200, 400]).toContain(response.status);
        if (response.status === 200) {
          expect(response.data).toHaveProperty('error');
        }
      } else {
        // Server might not respond to malformed messages
        expect(response).toBeUndefined();
      }
    });
  });

  describe('Complete Workflow', () => {
    it('should handle a complete MCP session workflow', async () => {
      // 1. Create session
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // 2. Initialize
      const initResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'workflow-test', version: '1.0' },
        },
        id: 1,
      });
      expect(initResponse.data.result).toHaveProperty('serverInfo');

      // 3. List tools
      const toolsResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      });
      expect(toolsResponse.data.result.tools.length).toBeGreaterThan(0);

      // 4. Create entities
      const createResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'memory__create_entities',
          arguments: {
            entities: [
              { name: 'Entity A', entityType: 'Type1', observations: ['Obs 1'] },
              { name: 'Entity B', entityType: 'Type2', observations: ['Obs 2'] },
            ],
          },
        },
        id: 3,
      });
      expect(createResponse.data.result).toBeDefined();

      // 5. Create relations
      const relationsResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'memory__create_relations',
          arguments: {
            relations: [
              { from: 'Entity A', to: 'Entity B', relationType: 'connects' },
            ],
          },
        },
        id: 4,
      });
      expect(relationsResponse.data.result).toBeDefined();

      // 6. Read graph
      const graphResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'memory__read_graph',
          arguments: {},
        },
        id: 5,
      });
      expect(graphResponse.data.result).toBeDefined();

      // 7. Close session
      const closeResponse = await httpClient.delete(`/session/${sessionId}`);
      expect(closeResponse.data).toEqual({ message: 'Session closed' });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent requests to different sessions', async () => {
      // Create multiple sessions
      const sessions = await Promise.all([
        httpClient.post('/session'),
        httpClient.post('/session'),
      ]);
      
      const [session1, session2] = sessions.map(r => r.data.sessionId);

      // Send concurrent messages to different sessions
      const results = await Promise.all([
        httpClient.post(`/session/${session1}/message`, {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'client1', version: '1.0' },
          },
          id: 1,
        }),
        httpClient.post(`/session/${session2}/message`, {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'client2', version: '1.0' },
          },
          id: 1,
        }),
      ]);

      // Both should succeed
      expect(results[0].data.result).toHaveProperty('serverInfo');
      expect(results[1].data.result).toHaveProperty('serverInfo');

      // Clean up
      await Promise.all([
        httpClient.delete(`/session/${session1}`),
        httpClient.delete(`/session/${session2}`),
      ]);
    });

    it('should handle rapid sequential requests', async () => {
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Initialize first
      await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'rapid-test', version: '1.0' },
        },
        id: 1,
      });

      // Send multiple requests rapidly
      const requests = Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: '2.0' as const,
        method: 'tools/call',
        params: {
          name: 'memory__create_entities',
          arguments: {
            entities: [{
              name: `Rapid Entity ${i}`,
              entityType: 'Test',
              observations: [`Created at ${i}`],
            }],
          },
        },
        id: i + 2,
      }));

      const responses = [];
      for (const request of requests) {
        const response = await httpClient.post(`/session/${sessionId}/message`, request);
        responses.push(response);
      }

      // All should succeed
      expect(responses).toHaveLength(10);
      responses.forEach(r => {
        expect(r.status).toBe(200);
        expect(r.data).toHaveProperty('result');
      });

      // Clean up
      await httpClient.delete(`/session/${sessionId}`);
    });
  });

  describe('Error Recovery', () => {
    it('should recover from server errors', async () => {
      const sessionResponse = await httpClient.post('/session');
      const sessionId = sessionResponse.data.sessionId;

      // Send invalid tool call
      const errorResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'non_existent_tool',
          arguments: {},
        },
        id: 1,
      });

      expect(errorResponse.data).toHaveProperty('error');

      // Should still be able to use the session
      const validResponse = await httpClient.post(`/session/${sessionId}/message`, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'recovery-test', version: '1.0' },
        },
        id: 2,
      });

      expect(validResponse.data).toHaveProperty('result');

      // Clean up
      await httpClient.delete(`/session/${sessionId}`);
    });
  });
});