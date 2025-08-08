import { performance } from 'perf_hooks';
import * as os from 'os';
import { BenchmarkResult, BenchmarkOptions, BenchmarkStats } from './types.js';

export class BenchmarkRunner {
  private readonly defaultOptions: BenchmarkOptions = {
    warmupIterations: 10,
    iterations: 100,
    timeout: 60000,
    collectMemory: true,
    collectCpu: true,
    forceGc: true,
  };

  constructor(private options: Partial<BenchmarkOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  async run<T>(
    name: string,
    fn: () => Promise<T> | T,
    options: Partial<BenchmarkOptions> = {}
  ): Promise<BenchmarkResult> {
    const opts = { ...this.options, ...options };
    const samples: number[] = [];
    const memorySamples: NodeJS.MemoryUsage[] = [];
    
    // Warmup phase
    for (let i = 0; i < opts.warmupIterations!; i++) {
      await fn();
      if (opts.forceGc && global.gc) {
        global.gc();
      }
    }

    // Main benchmark phase
    const startCpu = process.cpuUsage();
    const startTime = performance.now();

    for (let i = 0; i < opts.iterations!; i++) {
      if (opts.forceGc && global.gc) {
        global.gc();
      }

      if (opts.collectMemory) {
        memorySamples.push(process.memoryUsage());
      }

      const iterStart = performance.now();
      await fn();
      const iterEnd = performance.now();
      
      samples.push(iterEnd - iterStart);
    }

    const endTime = performance.now();
    const endCpu = process.cpuUsage(startCpu);

    const stats = this.calculateStats(samples);
    const memoryStats = opts.collectMemory ? this.calculateMemoryStats(memorySamples) : undefined;

    return {
      name,
      samples: samples.length,
      stats,
      memory: memoryStats,
      cpu: opts.collectCpu ? {
        user: endCpu.user / 1000, // Convert to ms
        system: endCpu.system / 1000,
      } : undefined,
      totalTime: endTime - startTime,
      environment: this.getEnvironment(),
      timestamp: new Date().toISOString(),
    };
  }

  async runComparison<T>(
    name: string,
    implementations: Record<string, () => Promise<T> | T>,
    options: Partial<BenchmarkOptions> = {}
  ): Promise<Record<string, BenchmarkResult>> {
    const results: Record<string, BenchmarkResult> = {};

    for (const [implName, fn] of Object.entries(implementations)) {
      results[implName] = await this.run(`${name} - ${implName}`, fn, options);
    }

    return results;
  }

  private calculateStats(samples: number[]): BenchmarkStats {
    const sorted = [...samples].sort((a, b) => a - b);
    const len = sorted.length;

    // Remove outliers (> 3 standard deviations)
    const mean = sorted.reduce((a, b) => a + b, 0) / len;
    const stdDev = Math.sqrt(
      sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / len
    );
    
    const filtered = sorted.filter(
      val => Math.abs(val - mean) <= 3 * stdDev
    );

    return {
      min: filtered[0],
      max: filtered[filtered.length - 1],
      mean: filtered.reduce((a, b) => a + b, 0) / filtered.length,
      median: this.percentile(filtered, 50),
      p50: this.percentile(filtered, 50),
      p75: this.percentile(filtered, 75),
      p90: this.percentile(filtered, 90),
      p95: this.percentile(filtered, 95),
      p99: this.percentile(filtered, 99),
      stdDev,
      throughput: 1000 / (filtered.reduce((a, b) => a + b, 0) / filtered.length), // ops/sec
      outliers: len - filtered.length,
    };
  }

  private calculateMemoryStats(samples: NodeJS.MemoryUsage[]): any {
    const heapUsed = samples.map(s => s.heapUsed);
    const rss = samples.map(s => s.rss);
    const external = samples.map(s => s.external);

    return {
      heapUsed: {
        min: Math.min(...heapUsed),
        max: Math.max(...heapUsed),
        mean: heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length,
        median: this.percentile(heapUsed.sort((a, b) => a - b), 50),
      },
      rss: {
        min: Math.min(...rss),
        max: Math.max(...rss),
        mean: rss.reduce((a, b) => a + b, 0) / rss.length,
        median: this.percentile(rss.sort((a, b) => a - b), 50),
      },
      external: {
        min: Math.min(...external),
        max: Math.max(...external),
        mean: external.reduce((a, b) => a + b, 0) / external.length,
        median: this.percentile(external.sort((a, b) => a - b), 50),
      },
    };
  }

  private percentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private getEnvironment() {
    return {
      node: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
    };
  }
}