// Adds accounts and mappings that were added to the chart template after a tenant was onboarded (e.g. the
// Phase 5b payables accounts). Idempotent and additive: nothing a tenant changed is touched.
// Runs after `prisma migrate deploy`, with the same platform context as onboarding.
import { PrismaClient } from '@prisma/client';
import { AccountingSetupService } from '../src/accounting/accounting-setup.service';

export async function syncAccounts(prisma: PrismaClient) {
  const setup = new AccountingSetupService();
  const tenants = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
    return tx.tenant.findMany({ select: { id: true, timezone: true } });
  });
  for (const t of tenants) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform', 'on', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${t.id}, true)`;
      await setup.seed(tx, t.id, { timezone: t.timezone });
    });
  }
  return tenants.length;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  syncAccounts(prisma)
    .then((n) => console.warn(`Synced the chart of accounts of ${n} tenant(s)`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
