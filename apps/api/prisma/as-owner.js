// Runs a command with DATABASE_URL replaced by DATABASE_OWNER_URL. Migrations and permission sync need
// the owner role; the application itself always connects as the restricted `ros_app` role.
const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const envFile = resolve(__dirname, '../.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_OWNER_URL) {
  console.error('DATABASE_OWNER_URL is not set (see .env.example).');
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_OWNER_URL },
});
process.exit(result.status ?? 1);
