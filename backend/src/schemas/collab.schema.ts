import { z } from 'zod';
import { invitableRoleSchema } from '../services/collab/access.js';

/** Zod schemas for the Milestone 6 collaboration endpoints (sprint E2). */

export const createInviteSchema = z
  .object({
    role: invitableRoleSchema,
    kind: z.enum(['link', 'email']).default('link'),
    /** Required for email invites; bound (lowercased) at redemption time. */
    email: z.string().email('Enter a valid email address.').optional(),
    /** Optional for link invites (1–25); email invites are always single-use. */
    maxUses: z.coerce.number().int().min(1).max(25).optional(),
    /** Optional lifetime in hours (1–720). Defaults to INVITE_TTL_HOURS. */
    ttlHours: z.coerce.number().min(1).max(720).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'email' && !value.email) {
      ctx.addIssue({
        code: 'custom',
        message: 'An email-bound invitation needs the email address.',
        path: ['email'],
      });
    }
  });

export const changeMemberRoleSchema = z.object({
  // `owner` is intentionally NOT assignable — ownership transfers via /transfer.
  role: invitableRoleSchema,
});

export const transferOwnershipSchema = z.object({
  /** Must already be a member of the trip. */
  toUserId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Choose an existing member of the trip.'),
});
