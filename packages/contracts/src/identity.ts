import { z } from 'zod';
import { email } from './auth';
import { rowVersion, uuid } from './common';
import { isPermission, type Permission } from './permissions';

const permissionList = z
  .array(z.string())
  .max(200)
  .refine((keys) => keys.every(isPermission), { message: 'Unknown permission key' })
  .transform((keys) => [...new Set(keys)] as Permission[]);

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  permissions: permissionList,
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  permissions: permissionList.optional(),
  rowVersion,
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

const branchAccess = {
  allBranches: z.boolean(),
  branchIds: z.array(uuid).max(500).default([]),
};

export const memberInviteSchema = z
  .object({
    email,
    fullName: z.string().trim().min(2).max(120),
    roleId: uuid,
    ...branchAccess,
  })
  .refine((v) => v.allBranches || v.branchIds.length > 0, {
    message: 'Choose at least one branch',
    path: ['branchIds'],
  });
export type MemberInviteInput = z.infer<typeof memberInviteSchema>;

export const memberUpdateSchema = z
  .object({
    roleId: uuid.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    allBranches: z.boolean().optional(),
    branchIds: z.array(uuid).max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })
  .refine((v) => v.allBranches !== false || (v.branchIds?.length ?? 0) > 0, {
    message: 'Choose at least one branch',
    path: ['branchIds'],
  });
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>;

export const auditQuerySchema = z.object({
  entityType: z.string().max(60).optional(),
  entityId: uuid.optional(),
  action: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
