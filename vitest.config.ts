import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'test/**',
        'mcp-memory-fix/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.bench.ts',
        'vitest.config.ts',
        'migrate.ts',
        'test-sqlite.ts',
        'src/memory/**',
        'test-benchmarks/**'
      ],
      include: ['src/**/*.ts', 'storage/**/*.ts', '*.ts'],
      all: true,
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './')
    }
  }
});