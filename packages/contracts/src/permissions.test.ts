import { describe, expect, it } from 'vitest';
import { hasPermission, isPermission, PERMISSION_KEYS, PERMISSIONS, ROLE_TEMPLATES } from './permissions';

describe('permission catalog', () => {
  it('has unique, well-formed keys', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it('role templates only reference known permissions', () => {
    for (const template of ROLE_TEMPLATES) {
      for (const p of template.permissions) expect(isPermission(p)).toBe(true);
    }
  });

  it('owner template holds every permission', () => {
    const owner = ROLE_TEMPLATES.find((t) => t.key === 'owner')!;
    expect([...owner.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('only owner and hr can see payroll', () => {
    const withPayroll = ROLE_TEMPLATES.filter((t) => t.permissions.includes('payroll.view')).map((t) => t.key);
    expect(withPayroll.sort()).toEqual(['hr', 'owner']);
  });

  it('sensitive flags are booleans for every entry', () => {
    for (const p of PERMISSIONS) expect(typeof p.sensitive).toBe('boolean');
  });
});

describe('hasPermission', () => {
  it('requires every listed permission', () => {
    expect(hasPermission(['users.view', 'roles.view'], ['users.view'])).toBe(true);
    expect(hasPermission(['users.view'], ['users.view', 'roles.view'])).toBe(false);
    expect(hasPermission([], [])).toBe(true);
  });
});
