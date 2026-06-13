import * as fs from 'fs/promises';
import * as path from 'path';
import { BenchmarkResult, ComparisonResult } from './types.js';

export class ReportGenerator {
  async generateReport(
    results: BenchmarkResult | BenchmarkResult[],
    format: 'json' | 'markdown' | 'html' | 'console' = 'console',
    outputPath?: string
  ): Promise<string> {
    const resultsArray = Array.isArray(results) ? results : [results];
    
    let report: string;
    switch (format) {
      case 'json':
        report = this.generateJsonReport(resultsArray);
        break;
      case 'markdown':
        report = this.generateMarkdownReport(resultsArray);
        break;
      case 'html':
        report = this.generateHtmlReport(resultsArray);
        break;
      case 'console':
      default:
        report = this.generateConsoleReport(resultsArray);
        break;
    }

    if (outputPath) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, report, 'utf-8');
    }

    return report;
  }

  async generateComparison(
    baseline: BenchmarkResult[],
    current: BenchmarkResult[],
    format: 'json' | 'markdown' | 'console' = 'console'
  ): Promise<string> {
    const comparisons: ComparisonResult[] = [];

    for (const currentResult of current) {
      const baselineResult = baseline.find(b => b.name === currentResult.name);
      if (baselineResult) {
        const speedup = baselineResult.stats.mean / currentResult.stats.mean;
        const memoryReduction = baselineResult.memory && currentResult.memory
          ? 1 - (currentResult.memory.heapUsed.mean / baselineResult.memory.heapUsed.mean)
          : undefined;

        comparisons.push({
          baseline: baselineResult,
          current: currentResult,
          speedup,
          memoryReduction,
          regression: speedup < 0.95, // 5% regression threshold
        });
      }
    }

    switch (format) {
      case 'json':
        return JSON.stringify(comparisons, null, 2);
      case 'markdown':
        return this.generateComparisonMarkdown(comparisons);
      default:
        return this.generateComparisonConsole(comparisons);
    }
  }

  private generateJsonReport(results: BenchmarkResult[]): string {
    return JSON.stringify(results, null, 2);
  }

  private generateMarkdownReport(results: BenchmarkResult[]): string {
    let md = '# Benchmark Results\n\n';
    md += `**Date:** ${new Date().toISOString()}\n`;
    md += `**Environment:** ${results[0]?.environment.platform} ${results[0]?.environment.arch}\n`;
    md += `**Node:** ${results[0]?.environment.node}\n`;
    md += `**CPU:** ${results[0]?.environment.cpuModel} (${results[0]?.environment.cpus} cores)\n\n`;

    md += '## Performance Metrics\n\n';
    md += '| Benchmark | Mean (ms) | Median (ms) | P95 (ms) | P99 (ms) | Throughput (ops/s) |\n';
    md += '|-----------|-----------|-------------|----------|----------|--------------------|\n';

    for (const result of results) {
      md += `| ${result.name} | ${this.formatNumber(result.stats.mean)} | `;
      md += `${this.formatNumber(result.stats.median)} | `;
      md += `${this.formatNumber(result.stats.p95)} | `;
      md += `${this.formatNumber(result.stats.p99)} | `;
      md += `${this.formatNumber(result.stats.throughput)} |\n`;
    }

    if (results.some(r => r.memory)) {
      md += '\n## Memory Usage\n\n';
      md += '| Benchmark | Heap Mean (MB) | RSS Mean (MB) | External Mean (MB) |\n';
      md += '|-----------|----------------|---------------|--------------------||\n';

      for (const result of results) {
        if (result.memory) {
          md += `| ${result.name} | `;
          md += `${this.formatBytes(result.memory.heapUsed.mean)} | `;
          md += `${this.formatBytes(result.memory.rss.mean)} | `;
          md += `${this.formatBytes(result.memory.external.mean)} |\n`;
        }
      }
    }

    return md;
  }

  private generateHtmlReport(results: BenchmarkResult[]): string {
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>Benchmark Results</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .good { color: green; }
    .bad { color: red; }
    .chart { margin: 20px 0; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Benchmark Results</h1>
  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
  <p><strong>Environment:</strong> ${results[0]?.environment.platform} ${results[0]?.environment.arch}</p>
  
  <h2>Performance Metrics</h2>
  <table>
    <thead>
      <tr>
        <th>Benchmark</th>
        <th>Mean (ms)</th>
        <th>Median (ms)</th>
        <th>P95 (ms)</th>
        <th>P99 (ms)</th>
        <th>Throughput (ops/s)</th>
      </tr>
    </thead>
    <tbody>`;

    for (const result of results) {
      html += `
      <tr>
        <td>${result.name}</td>
        <td>${this.formatNumber(result.stats.mean)}</td>
        <td>${this.formatNumber(result.stats.median)}</td>
        <td>${this.formatNumber(result.stats.p95)}</td>
        <td>${this.formatNumber(result.stats.p99)}</td>
        <td>${this.formatNumber(result.stats.throughput)}</td>
      </tr>`;
    }

    html += `
    </tbody>
  </table>

  <div class="chart">
    <canvas id="performanceChart"></canvas>
  </div>

  <script>
    const ctx = document.getElementById('performanceChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(results.map(r => r.name))},
        datasets: [{
          label: 'Mean Time (ms)',
          data: ${JSON.stringify(results.map(r => r.stats.mean))},
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  </script>
</body>
</html>`;

    return html;
  }

  private generateConsoleReport(results: BenchmarkResult[]): string {
    let output = '\n╔══════════════════════════════════════════════════════════════════╗\n';
    output += '║                        BENCHMARK RESULTS                          ║\n';
    output += '╚══════════════════════════════════════════════════════════════════╝\n\n';

    for (const result of results) {
      output += `📊 ${result.name}\n`;
      output += '─'.repeat(50) + '\n';
      output += `  Samples: ${result.samples}\n`;
      output += `  Mean: ${this.formatNumber(result.stats.mean)}ms\n`;
      output += `  Median: ${this.formatNumber(result.stats.median)}ms\n`;
      output += `  Min/Max: ${this.formatNumber(result.stats.min)}ms / ${this.formatNumber(result.stats.max)}ms\n`;
      output += `  P95/P99: ${this.formatNumber(result.stats.p95)}ms / ${this.formatNumber(result.stats.p99)}ms\n`;
      output += `  Std Dev: ${this.formatNumber(result.stats.stdDev)}ms\n`;
      output += `  Throughput: ${this.formatNumber(result.stats.throughput)} ops/s\n`;
      
      if (result.memory) {
        output += `  Memory (Heap): ${this.formatBytes(result.memory.heapUsed.mean)}\n`;
        output += `  Memory (RSS): ${this.formatBytes(result.memory.rss.mean)}\n`;
      }
      
      output += '\n';
    }

    return output;
  }

  private generateComparisonMarkdown(comparisons: ComparisonResult[]): string {
    let md = '# Performance Comparison\n\n';
    md += '| Benchmark | Baseline | Current | Speedup | Memory Change | Status |\n';
    md += '|-----------|----------|---------|---------|---------------|--------|\n';

    for (const comp of comparisons) {
      const status = comp.regression ? '⚠️ Regression' : '✅ OK';
      const speedupStr = comp.speedup > 1 
        ? `${comp.speedup.toFixed(2)}x faster` 
        : `${(1/comp.speedup).toFixed(2)}x slower`;
      const memoryStr = comp.memoryReduction !== undefined
        ? `${(comp.memoryReduction * 100).toFixed(1)}% ${comp.memoryReduction > 0 ? 'less' : 'more'}`
        : 'N/A';

      md += `| ${comp.current.name} | `;
      md += `${this.formatNumber(comp.baseline.stats.mean)}ms | `;
      md += `${this.formatNumber(comp.current.stats.mean)}ms | `;
      md += `${speedupStr} | `;
      md += `${memoryStr} | `;
      md += `${status} |\n`;
    }

    return md;
  }

  private generateComparisonConsole(comparisons: ComparisonResult[]): string {
    let output = '\n🔄 PERFORMANCE COMPARISON\n';
    output += '═'.repeat(60) + '\n\n';

    for (const comp of comparisons) {
      const speedupStr = comp.speedup > 1 
        ? `✨ ${comp.speedup.toFixed(2)}x faster` 
        : `⚠️ ${(1/comp.speedup).toFixed(2)}x slower`;

      output += `${comp.current.name}\n`;
      output += `  Baseline: ${this.formatNumber(comp.baseline.stats.mean)}ms\n`;
      output += `  Current:  ${this.formatNumber(comp.current.stats.mean)}ms\n`;
      output += `  ${speedupStr}\n`;
      
      if (comp.memoryReduction !== undefined) {
        const memStr = comp.memoryReduction > 0 
          ? `💾 ${(comp.memoryReduction * 100).toFixed(1)}% less memory`
          : `⚠️ ${(-comp.memoryReduction * 100).toFixed(1)}% more memory`;
        output += `  ${memStr}\n`;
      }

      if (comp.regression) {
        output += '  ⚠️ PERFORMANCE REGRESSION DETECTED\n';
      }
      
      output += '\n';
    }

    return output;
  }

  private formatNumber(num: number): string {
    return num.toFixed(3);
  }

  private formatBytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(2);
  }
}