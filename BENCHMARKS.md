# Benchmark Methodology

This document describes the comprehensive benchmarking system for MCP Memory Enhanced, ensuring reproducible and accurate performance measurements.

## Overview

Our benchmarking suite validates performance claims and tracks improvements over time using a multi-layered approach:

1. **Micro-benchmarks**: Individual operation performance
2. **Scenario benchmarks**: Real-world usage patterns
3. **Memory profiling**: Heap usage and GC impact
4. **Storage efficiency**: File size comparisons

## Architecture

```
test/benchmarks/
├── infrastructure/          # Core benchmarking framework
│   ├── benchmark-runner.ts  # Statistical analysis & execution
│   ├── dataset-generator.ts # Reproducible test data
│   ├── report-generator.ts  # Multi-format reporting
│   └── types.ts            # TypeScript definitions
├── suites/                 # Benchmark implementations
│   ├── core-operations.bench.ts    # CRUD operations
│   ├── memory-usage.bench.ts       # Memory profiling
│   └── stress-test.bench.ts        # High-load scenarios
└── validation/            # README claim validation
    └── validate-claims.bench.ts
```

## Metrics Collected

### Performance Metrics
- **Latency**: min, max, mean, median, p50, p75, p90, p95, p99
- **Throughput**: Operations per second
- **Standard Deviation**: Consistency measurement
- **Outliers**: Removed (>3 standard deviations)

### Memory Metrics
- **Heap Used**: JavaScript heap memory
- **RSS**: Resident Set Size (total memory)
- **External**: V8 external memory
- **GC Impact**: Frequency and duration

### Storage Metrics
- **File Size**: On-disk storage requirements
- **Compression Ratio**: Data efficiency

## Running Benchmarks

### Quick Validation
```bash
# Validate README performance claims
npm run benchmark:validate
```

### Full Suite
```bash
# Run complete benchmark suite
npm run benchmark:full
```

### Specific Tests
```bash
# Run memory benchmarks only
NODE_OPTIONS='--expose-gc' vitest bench test/benchmarks/suites/memory-usage.bench.ts
```

### CI Integration
```bash
# Run CI-appropriate benchmarks
npm run benchmark:ci
```

## Methodology

### 1. Warmup Phase
- 10 iterations before measurement
- Eliminates JIT compilation bias
- Stabilizes cache states

### 2. Statistical Rigor
- Minimum 100 iterations per benchmark
- Outlier removal (>3σ)
- Multiple percentile reporting
- Confidence intervals calculation

### 3. Memory Profiling
```javascript
// Force garbage collection before measurement
if (global.gc) global.gc();

// Measure memory
const memUsage = process.memoryUsage();
```

### 4. Reproducible Data
- Fixed random seed (42)
- Deterministic data generation
- Consistent entity/relation ratios

## Dataset Characteristics

### Entity Types
- Person, Organization, Project, Document, Location
- Varied observation lengths (50-500 chars)
- Realistic naming patterns

### Relation Types
- works_for, collaborates_with, manages, funds, located_at
- Graph density: 2x entities (typical for knowledge graphs)

### Test Sizes
- Small: 100 entities (development)
- Medium: 1,000 entities (validation)
- Large: 10,000 entities (performance)
- Stress: 100,000+ entities (scalability)

## Performance Claims Validation

The benchmarks validate these README claims:

| Claim | Test Method | Target |
|-------|------------|--------|
| Entity Creation: 250x faster | Individual & batch creation timing | ≥225x (10% variance allowed) |
| Search: 15x faster | Query performance across dataset sizes | ≥13.5x |
| Memory: 79% less | Heap usage comparison | ≥71% reduction |
| Storage: 30% smaller | File size comparison | ≥27% reduction |

## Automated Reporting

### Console Output
```
📊 Entity Creation (10000 entities)
──────────────────────────────────
  Samples: 50
  Mean: 14.235ms
  Median: 13.891ms
  P95/P99: 18.234ms / 21.456ms
  Throughput: 702.5 ops/s
```

### JSON Report
```json
{
  "name": "Entity Creation",
  "stats": {
    "mean": 14.235,
    "median": 13.891,
    "p95": 18.234,
    "throughput": 702.5
  },
  "memory": {
    "heapUsed": { "mean": 45678912 }
  }
}
```

### HTML Report
Interactive charts with Chart.js visualization of:
- Performance trends
- Memory usage over time
- Comparison between backends

## CI/CD Integration

### GitHub Actions Workflow
1. Runs on every PR and main branch push
2. Compares against baseline
3. Comments results on PR
4. Blocks merge on >5% regression

### PR Comment Format
```markdown
## 📊 Benchmark Results

### Performance Claims Validation
| Metric | Claimed | Actual | Status |
|--------|---------|--------|--------|
| Entity Creation | 250x | 267x | ✅ |
| Search | 15x | 18x | ✅ |

### Comparison with Baseline
No performance regressions detected.
```

## Reproducing Results

### Environment Setup
```bash
# Install dependencies
npm install

# Build project
npm run build

# Enable GC exposure for memory profiling
export NODE_OPTIONS='--expose-gc'
```

### Running Specific Scenarios
```bash
# Test with 10,000 entities
NODE_OPTIONS='--expose-gc' vitest bench test/benchmarks/suites/core-operations.bench.ts \
  --reporter=json --outputFile=results.json
```

### Analyzing Results
```bash
# Compare two benchmark runs
npm run benchmark:compare baseline.json current.json
```

## Hardware Considerations

Benchmarks normalize for hardware differences by:
1. Focusing on relative comparisons (JSON vs SQLite)
2. Using ratios rather than absolute times
3. Recording environment details for context

## Troubleshooting

### Inconsistent Results
- Ensure no other processes consuming resources
- Run with `--expose-gc` for accurate memory measurements
- Increase iteration count for more stability

### Memory Measurements
- Force GC before measurements: `global.gc()`
- Use multiple samples and averages
- Consider both heap and RSS metrics

### SQLite Performance
- WAL mode enabled by default
- Proper indexes for search operations
- Connection pooling for concurrent access

## Contributing

When adding new benchmarks:
1. Follow existing patterns in `test/benchmarks/suites/`
2. Use `BenchmarkRunner` for consistency
3. Include warmup phase
4. Document methodology in code comments
5. Update this document with new metrics

## References

- [Vitest Benchmark Mode](https://vitest.dev/guide/features.html#benchmarking)
- [Node.js Performance Hooks](https://nodejs.org/api/perf_hooks.html)
- [Better-SQLite3 Performance](https://github.com/WiseLibs/better-sqlite3/wiki/Performance)