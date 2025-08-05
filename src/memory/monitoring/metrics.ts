import { EventEmitter } from 'events';

interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

interface HistogramBucket {
  le: number;
  count: number;
}

export class MetricsCollector extends EventEmitter {
  private metrics = new Map<string, Metric[]>();
  private histograms = new Map<string, HistogramBucket[]>();
  private retentionMs: number;

  constructor(retentionMs: number = 3600000) { // 1 hour default
    super();
    this.retentionMs = retentionMs;
    this.startCleanup();
  }

  // Counter metric
  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(metric);
    this.emit('metric', metric);
  }

  // Gauge metric
  set(name: string, value: number, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels
    };

    this.metrics.set(name, [metric]);
    this.emit('metric', metric);
  }

  // Histogram metric
  observe(name: string, value: number, buckets: number[] = [0.001, 0.01, 0.1, 1, 10]): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, buckets.map(le => ({ le, count: 0 })));
    }

    const histogram = this.histograms.get(name)!;
    for (const bucket of histogram) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }

    this.increment(`${name}_count`);
    this.increment(`${name}_sum`, value);
  }

  // Timer utility
  startTimer(name: string): () => void {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000; // seconds
      this.observe(name, duration);
    };
  }

  // Get metrics in Prometheus format
  getPrometheusMetrics(): string {
    const lines: string[] = [];
    const now = Date.now();

    // Regular metrics
    for (const [name, metrics] of this.metrics) {
      const recent = metrics.filter(m => now - m.timestamp < this.retentionMs);
      
      if (recent.length > 0) {
        const latest = recent[recent.length - 1];
        const labels = latest.labels ? 
          Object.entries(latest.labels).map(([k, v]) => `${k}="${v}"`).join(',') : '';
        
        lines.push(`# TYPE ${name} gauge`);
        lines.push(`${name}${labels ? `{${labels}}` : ''} ${latest.value}`);
      }
    }

    // Histograms
    for (const [name, buckets] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      
      for (const bucket of buckets) {
        lines.push(`${name}_bucket{le="${bucket.le}"} ${bucket.count}`);
      }
      lines.push(`${name}_bucket{le="+Inf"} ${buckets[buckets.length - 1].count}`);
    }

    return lines.join('\n');
  }

  // Get metrics summary
  getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [name, metrics] of this.metrics) {
      const values = metrics.map(m => m.value);
      summary[name] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        min: Math.min(...values),
        max: Math.max(...values),
        latest: values[values.length - 1]
      };
    }

    return summary;
  }

  private startCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.retentionMs;
      
      for (const [name, metrics] of this.metrics) {
        const filtered = metrics.filter(m => m.timestamp > cutoff);
        if (filtered.length > 0) {
          this.metrics.set(name, filtered);
        } else {
          this.metrics.delete(name);
        }
      }
    }, 60000); // Clean up every minute
  }
}

// Global metrics instance
export const metrics = new MetricsCollector();

// Convenience decorators
export function timed(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const timer = metrics.startTimer(`${target.constructor.name}.${propertyKey}_duration`);
    try {
      const result = await originalMethod.apply(this, args);
      timer();
      metrics.increment(`${target.constructor.name}.${propertyKey}_success`);
      return result;
    } catch (error) {
      timer();
      metrics.increment(`${target.constructor.name}.${propertyKey}_error`);
      throw error;
    }
  };

  return descriptor;
}

export function counted(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    metrics.increment(`${target.constructor.name}.${propertyKey}_calls`);
    return originalMethod.apply(this, args);
  };

  return descriptor;
}