import { z } from 'zod';
import { AGENCY_SLUG_MAX, AGENCY_SLUG_MIN } from '../services/agency/slug.js';

/**
 * PA3 agency-provisioning shape walls.
 *
 * The slug is optional: the service allocates a unique one from the name when
 * the operator does not care. When supplied it is validated strictly (no silent
 * rewriting) because it is the tenant's permanent login handle.
 */

const slugSchema = z
  .string()
  .trim()
  .min(AGENCY_SLUG_MIN, `Workspace slugs are at least ${AGENCY_SLUG_MIN} characters.`)
  .max(AGENCY_SLUG_MAX, `Workspace slugs are ${AGENCY_SLUG_MAX} characters or fewer.`)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single dashes (for example acme-travel).'
  );

const isoDate = z
  .string()
  .trim()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, 'Enter a valid renewal date.');

export const agencyOwnerPreviewQuerySchema = z
  .object({
    email: z.string().trim().email('Enter a valid owner email address.').max(160),
  })
  .strict();

export const createAgencyTenantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Agency name must be at least 2 characters.')
      .max(80, 'Agency name must be 80 characters or fewer.'),
    slug: slugSchema.optional(),
    planTierId: z.string().trim().min(1).max(40).optional(),
    billing: z
      .object({
        contactName: z.string().trim().max(120).optional(),
        contactEmail: z.string().trim().email('Enter a valid billing email.').max(160).optional(),
        renewalDate: isoDate.optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .strict()
      .optional(),
    ownerEmail: z
      .string()
      .trim()
      .email('Enter a valid owner email address.')
      .max(160),
    ownerName: z.string().trim().min(1).max(40).optional(),
  })
  .strict();

export type CreateAgencyTenantInput = z.infer<typeof createAgencyTenantSchema>;

/* -------------------------------------------------------------------------- */
/*  PA4 lifecycle and access operations                                        */
/* -------------------------------------------------------------------------- */

export const AGENCY_STATUS_FILTERS = ['all', 'active', 'suspended'] as const;
/** Directory-state filter for the ops console (M9 D7). */
export const AGENCY_PROFILE_FILTERS = ['all', 'published', 'hidden'] as const;

export const agencyListQuerySchema = z
  .object({
    q: z.string().trim().max(120, 'Search is limited to 120 characters.').optional().default(''),
    status: z.enum(AGENCY_STATUS_FILTERS).optional().default('all'),
    profile: z.enum(AGENCY_PROFILE_FILTERS).optional().default('all'),
    planTierId: z.string().trim().max(40).optional().default('all'),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export const agencyStatusSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
  })
  .strict();

/**
 * Ops takedown note (M9 D7). Optional but bounded: the platform audit row and
 * the tenant log both carry it, so it must never become free storage.
 */
export const directoryHideSchema = z
  .object({
    reason: z.string().trim().max(500, 'Keep the note under 500 characters.').optional().default(''),
  })
  .strict();

export const agencyPlanChangeSchema = z
  .object({
    tierId: z.string().trim().min(1, 'Choose a plan tier.').max(40),
    seats: z.number().int().min(1).max(10000).optional(),
    monthlyExports: z.number().int().min(0).max(1000000).optional(),
    storageMb: z.number().int().min(0).max(1000000).optional(),
  })
  .strict();

export const agencyMemberInviteSchema = z
  .object({
    role: z.enum(['admin', 'planner', 'viewer']),
    kind: z.enum(['link', 'email']).default('link'),
    email: z.string().trim().email('Enter a valid email address.').max(160).optional(),
    maxUses: z.coerce.number().int().min(1).max(25).optional(),
    ttlHours: z.coerce.number().min(1).max(720).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === 'email' && !value.email) {
      ctx.addIssue({
        code: 'custom',
        message: 'An email-bound invitation needs the email address.',
        path: ['email'],
      });
    }
  });

export const agencyMemberRoleSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'planner', 'viewer']),
  })
  .strict();

const objectId = z.string().trim().regex(/^[a-f0-9]{24}$/i, 'Choose a valid account.');

export const agencyOwnerTransferSchema = z
  .object({
    fromUserId: objectId.optional(),
  })
  .strict();

/** A date-only value or a full ISO timestamp; both are accepted by the viewer. */
const auditDate = z
  .string()
  .trim()
  .max(40)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Enter a valid date.');

export const platformAuditQuerySchema = z
  .object({
    q: z.string().trim().max(120, 'Search is limited to 120 characters.').optional().default(''),
    action: z.string().trim().max(80).optional().default(''),
    targetType: z.string().trim().max(40).optional().default(''),
    targetId: z.string().trim().max(120).optional().default(''),
    actorId: objectId.optional(),
    from: auditDate.optional(),
    to: auditDate.optional(),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  })
  .strict();

export type AgencyListQuery = z.infer<typeof agencyListQuerySchema>;
export type AgencyPlanChangeInput = z.infer<typeof agencyPlanChangeSchema>;
export type AgencyMemberInviteInput = z.infer<typeof agencyMemberInviteSchema>;
export type PlatformAuditQuery = z.infer<typeof platformAuditQuerySchema>;
export type DirectoryHideInput = z.infer<typeof directoryHideSchema>;
