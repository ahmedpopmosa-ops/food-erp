import { z } from 'zod';
import { uuid } from './common';

export const KITCHEN_TICKET_STATUSES = ['new', 'preparing', 'ready', 'served', 'cancelled'] as const;
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number];

/** Moves a ticket forward (new → preparing → ready → served), or back from ready to preparing (recall). */
export const KITCHEN_TRANSITIONS: Record<KitchenTicketStatus, KitchenTicketStatus[]> = {
  new: ['preparing', 'ready'],
  preparing: ['ready'],
  ready: ['served', 'preparing'],
  served: [],
  cancelled: [],
};

const names = { nameAr: z.string().trim().min(1).max(80), nameEn: z.string().trim().min(1).max(80) };

/** A kitchen station of a branch; categories routed to it, the rest go to the branch's default station. */
export const kitchenStationCreateSchema = z.object({
  branchId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,12}$/),
  ...names,
  /** A ticket not ready after this many seconds is highlighted as delayed. */
  delayThresholdSec: z.number().int().min(60).max(7200).default(600),
  isDefault: z.boolean().default(false),
  categoryIds: z.array(uuid).max(200).default([]),
});
export type KitchenStationCreateInput = z.infer<typeof kitchenStationCreateSchema>;

export const kitchenStationUpdateSchema = z.object({
  nameAr: names.nameAr.optional(),
  nameEn: names.nameEn.optional(),
  delayThresholdSec: z.number().int().min(60).max(7200).optional(),
  isDefault: z.literal(true).optional(),
  isActive: z.boolean().optional(),
  categoryIds: z.array(uuid).max(200).optional(),
});
export type KitchenStationUpdateInput = z.infer<typeof kitchenStationUpdateSchema>;

export const kitchenTicketsQuery = z.object({
  branchId: uuid,
  stationId: uuid.optional(),
  /** `active`: new, preparing, ready. `done`: served or cancelled in the last two hours. */
  view: z.enum(['active', 'done']).default('active'),
});
export type KitchenTicketsQuery = z.infer<typeof kitchenTicketsQuery>;

export const kitchenTicketStatusSchema = z.object({
  to: z.enum(['preparing', 'ready', 'served']),
  /** The status the screen showed; a stale screen gets 409 instead of skipping a step. */
  from: z.enum(KITCHEN_TICKET_STATUSES),
});
export type KitchenTicketStatusInput = z.infer<typeof kitchenTicketStatusSchema>;
