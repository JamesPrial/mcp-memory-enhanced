import { EventEmitter } from 'events';
import { IStorageBackend } from '../storage/interface.js';
import { metrics } from './metrics.js';

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy'
}

interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  lastCheck: Date;
  responseTime?: number;
}

interface HealthCheckResult {
  status: HealthStatus;
  checks: HealthCheck[];
  uptime: number;
  timestamp: Date;
  version?: string;
}

export class HealthMonitor extends EventEmitter {
  private checks = new Map<string, HealthCheck>();
  private storage: IStorageBackend;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  constructor(storage: IStorageBackend) {
    super();
    this.storage = storage;
  }

  start(intervalMs: number = 30000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Run initial check
    this.runHealthChecks();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async runHealthChecks(): Promise<void> {
    await Promise.all([
      this.checkStorage(),
      this.checkMemory(),
      this.checkResponseTime(),
      this.checkCacheHitRate()
    ]);

    const overall = this.getOverallStatus();
    this.emit('health', overall);
    
    // Update metrics
    metrics.set('health_status', overall.status === HealthStatus.HEALTHY ? 1 : 0);
  }

  private async checkStorage(): Promise<void> {
    const start = Date.now();
    
    try {
      // Try to load graph to verify storage is working
      await this.storage.loadGraph();
      
      const responseTime = Date.now() - start;
      this.updateCheck('storage', {
        status: responseTime < 1000 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        message: `Response time: ${responseTime}ms`,
        responseTime
      });
    } catch (error) {
      this.updateCheck('storage', {
        status: HealthStatus.UNHEALTHY,
        message: `Storage error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  private async checkMemory(): Promise<void> {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
    
    let status: HealthStatus;
    if (heapUsedPercent < 80) {
      status = HealthStatus.HEALTHY;
    } else if (heapUsedPercent < 90) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.UNHEALTHY;
    }

    this.updateCheck('memory', {
      status,
      message: `Heap usage: ${heapUsedPercent.toFixed(1)}% (${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB)`
    });

    // Update memory metrics
    metrics.set('memory_heap_used_bytes', usage.heapUsed);
    metrics.set('memory_heap_total_bytes', usage.heapTotal);
    metrics.set('memory_rss_bytes', usage.rss);
  }

  private async checkResponseTime(): Promise<void> {
    const summary = metrics.getSummary();
    const searchMetrics = summary['OptimizedSQLiteStorage.searchEntities_duration'];
    
    if (!searchMetrics || searchMetrics.count === 0) {
      this.updateCheck('response_time', {
        status: HealthStatus.HEALTHY,
        message: 'No recent operations'
      });
      return;
    }

    const avgResponseTime = searchMetrics.avg * 1000; // Convert to ms
    
    let status: HealthStatus;
    if (avgResponseTime < 100) {
      status = HealthStatus.HEALTHY;
    } else if (avgResponseTime < 500) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.UNHEALTHY;
    }

    this.updateCheck('response_time', {
      status,
      message: `Average response time: ${avgResponseTime.toFixed(1)}ms`,
      responseTime: avgResponseTime
    });
  }

  private async checkCacheHitRate(): Promise<void> {
    // Get storage info which includes cache stats
    const info = await (this.storage.getStorageInfo ? this.storage.getStorageInfo() : { cache: null });
    
    if (!info.cache) {
      this.updateCheck('cache', {
        status: HealthStatus.HEALTHY,
        message: 'Cache not available'
      });
      return;
    }

    const cacheUtilization = info.cache.entities.utilization || 0;
    
    let status: HealthStatus;
    if (cacheUtilization < 80) {
      status = HealthStatus.HEALTHY;
    } else if (cacheUtilization < 95) {
      status = HealthStatus.DEGRADED;
    } else {
      status = HealthStatus.UNHEALTHY;
    }

    this.updateCheck('cache', {
      status,
      message: `Cache utilization: ${cacheUtilization.toFixed(1)}%`
    });

    // Update cache metrics
    metrics.set('cache_utilization_percent', cacheUtilization);
    metrics.set('cache_entries_total', info.cache.entities.entries || 0);
  }

  private updateCheck(name: string, update: Partial<HealthCheck>): void {
    this.checks.set(name, {
      name,
      status: HealthStatus.HEALTHY,
      lastCheck: new Date(),
      ...update
    });
  }

  getOverallStatus(): HealthCheckResult {
    const checks = Array.from(this.checks.values());
    
    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;
    if (checks.some(c => c.status === HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (checks.some(c => c.status === HealthStatus.DEGRADED)) {
      overallStatus = HealthStatus.DEGRADED;
    }

    return {
      status: overallStatus,
      checks,
      uptime: Date.now() - this.startTime,
      timestamp: new Date(),
      version: process.env.VERSION || '1.0.0'
    };
  }

  // Express middleware
  middleware() {
    return async (req: any, res: any) => {
      const health = this.getOverallStatus();
      const statusCode = health.status === HealthStatus.HEALTHY ? 200 : 503;
      
      res.status(statusCode).json(health);
    };
  }
}