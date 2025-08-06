import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';
import { startHealthServer } from '../../health-server.js';
import { KnowledgeGraphManager } from '../../knowledge-graph-manager.js';

// Mock http module
vi.mock('http', () => ({
  createServer: vi.fn()
}));

describe('health-server', () => {
  let mockManager: any;
  let mockServer: any;
  let serverCallback: any;
  let originalConsoleError: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Save original console.error
    originalConsoleError = console.error;
    console.error = vi.fn();
    
    // Create mock manager
    mockManager = {
      getStats: vi.fn()
    };

    // Create mock server
    mockServer = {
      listen: vi.fn((port, callback) => {
        if (callback) callback();
      })
    };

    // Mock createServer to capture the callback
    vi.mocked(http.createServer).mockImplementation((callback: any) => {
      serverCallback = callback;
      return mockServer as any;
    });
  });

  afterEach(() => {
    // Restore console.error
    console.error = originalConsoleError;
    vi.restoreAllMocks();
  });

  describe('startHealthServer', () => {
    it('should create an HTTP server', () => {
      startHealthServer(3000, mockManager as KnowledgeGraphManager);
      
      expect(http.createServer).toHaveBeenCalledOnce();
      expect(http.createServer).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should listen on the specified port', () => {
      startHealthServer(3000, mockManager as KnowledgeGraphManager);
      
      expect(mockServer.listen).toHaveBeenCalledWith(3000, expect.any(Function));
    });

    it('should log when server starts', () => {
      startHealthServer(3000, mockManager as KnowledgeGraphManager);
      
      expect(console.error).toHaveBeenCalledWith('Health check server listening on port 3000');
    });

    it('should return the server instance', () => {
      const result = startHealthServer(3000, mockManager as KnowledgeGraphManager);
      
      expect(result).toBe(mockServer);
    });

    it('should handle different port numbers', () => {
      startHealthServer(8080, mockManager as KnowledgeGraphManager);
      
      expect(mockServer.listen).toHaveBeenCalledWith(8080, expect.any(Function));
      expect(console.error).toHaveBeenCalledWith('Health check server listening on port 8080');
    });
  });

  describe('Health endpoint', () => {
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      // Create mock request and response objects
      mockReq = {
        url: '/health',
        method: 'GET'
      };

      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      // Start the server to capture the callback
      startHealthServer(3000, mockManager as KnowledgeGraphManager);
    });

    it('should respond with healthy status when manager works', async () => {
      const stats = {
        entityCount: 10,
        relationCount: 5,
        observationCount: 20
      };
      mockManager.getStats.mockResolvedValue(stats);

      await serverCallback(mockReq, mockRes);

      expect(mockManager.getStats).toHaveBeenCalledOnce();
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.status).toBe('healthy');
      expect(response.timestamp).toBeDefined();
      expect(response.storage.stats).toEqual(stats);
    });

    it('should include storage type from environment', async () => {
      process.env.STORAGE_TYPE = 'sqlite';
      mockManager.getStats.mockResolvedValue({});

      await serverCallback(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.storage.type).toBe('sqlite');

      delete process.env.STORAGE_TYPE;
    });

    it('should default to json storage type', async () => {
      delete process.env.STORAGE_TYPE;
      mockManager.getStats.mockResolvedValue({});

      await serverCallback(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.storage.type).toBe('json');
    });

    it('should respond with unhealthy status when manager fails', async () => {
      const error = new Error('Database connection failed');
      mockManager.getStats.mockRejectedValue(error);

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(503, { 'Content-Type': 'application/json' });
      
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.status).toBe('unhealthy');
      expect(response.error).toBe('Database connection failed');
      expect(response.timestamp).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      mockManager.getStats.mockRejectedValue('String error');

      await serverCallback(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.status).toBe('unhealthy');
      expect(response.error).toBe('Unknown error');
    });

    it('should handle null/undefined errors', async () => {
      mockManager.getStats.mockRejectedValue(null);

      await serverCallback(mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error).toBe('Unknown error');
    });
  });

  describe('Non-health endpoints', () => {
    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      mockRes = {
        writeHead: vi.fn(),
        end: vi.fn()
      };

      startHealthServer(3000, mockManager as KnowledgeGraphManager);
    });

    it('should return 404 for unknown paths', async () => {
      mockReq = {
        url: '/unknown',
        method: 'GET'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
      expect(mockRes.end).toHaveBeenCalledWith('Not Found');
    });

    it('should return 404 for POST to /health', async () => {
      mockReq = {
        url: '/health',
        method: 'POST'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
      expect(mockRes.end).toHaveBeenCalledWith('Not Found');
    });

    it('should return 404 for PUT to /health', async () => {
      mockReq = {
        url: '/health',
        method: 'PUT'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should return 404 for DELETE to /health', async () => {
      mockReq = {
        url: '/health',
        method: 'DELETE'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should return 404 for root path', async () => {
      mockReq = {
        url: '/',
        method: 'GET'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should return 404 for health with trailing slash', async () => {
      mockReq = {
        url: '/health/',
        method: 'GET'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should handle undefined URL', async () => {
      mockReq = {
        method: 'GET'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should handle undefined method', async () => {
      mockReq = {
        url: '/health'
      };

      await serverCallback(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });
  });

  describe('Concurrent requests', () => {
    it('should handle multiple concurrent health checks', async () => {
      const stats = { entityCount: 5 };
      mockManager.getStats.mockResolvedValue(stats);

      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const requests = Array(10).fill(null).map(() => ({
        url: '/health',
        method: 'GET'
      }));

      const responses = Array(10).fill(null).map(() => ({
        writeHead: vi.fn(),
        end: vi.fn()
      }));

      // Execute all requests concurrently
      await Promise.all(
        requests.map((req, i) => serverCallback(req, responses[i]))
      );

      // Verify all responded correctly
      responses.forEach(res => {
        expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        const response = JSON.parse(res.end.mock.calls[0][0]);
        expect(response.status).toBe('healthy');
      });

      expect(mockManager.getStats).toHaveBeenCalledTimes(10);
    });

    it('should handle mixed success and failure responses', async () => {
      let callCount = 0;
      mockManager.getStats.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          return Promise.reject(new Error('Intermittent failure'));
        }
        return Promise.resolve({ entityCount: 1 });
      });

      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/health', method: 'GET' };
      const res1 = { writeHead: vi.fn(), end: vi.fn() };
      const res2 = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res1);
      await serverCallback(req, res2);

      expect(res1.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(res2.writeHead).toHaveBeenCalledWith(503, { 'Content-Type': 'application/json' });
    });
  });

  describe('Edge cases', () => {
    it('should handle manager.getStats returning undefined', async () => {
      mockManager.getStats.mockResolvedValue(undefined);

      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/health', method: 'GET' };
      const res = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.storage.stats).toBeUndefined();
    });

    it('should handle manager.getStats returning null', async () => {
      mockManager.getStats.mockResolvedValue(null);

      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/health', method: 'GET' };
      const res = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.storage.stats).toBeNull();
    });

    it('should include timestamp in ISO format', async () => {
      mockManager.getStats.mockResolvedValue({});

      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/health', method: 'GET' };
      const res = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res);

      const response = JSON.parse(res.end.mock.calls[0][0]);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle case-sensitive URL matching', async () => {
      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/Health', method: 'GET' };
      const res = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });

    it('should handle case-sensitive method matching', async () => {
      startHealthServer(3000, mockManager as KnowledgeGraphManager);

      const req = { url: '/health', method: 'get' };
      const res = { writeHead: vi.fn(), end: vi.fn() };

      await serverCallback(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'text/plain' });
    });
  });
});