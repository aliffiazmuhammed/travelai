import { z } from 'zod';
import {
  agencyInvitableRoleSchema,
  agencyRoleSchema,
} from '../services/agency/access.js';

/** Zod schemas for the Agency Workspace A1 endpoints. */

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

export const agencyBrandingSchema = z.object({
  logoUrl: z.string().url('Enter a valid logo URL.').max(2048).optional(),
  primaryColor: z
    .string()
    .regex(HEX_COLOUR, 'Use a 6-digit hex colour such as #0F766E.')
    .optional(),
  accentColor: z
    .string()
    .regex(HEX_COLOUR, 'Use a 6-digit hex colour such as #F59E0B.')
    .optional(),
  contactEmail: z.string().email('Enter a valid contact email.').max(160).optional(),
  contactPhone: z.string().trim().min(3, 'Enter a contact phone number.').max(40).optional(),
  website: z.string().url('Enter a valid website URL.').max(2048).optional(),
  address: z.string().trim().max(400).optional(),
});

export const createAgencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Agency name must be at least 2 characters.')
    .max(80, 'Agency name must be 80 characters or fewer.'),
  branding: agencyBrandingSchema.optional(),
});

export const updateAgencySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Agency name must be at least 2 characters.')
      .max(80, 'Agency name must be 80 characters or fewer.')
      .optional(),
    branding: agencyBrandingSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.branding !== undefined, {
    message: 'Provide a name or a branding change.',
  });

export const changeAgencyMemberRoleSchema = z.object({
  role: agencyRoleSchema,
});

export const createAgencyInviteSchema = z
  .object({
    role: agencyInvitableRoleSchema,
    kind: z.enum(['link', 'email']).default('link'),
    email: z.string().email('Enter a valid email address.').optional(),
    maxUses: z.coerce.number().int().min(1).max(25).optional(),
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
