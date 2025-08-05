import express from 'express';
import { register } from 'prom-client';
import { HealthMonitor } from './health.js';
import { metrics } from './metrics.js';
import { getLogger } from './logger.js';
import { IStorageBackend } from '../storage/interface.js';

const logger = getLogger('monitoring-server');

export class MonitoringServer {
  private app: express.Application;
  private healthMonitor: HealthMonitor;
  private server: any;

  constructor(storage: IStorageBackend) {
    this.app = express();
    this.healthMonitor = new HealthMonitor(storage);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', this.healthMonitor.middleware());

    // Metrics endpoint (Prometheus format)
    this.app.get('/metrics', async (req, res) => {
      try {
        // Get custom metrics
        const customMetrics = metrics.getPrometheusMetrics();
        
        // Get prom-client metrics
        const promMetrics = await register.metrics();
        
        // Combine metrics
        const allMetrics = `${customMetrics}\n\n${promMetrics}`;
        
        res.set('Content-Type', register.contentType);
        res.end(allMetrics);
      } catch (error) {
        logger.error('Failed to generate metrics', error instanceof Error ? error : new Error(String(error)));
        res.status(500).end();
      }
    });

    // Readiness probe
    this.app.get('/ready', (req, res) => {
      const health = this.healthMonitor.getOverallStatus();
      if (health.status === 'healthy') {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: health.status });
      }
    });

    // Liveness probe
    this.app.get('/live', (req, res) => {
      res.status(200).json({ alive: true, uptime: process.uptime() });
    });

    // Debug endpoints (only in development)
    if (process.env.NODE_ENV !== 'production') {
      // Logs endpoint
      this.app.get('/logs', (req, res) => {
        const level = req.query.level as string;
        const logs = logger.getBuffer(
          level ? parseInt(level) : undefined
        );
        res.json(logs);
      });

      // Metrics summary
      this.app.get('/metrics/summary', (req, res) => {
        res.json(metrics.getSummary());
      });

      // Cache stats
      this.app.get('/cache/stats', async (req, res) => {
        try {
          const storage = this.healthMonitor['storage'];
          const info = await (storage.getStorageInfo ? storage.getStorageInfo() : { cache: {} });
          res.json(info.cache || {});
        } catch (error) {
          res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
      });
    }

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error('Unhandled error', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  start(port: number = 3001): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Start health monitoring
        this.healthMonitor.start();

        // Start server
        this.server = this.app.listen(port, () => {
          logger.info('Monitoring server started', { port });
          resolve();
        });

        this.server.on('error', (error: Error) => {
          logger.error('Server error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.healthMonitor.stop();
      
      if (this.server) {
        this.server.close(() => {
          logger.info('Monitoring server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Standalone monitoring server
export async function startMonitoringServer(storage: IStorageBackend, port?: number): Promise<MonitoringServer> {
  const server = new MonitoringServer(storage);
  await server.start(port);
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down monitoring server');
    await server.stop();
    process.exit(0);
  });

  return server;
}