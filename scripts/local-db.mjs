// Local PostgreSQL without Docker: real PostgreSQL binaries (embedded-postgres) with data in ./.data/pg.
// Creates the dev + test databases and the restricted application role `ros_app`, so Row-Level Security
// is enforced exactly as in production (the owner role is only used for migrations and fixtures).
//
// Usage: npm run db:local   (keep it running; Ctrl+C to stop)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const port = Number(process.env.PGPORT ?? 5433);
const ownerPassword = process.env.PG_OWNER_PASSWORD ?? 'postgres';
const appPassword = process.env.PG_APP_PASSWORD ?? 'ros_app_dev';
const databaseDir = resolve(process.cwd(), '.data/pg');

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: ownerPassword,
  port,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) {
  console.log('Initialising PostgreSQL cluster in', databaseDir);
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
const quoted = appPassword.replace(/'/g, "''");
const { rows: roles } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'ros_app'");
const verb = roles.length === 0 ? 'CREATE' : 'ALTER';
await client.query(`${verb} ROLE ros_app LOGIN PASSWORD '${quoted}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
for (const db of ['restaurant_os', 'restaurant_os_test']) {
  const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
  if (rows.length === 0) await client.query(`CREATE DATABASE ${db}`);
  await client.query(`GRANT CONNECT ON DATABASE ${db} TO ros_app`);
}
await client.end();

console.log(`PostgreSQL ready on localhost:${port} (databases: restaurant_os, restaurant_os_test). Ctrl+C to stop.`);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
