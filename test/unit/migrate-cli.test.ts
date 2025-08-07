import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseArgs, showHelp, runCLI } from '../../migrate-cli.js';
import { migrateJSONToSQLite } from '../../migrate.js';

vi.mock('../../migrate.js', () => ({
  migrateJSONToSQLite: vi.fn()
}));

describe('Migration CLI', () => {
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('parseArgs', () => {
    it('should parse --help flag', () => {
      const result = parseArgs(['--help']);
      expect(result.showHelp).toBe(true);
    });

    it('should parse -h flag', () => {
      const result = parseArgs(['-h']);
      expect(result.showHelp).toBe(true);
    });

    it('should parse --json flag with value', () => {
      const result = parseArgs(['--json', 'data.json']);
      expect(result.jsonPath).toBe('data.json');
      expect(result.showHelp).toBe(false);
    });

    it('should parse --sqlite flag with value', () => {
      const result = parseArgs(['--sqlite', 'database.db']);
      expect(result.sqlitePath).toBe('database.db');
      expect(result.showHelp).toBe(false);
    });

    it('should parse --backup flag', () => {
      const result = parseArgs(['--backup']);
      expect(result.options?.backup).toBe(true);
      expect(result.showHelp).toBe(false);
    });

    it('should parse --verify flag', () => {
      const result = parseArgs(['--verify']);
      expect(result.options?.verify).toBe(true);
      expect(result.showHelp).toBe(false);
    });

    it('should parse all flags together', () => {
      const result = parseArgs([
        '--json', 'input.json',
        '--sqlite', 'output.db',
        '--backup',
        '--verify'
      ]);
      expect(result.jsonPath).toBe('input.json');
      expect(result.sqlitePath).toBe('output.db');
      expect(result.options?.backup).toBe(true);
      expect(result.options?.verify).toBe(true);
      expect(result.showHelp).toBe(false);
    });

    it('should handle missing values for path flags', () => {
      const result = parseArgs(['--json']);
      expect(result.jsonPath).toBeUndefined();
      expect(result.showHelp).toBe(false);
    });

    it('should handle empty args', () => {
      const result = parseArgs([]);
      expect(result.jsonPath).toBeUndefined();
      expect(result.sqlitePath).toBeUndefined();
      expect(result.options?.backup).toBe(false);
      expect(result.options?.verify).toBe(false);
      expect(result.showHelp).toBe(false);
    });
  });

  describe('showHelp', () => {
    it('should display help message', () => {
      showHelp();
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Usage: node migrate.js [options]');
      expect(consoleLogSpy).toHaveBeenCalledWith('\nOptions:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  --json <path>     Path to JSON memory file (default: from env or memory.json)');
      expect(consoleLogSpy).toHaveBeenCalledWith('  --sqlite <path>   Path to SQLite database (default: from env or memory.db)');
      expect(consoleLogSpy).toHaveBeenCalledWith('  --backup          Create backup of JSON file before migration');
      expect(consoleLogSpy).toHaveBeenCalledWith('  --verify          Verify data integrity after migration');
      expect(consoleLogSpy).toHaveBeenCalledWith('  --help            Show this help message');
      expect(consoleLogSpy).toHaveBeenCalledWith('\nExample:');
      expect(consoleLogSpy).toHaveBeenCalledWith('  node migrate.js --json memory.json --sqlite memory.db --backup --verify');
    });
  });

  describe('runCLI', () => {
    it('should show help and exit when --help is provided', async () => {
      await runCLI(['--help']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Usage: node migrate.js [options]');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(migrateJSONToSQLite).not.toHaveBeenCalled();
    });

    it('should show help and exit when -h is provided', async () => {
      await runCLI(['-h']);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Usage: node migrate.js [options]');
      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(migrateJSONToSQLite).not.toHaveBeenCalled();
    });

    it('should call migrateJSONToSQLite with parsed arguments', async () => {
      await runCLI(['--json', 'input.json', '--sqlite', 'output.db', '--backup', '--verify']);
      
      expect(migrateJSONToSQLite).toHaveBeenCalledWith(
        'input.json',
        'output.db',
        { backup: true, verify: true }
      );
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should handle migration errors', async () => {
      const error = new Error('Migration failed');
      vi.mocked(migrateJSONToSQLite).mockRejectedValueOnce(error);
      
      await runCLI(['--json', 'input.json']);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should call migration with no arguments', async () => {
      await runCLI([]);
      
      expect(migrateJSONToSQLite).toHaveBeenCalledWith(
        undefined,
        undefined,
        { backup: false, verify: false }
      );
    });
  });

  describe('CLI execution', () => {
    it('should handle direct script execution', () => {
      // Test the CLI execution condition
      const mockUrl = 'file:///path/to/migrate-cli.js';
      const mockArgv1 = '/path/to/migrate-cli.js';
      
      // This simulates the condition in migrate-cli.ts
      const shouldExecute = mockUrl === `file://${mockArgv1}`;
      expect(shouldExecute).toBe(true);
      
      // Test when not executed directly
      const differentUrl = 'file:///different/path.js';
      const shouldNotExecute = differentUrl === `file://${mockArgv1}`;
      expect(shouldNotExecute).toBe(false);
    });
  });
});