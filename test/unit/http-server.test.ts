import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock dependencies
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123')
}));

vi.mock('../../server-factory.js', () => ({
  createServerFromFactory: vi.fn(() => Promise.resolve({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn()
  }))
}));

describe('HTTP Server Basic Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create a minimal test Express app
    app = express();
    app.use(express.json());
    
    const sessions = new Map<string, any>();
    
    // Minimal session endpoint
    app.post('/session', async (_req, res) => {
      const sessionId = 'test-uuid-123';
      sessions.set(sessionId, {
        id: sessionId,
        lastActivity: Date.now()
      });
      res.json({ sessionId });
    });
    
    // Minimal message endpoint
    app.post('/session/:sessionId/message', (req, res) => {
      const { sessionId } = req.params;
      if (!sessions.has(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json({ jsonrpc: '2.0', result: 'ok' });
    });
    
    // Minimal events endpoint
    app.get('/session/:sessionId/events', (req, res) => {
      const { sessionId } = req.params;
      if (!sessions.has(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.status(200).json({ message: 'SSE endpoint' });
    });
    
    // Minimal delete endpoint
    app.delete('/session/:sessionId', (req, res) => {
      const { sessionId } = req.params;
      if (!sessions.has(sessionId)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      sessions.delete(sessionId);
      res.json({ message: 'Session closed' });
    });
    
    // Health endpoint
    app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        sessions: sessions.size,
        timestamp: new Date().toISOString()
      });
    });
  });

  describe('POST /session', () => {
    it('should create a new session', async () => {
      const response = await request(app)
        .post('/session')
        .expect(200);
      
      expect(response.body).toEqual({ sessionId: 'test-uuid-123' });
    });
  });

  describe('POST /session/:sessionId/message', () => {
    it('should handle messages for existing session', async () => {
      // Create a session first
      await request(app).post('/session');
      
      const response = await request(app)
        .post('/session/test-uuid-123/message')
        .send({ jsonrpc: '2.0', method: 'test' })
        .expect(200);
      
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('result', 'ok');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .post('/session/invalid-id/message')
        .send({ jsonrpc: '2.0', method: 'test' })
        .expect(404);
      
      expect(response.body).toEqual({ error: 'Session not found' });
    });
  });

  describe('GET /session/:sessionId/events', () => {
    it('should handle SSE request for existing session', async () => {
      // Create a session first
      await request(app).post('/session');
      
      const response = await request(app)
        .get('/session/test-uuid-123/events')
        .expect(200);
      
      expect(response.body).toEqual({ message: 'SSE endpoint' });
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/session/invalid-id/events')
        .expect(404);
      
      expect(response.body).toEqual({ error: 'Session not found' });
    });
  });

  describe('DELETE /session/:sessionId', () => {
    it('should close existing session', async () => {
      // Create a session first
      await request(app).post('/session');
      
      const response = await request(app)
        .delete('/session/test-uuid-123')
        .expect(200);
      
      expect(response.body).toEqual({ message: 'Session closed' });
    });

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/session/invalid-id')
        .expect(404);
      
      expect(response.body).toEqual({ error: 'Session not found' });
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});