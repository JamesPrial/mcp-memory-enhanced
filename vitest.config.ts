import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
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
        'src/**',
        'coverage/**',
        'eslint.config.js'
      ],
      include: [
        'storage/**/*.ts',
        'knowledge-graph-manager.ts',
        'server-factory.ts',
        'server-factory-schemas.ts',
        'health-server.ts',
        'types.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
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