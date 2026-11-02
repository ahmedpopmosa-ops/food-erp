import { z } from 'zod';
import { uuid } from './common';

export const deviceCreateSchema = z.object({
  branchId: uuid,
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,4}$/, '2-4 letters or digits; printed on receipt numbers'),
  name: z.string().trim().min(1).max(80),
});
export type DeviceCreateInput = z.infer<typeof deviceCreateSchema>;

/** Pairing codes: 8 characters from an unambiguous alphabet (no 0/O/1/I). */
export const PAIRING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const devicePairSchema = z.object({
  pairingCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(new RegExp(`^[${PAIRING_ALPHABET}]{8}$`), 'Invalid pairing code'),
  appVersion: z.string().max(40),
  osVersion: z.string().max(80).optional(),
});
export type DevicePairInput = z.infer<typeof devicePairSchema>;

export const deviceRefreshSchema = z.object({ deviceId: uuid, refreshToken: z.string().min(20).max(200) });
export type DeviceRefreshInput = z.infer<typeof deviceRefreshSchema>;

export interface DeviceTokens {
  deviceId: string;
  tenantId: string;
  branchId: string;
  deviceCode: string;
  branchCode: string;
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  lease: import('./employees').LicenseLease;
  /** Lease verification key (SPKI DER, base64). Production builds also embed it (trust on first use otherwise). */
  leasePublicKey: string;
}
