import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

/**
 * Single source of truth for the server version reported to MCP clients.
 * Read from package.json so it can never drift from the published version.
 *
 * This file lives at the repo root in source (run directly by vitest) but is
 * compiled to dist/ at build time, so package.json is either in the same
 * directory (source) or one level up (dist/). Try both.
 */
function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of ['package.json', '../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(here, candidate), 'utf-8')) as { version?: string };
      if (typeof pkg.version === 'string') {
        return pkg.version;
      }
    } catch {
      // try the next candidate location
    }
  }
  return '0.0.0';
}

export const VERSION: string = readVersion();
