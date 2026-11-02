import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads apps/api/.env into process.env for local development. Variables already set in the environment win,
 * so containers and CI configure the app purely through real environment variables.
 */
const file = resolve(__dirname, '../.env');
const fallback = resolve(__dirname, '../../.env');
const path = existsSync(file) ? file : existsSync(fallback) ? fallback : undefined;
if (path) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
