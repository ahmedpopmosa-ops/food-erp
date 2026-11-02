import { z } from 'zod';
import { uuid } from './common';

export const email = z.string().trim().toLowerCase().email().max(254);

/** Length over composition rules (NIST 800-63B); breached-password screening is a later addition. */
export const newPassword = z.string().min(10, 'At least 10 characters').max(128);

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchTenantSchema = z.object({ tenantId: uuid });

export const passwordResetRequestSchema = z.object({ email });

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(20).max(200),
  password: newPassword,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
