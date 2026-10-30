import { z } from 'zod';
import {
  AGENCY_APPLICATION_LIMITS,
  AGENCY_APPLICATION_STATUSES,
} from '../models/AgencyApplication.js';

/**
 * Public agency-application walls.
 *
 * The form is an anonymous write, so `.strict()` is deliberate: an unknown key
 * is a client bug, not something to silently drop. `website` is the honeypot —
 * present so a bot can fill it, invisible in the real form, and quietly
 * accepted by the service without writing anything.
 *
 * Phone is a shape check only (length and characters). The service strips
 * formatting before counting digits, so "accept 7–15 digits" is enforced once,
 * in one place.
 */
export const submitAgencyApplicationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Tell us the agency name.')
      .max(
        AGENCY_APPLICATION_LIMITS.name,
        `Keep the agency name under ${AGENCY_APPLICATION_LIMITS.name} characters.`
      ),
    phone: z
      .string()
      .trim()
      .min(1, 'Enter a phone number we can reach you on.')
      .max(
        AGENCY_APPLICATION_LIMITS.phone,
        `Keep the phone number under ${AGENCY_APPLICATION_LIMITS.phone} characters.`
      ),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter an email address we can reply to.')
      .max(
        AGENCY_APPLICATION_LIMITS.email,
        `Keep the email under ${AGENCY_APPLICATION_LIMITS.email} characters.`
      ),
    note: z
      .string()
      .trim()
      .max(
        AGENCY_APPLICATION_LIMITS.note,
        `Keep the note under ${AGENCY_APPLICATION_LIMITS.note} characters.`
      )
      .optional(),
    website: z.string().max(200).optional(),
  })
  .strict();

export type SubmitAgencyApplicationInput = z.infer<
  typeof submitAgencyApplicationSchema
>;

export const AGENCY_APPLICATION_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const;

/**
 * Admin queue query. `status` defaults to `pending`: the queue exists to be
 * emptied, and the history tabs are one click away.
 */
export const agencyApplicationListQuerySchema = z
  .object({
    status: z.enum(AGENCY_APPLICATION_FILTERS).optional().default('pending'),
    q: z.string().trim().max(120, 'Search is limited to 120 characters.').optional().default(''),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export type AgencyApplicationListQuery = z.infer<
  typeof agencyApplicationListQuerySchema
>;

export const rejectAgencyApplicationSchema = z
  .object({
    note: z
      .string()
      .trim()
      .max(
        AGENCY_APPLICATION_LIMITS.decisionNote,
        `Keep the note under ${AGENCY_APPLICATION_LIMITS.decisionNote} characters.`
      )
      .optional()
      .default(''),
  })
  .strict();

export type RejectAgencyApplicationInput = z.infer<
  typeof rejectAgencyApplicationSchema
>;

/** Re-exported so the admin schema consumers share one status vocabulary. */
export { AGENCY_APPLICATION_STATUSES };
