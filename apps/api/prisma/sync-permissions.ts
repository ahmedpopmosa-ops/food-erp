// Syncs the canonical permission catalog (packages/contracts) into the `permissions` table.
// Runs as the owner role after `prisma migrate deploy` (the app role cannot write this table).
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@ros/contracts';

export async function syncPermissions(prisma: PrismaClient) {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, module: p.module, isSensitive: p.sensitive },
      update: { module: p.module, isSensitive: p.sensitive },
    });
  }
  // Keys removed from the catalog are deleted only when no role still references them.
  const keys = PERMISSIONS.map((p) => p.key as string);
  const stale = await prisma.permission.findMany({
    where: { key: { notIn: keys } },
    include: { _count: { select: { rolePermissions: true } } },
  });
  for (const s of stale) {
    if (s._count.rolePermissions === 0) await prisma.permission.delete({ where: { key: s.key } });
    else
      console.warn(
        `Permission ${s.key} is no longer in the catalog but still granted by ${s._count.rolePermissions} role(s)`,
      );
  }
  return PERMISSIONS.length;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  syncPermissions(prisma)
    .then((n) => console.warn(`Synced ${n} permissions`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
