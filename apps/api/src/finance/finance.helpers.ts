import { forbidden } from '../common/errors';
import type { TenantContext } from '../common/auth-context';

/** The general ledger is tenant-wide: changing or reporting it needs access to every branch. */
export function requireAllBranches(auth: TenantContext) {
  if (!auth.allBranches)
    throw forbidden('accounting.allBranchesRequired', 'The general ledger needs access to all branches');
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
