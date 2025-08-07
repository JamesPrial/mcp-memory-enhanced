#!/usr/bin/env node

import { migrateJSONToSQLite } from './migrate.js';

export function parseArgs(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    return { showHelp: true };
  }

  const jsonIndex = args.indexOf('--json');
  const sqliteIndex = args.indexOf('--sqlite');
  
  const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : undefined;
  const sqlitePath = sqliteIndex >= 0 ? args[sqliteIndex + 1] : undefined;
  
  const options = {
    backup: args.includes('--backup'),
    verify: args.includes('--verify')
  };

  return { jsonPath, sqlitePath, options, showHelp: false };
}

export function showHelp() {
  console.log('Usage: node migrate.js [options]');
  console.log('\nOptions:');
  console.log('  --json <path>     Path to JSON memory file (default: from env or memory.json)');
  console.log('  --sqlite <path>   Path to SQLite database (default: from env or memory.db)');
  console.log('  --backup          Create backup of JSON file before migration');
  console.log('  --verify          Verify data integrity after migration');
  console.log('  --help            Show this help message');
  console.log('\nExample:');
  console.log('  node migrate.js --json memory.json --sqlite memory.db --backup --verify');
}

export async function runCLI(args: string[]) {
  const parsed = parseArgs(args);
  
  if (parsed.showHelp) {
    showHelp();
    process.exit(0);
    return; // For testing - won't execute after exit in production
  }

  try {
    await migrateJSONToSQLite(parsed.jsonPath, parsed.sqlitePath, parsed.options);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  runCLI(args);
}