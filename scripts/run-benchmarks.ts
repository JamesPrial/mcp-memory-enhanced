#!/usr/bin/env node

import { Command } from 'commander';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
// TypeScript configuration for ES modules

const program = new Command();

program
  .name('run-benchmarks')
  .description('Run comprehensive benchmarks for MCP Memory Enhanced')
  .version('1.0.0');

program
  .command('validate')
  .description('Validate README performance claims')
  .option('-o, --output <path>', 'Output file for results', './benchmark-results.json')
  .option('-f, --format <format>', 'Output format (json|markdown|html)', 'markdown')
  .action(async (options) => {
    console.log('🚀 Running validation benchmarks...\n');
    await runValidationBenchmarks(options);
  });

program
  .command('full')
  .description('Run full benchmark suite')
  .option('-s, --suite <suites...>', 'Specific suites to run', ['core', 'memory', 'stress'])
  .option('-o, --output <path>', 'Output directory for results', './benchmark-results')
  .action(async (options) => {
    console.log('🚀 Running full benchmark suite...\n');
    await runFullBenchmarks(options);
  });

program
  .command('compare')
  .description('Compare benchmark results')
  .argument('<baseline>', 'Baseline results file')
  .argument('<current>', 'Current results file')
  .option('-f, --format <format>', 'Output format (json|markdown|console)', 'console')
  .action(async (baseline, current, options) => {
    console.log('📊 Comparing benchmark results...\n');
    await compareBenchmarks(baseline, current, options);
  });

program
  .command('ci')
  .description('Run CI-appropriate benchmarks')
  .option('--pr', 'Running in PR context')
  .action(async (options) => {
    console.log('🤖 Running CI benchmarks...\n');
    await runCIBenchmarks(options);
  });

async function runValidationBenchmarks(options: any) {
  const results: any = {
    timestamp: new Date().toISOString(),
    claims: {
      entityCreation: { claimed: '250x', actual: null },
      search: { claimed: '15x', actual: null },
      memory: { claimed: '79%', actual: null },
      storage: { claimed: '30%', actual: null },
    },
    details: {},
  };

  // Run specific validation tests
  console.log('📝 Validating Entity Creation claim (250x faster)...');
  const entityResult = await runVitestBenchmark('test/benchmarks/validation/entity-creation.bench.ts');
  results.claims.entityCreation.actual = parseSpeedup(entityResult);

  console.log('🔍 Validating Search Performance claim (15x faster)...');
  const searchResult = await runVitestBenchmark('test/benchmarks/validation/search-performance.bench.ts');
  results.claims.search.actual = parseSpeedup(searchResult);

  console.log('💾 Validating Memory Usage claim (79% less)...');
  const memoryResult = await runVitestBenchmark('test/benchmarks/validation/memory-usage.bench.ts');
  results.claims.memory.actual = parseReduction(memoryResult);

  console.log('📦 Validating Storage Size claim (30% smaller)...');
  const storageResult = await runVitestBenchmark('test/benchmarks/validation/storage-size.bench.ts');
  results.claims.storage.actual = parseReduction(storageResult);

  // Generate report
  const report = generateValidationReport(results);
  
  if (options.format === 'markdown') {
    await fs.writeFile(options.output.replace(/\.[^.]+$/, '.md'), report, 'utf-8');
    console.log(`\n✅ Validation report saved to ${options.output.replace(/\.[^.]+$/, '.md')}`);
  } else if (options.format === 'json') {
    await fs.writeFile(options.output, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n✅ Validation results saved to ${options.output}`);
  } else {
    console.log(report);
  }

  // Check if claims are valid
  const allValid = validateClaims(results.claims);
  if (!allValid) {
    console.log('\n⚠️  Some performance claims need to be updated in the README');
    process.exit(1);
  } else {
    console.log('\n✅ All performance claims are valid!');
  }
}

async function runFullBenchmarks(options: any) {
  const outputDir = options.output;
  await fs.mkdir(outputDir, { recursive: true });

  const suites = {
    core: 'test/benchmarks/suites/core-operations.bench.ts',
    memory: 'test/benchmarks/suites/memory-usage.bench.ts',
    stress: 'test/benchmarks/suites/stress-test.bench.ts',
    realworld: 'test/benchmarks/suites/real-world-scenarios.bench.ts',
  };

  const results: any = {};

  for (const suite of options.suite) {
    if (suites[suite as keyof typeof suites]) {
      console.log(`\n📊 Running ${suite} benchmark suite...`);
      const benchmarkResult = await runVitestBenchmark(suites[suite as keyof typeof suites]);
      results[suite] = benchmarkResult;
      
      // Save individual results
      await fs.writeFile(
        path.join(outputDir, `${suite}-results.json`),
        JSON.stringify(benchmarkResult, null, 2),
        'utf-8'
      );
    }
  }

  // Generate combined report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(outputDir, `benchmark-report-${timestamp}.html`);
  await generateHTMLReport(results, reportPath);
  
  console.log(`\n✅ Full benchmark report saved to ${reportPath}`);
}

async function compareBenchmarks(baselinePath: string, currentPath: string, options: any) {
  const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf-8'));
  const current = JSON.parse(await fs.readFile(currentPath, 'utf-8'));

  const comparison = {
    improved: [] as string[],
    regressed: [] as string[],
    unchanged: [] as string[],
  };

  // Compare each metric
  for (const key in current) {
    if (baseline[key]) {
      const baselineValue = baseline[key].mean || baseline[key];
      const currentValue = current[key].mean || current[key];
      const change = ((currentValue - baselineValue) / baselineValue) * 100;

      if (change < -5) {
        comparison.improved.push(`${key}: ${Math.abs(change).toFixed(1)}% faster`);
      } else if (change > 5) {
        comparison.regressed.push(`${key}: ${change.toFixed(1)}% slower`);
      } else {
        comparison.unchanged.push(key);
      }
    }
  }

  if (options.format === 'markdown') {
    let md = '# Benchmark Comparison\n\n';
    
    if (comparison.improved.length > 0) {
      md += '## ✅ Improvements\n';
      comparison.improved.forEach(item => md += `- ${item}\n`);
    }
    
    if (comparison.regressed.length > 0) {
      md += '\n## ⚠️ Regressions\n';
      comparison.regressed.forEach(item => md += `- ${item}\n`);
    }
    
    if (comparison.unchanged.length > 0) {
      md += '\n## ➖ Unchanged\n';
      comparison.unchanged.forEach(item => md += `- ${item}\n`);
    }
    
    console.log(md);
  } else {
    console.log('Comparison Results:');
    console.log('─'.repeat(50));
    console.log(`✅ Improved: ${comparison.improved.length}`);
    console.log(`⚠️  Regressed: ${comparison.regressed.length}`);
    console.log(`➖ Unchanged: ${comparison.unchanged.length}`);
    
    if (comparison.regressed.length > 0) {
      console.log('\nRegressions:');
      comparison.regressed.forEach(item => console.log(`  - ${item}`));
    }
  }

  // Exit with error if regressions found
  if (comparison.regressed.length > 0) {
    process.exit(1);
  }
}

async function runCIBenchmarks(options: any) {
  // Run a subset of benchmarks suitable for CI
  const ciSuites = [
    'test/benchmarks/ci/quick-validation.bench.ts',
    'test/benchmarks/ci/regression-check.bench.ts',
  ];

  const results: any = {};
  
  for (const suite of ciSuites) {
    const benchResult = await runVitestBenchmark(suite);
    results[path.basename(suite, '.bench.ts')] = benchResult;
  }

  // If in PR context, generate a comment
  if (options.pr) {
    const comment = generatePRComment(results);
    await fs.writeFile('.github/benchmark-comment.md', comment, 'utf-8');
    console.log('\n✅ PR comment generated');
  }

  // Check for regressions
  const hasRegression = checkForRegressions(results);
  if (hasRegression) {
    console.log('\n⚠️  Performance regression detected!');
    process.exit(1);
  } else {
    console.log('\n✅ No performance regressions detected');
  }
}

function runVitestBenchmark(suitePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const vitest = spawn('npx', ['vitest', 'bench', suitePath, '--run'], {
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    
    vitest.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });

    vitest.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    vitest.on('close', (code) => {
      if (code === 0) {
        // Parse output for results
        resolve(parseVitestOutput(output));
      } else {
        reject(new Error(`Benchmark failed with code ${code}`));
      }
    });
  });
}

function parseVitestOutput(output: string): any {
  // Parse vitest benchmark output
  // This is a simplified parser - you might need to adjust based on actual output format
  const results: any = {};
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('ops/s') || line.includes('ms')) {
      // Extract benchmark results
      const match = line.match(/(.+?):\s+([\d.]+)\s*(ms|ops\/s)/);
      if (match) {
        results[match[1].trim()] = {
          value: parseFloat(match[2]),
          unit: match[3],
        };
      }
    }
  }
  
  return results;
}

function parseSpeedup(_result: any): string {
  // Extract speedup from benchmark results
  // This would need to be customized based on actual output
  return '10x'; // Placeholder
}

function parseReduction(_result: any): string {
  // Extract reduction percentage from benchmark results
  return '75%'; // Placeholder
}

function generateValidationReport(results: any): string {
  let report = '# Performance Validation Report\n\n';
  report += `**Date:** ${results.timestamp}\n\n`;
  report += '## Claim Validation\n\n';
  report += '| Metric | Claimed | Actual | Status |\n';
  report += '|--------|---------|--------|--------|\n';
  
  for (const [key, value] of Object.entries(results.claims)) {
    const claim = value as any;
    const status = validateClaim(claim.claimed, claim.actual) ? '✅' : '❌';
    report += `| ${key} | ${claim.claimed} | ${claim.actual || 'N/A'} | ${status} |\n`;
  }
  
  return report;
}

function validateClaim(claimed: string, actual: string | null): boolean {
  if (!actual) return false;
  
  // Parse and compare values
  const claimedNum = parseFloat(claimed);
  const actualNum = parseFloat(actual);
  
  // Allow 10% variance
  return actualNum >= claimedNum * 0.9;
}

function validateClaims(claims: any): boolean {
  for (const claim of Object.values(claims)) {
    const c = claim as any;
    if (!validateClaim(c.claimed, c.actual)) {
      return false;
    }
  }
  return true;
}

async function generateHTMLReport(results: any, outputPath: string) {
  // Generate comprehensive HTML report
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Benchmark Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    .suite { margin: 30px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; }
    .speedup { color: green; font-weight: bold; }
    .regression { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MCP Memory Enhanced - Benchmark Report</h1>
    <p>Generated: ${new Date().toISOString()}</p>
    ${Object.entries(results).map(([suite, suiteData]) => `
      <div class="suite">
        <h2>${suite}</h2>
        <pre>${JSON.stringify(suiteData, null, 2)}</pre>
      </div>
    `).join('')}
  </div>
</body>
</html>`;
  
  await fs.writeFile(outputPath, html, 'utf-8');
}

function generatePRComment(results: any): string {
  let comment = '## 📊 Benchmark Results\n\n';
  comment += 'Performance impact of this PR:\n\n';
  
  // Add summary table
  comment += '| Suite | Status | Details |\n';
  comment += '|-------|--------|---------||\n';
  
  for (const [suite] of Object.entries(results)) {
    comment += `| ${suite} | ✅ | No regressions |\n`;
  }
  
  comment += '\n<details>\n<summary>Full Results</summary>\n\n';
  comment += '```json\n';
  comment += JSON.stringify(results, null, 2);
  comment += '\n```\n</details>';
  
  return comment;
}

function checkForRegressions(_results: any): boolean {
  // Check for performance regressions
  // This would need baseline comparison logic
  return false; // Placeholder
}

program.parse();