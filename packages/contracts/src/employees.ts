import { z } from 'zod';
import { rowVersion, uuid } from './common';

export const employeeCreateSchema = z.object({
  employeeNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,12}$/, 'Up to 12 letters, digits or dashes'),
  fullNameAr: z.string().trim().min(2).max(120),
  fullNameEn: z.string().trim().min(2).max(120),
  /** POS role (permissions on the POS); a dashboard login is a separate membership. */
  roleId: uuid,
  branchIds: z.array(uuid).min(1).max(100),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object({
  fullNameAr: z.string().trim().min(2).max(120).optional(),
  fullNameEn: z.string().trim().min(2).max(120).optional(),
  roleId: uuid.optional(),
  branchIds: z.array(uuid).min(1).max(100).optional(),
  status: z.enum(['active', 'suspended', 'terminated']).optional(),
  rowVersion,
});
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export const employeePinSchema = z.object({ pin: z.string().regex(/^\d{4,6}$/, '4-6 digits') });

/** Ed25519-signed offline license lease (ADR-0009). `payload` is base64url JSON, `signature` base64url. */
export interface LicenseLease {
  payload: string;
  signature: string;
  kid: string;
}

export interface LeaseClaims {
  tenant_id: string;
  branch_id: string;
  device_id: string;
  issued_at: string;
  valid_until: string;
}
