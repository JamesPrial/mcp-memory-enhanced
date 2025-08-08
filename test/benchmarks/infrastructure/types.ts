export interface BenchmarkOptions {
  warmupIterations?: number;
  iterations?: number;
  timeout?: number;
  collectMemory?: boolean;
  collectCpu?: boolean;
  forceGc?: boolean;
}

export interface BenchmarkStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
  throughput: number; // operations per second
  outliers: number;
}

export interface MemoryStats {
  heapUsed: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  rss: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  external: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
}

export interface BenchmarkResult {
  name: string;
  samples: number;
  stats: BenchmarkStats;
  memory?: MemoryStats;
  cpu?: {
    user: number;
    system: number;
  };
  totalTime: number;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpus: number;
    cpuModel: string;
    totalMemory: number;
    freeMemory: number;
  };
  timestamp: string;
}

export interface ComparisonResult {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  speedup: number;
  memoryReduction?: number;
  regression: boolean;
}

export interface DatasetConfig {
  entityCount: number;
  relationMultiplier: number;
  observationsPerEntity: number;
  seed?: number;
}