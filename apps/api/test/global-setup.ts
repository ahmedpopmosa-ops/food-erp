import { execSync } from 'node:child_process';

/** Migrates the test database from its current state and rebuilds the fixture world before all suites. */
export default async function globalSetup() {
  await import('./env');
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_OWNER_URL },
  });
  const { buildFixtures } = await import('./fixtures');
  await buildFixtures();
}
