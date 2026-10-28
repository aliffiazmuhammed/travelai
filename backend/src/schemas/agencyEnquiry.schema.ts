import { z } from 'zod';
import {
  AGENCY_ENQUIRY_BUDGET_BANDS,
  AGENCY_ENQUIRY_LIMITS,
  AGENCY_ENQUIRY_STATUSES,
} from '../models/AgencyEnquiry.js';

/**
 * Public enquiry walls (Milestone 9 D5).
 *
 * Shape only: whether the agency is public, whether the package still exists,
 * whether the dates are past and the exact consent stamp live in
 * `services/directory/enquiries.ts`. `.strict()` is deliberate — the form is an
 * anonymous write, so an unknown key is a client bug rather than something to
 * silently drop.
 *
 * Dates are calendar strings (`YYYY-MM-DD`), not datetimes: a traveller is
 * choosing days, not an instant, and the server normalises them to UTC midnight.
 */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const createAgencyEnquirySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Tell the agency your name.')
      .max(
        AGENCY_ENQUIRY_LIMITS.name,
        `Keep your name under ${AGENCY_ENQUIRY_LIMITS.name} characters.`
      ),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter an email address the agency can reply to.')
      .max(AGENCY_ENQUIRY_LIMITS.email),
    phone: z
      .string()
      .trim()
      .max(
        AGENCY_ENQUIRY_LIMITS.phone,
        `Keep your phone number under ${AGENCY_ENQUIRY_LIMITS.phone} characters.`
      )
      .optional(),
    adults: z.coerce
      .number()
      .int('Choose a whole number of adults.')
      .min(1, 'At least one adult is required.')
      .max(
        AGENCY_ENQUIRY_LIMITS.adults,
        `That is more than ${AGENCY_ENQUIRY_LIMITS.adults} adults.`
      ),
    children: z.coerce
      .number()
      .int('Choose a whole number of children.')
      .min(0)
      .max(
        AGENCY_ENQUIRY_LIMITS.children,
        `That is more than ${AGENCY_ENQUIRY_LIMITS.children} children.`
      )
      .optional()
      .default(0),
    startDate: z
      .string()
      .trim()
      .regex(DATE_ONLY, 'Choose a valid start date.')
      .optional(),
    endDate: z
      .string()
      .trim()
      .regex(DATE_ONLY, 'Choose a valid end date.')
      .optional(),
    flexible: z.boolean().optional().default(false),
    budgetBand: z.enum(AGENCY_ENQUIRY_BUDGET_BANDS).optional(),
    message: z
      .string()
      .trim()
      .min(
        20,
        'Tell the agency a little about the trip you have in mind (at least 20 characters).'
      )
      .max(
        AGENCY_ENQUIRY_LIMITS.message,
        `Keep your message under ${AGENCY_ENQUIRY_LIMITS.message} characters.`
      ),
    packageId: z
      .string()
      .trim()
      .regex(OBJECT_ID, 'Choose a valid trip package.')
      .optional(),
    consent: z
      .boolean()
      .refine((value) => value === true, {
        message:
          'Please agree to share your details with this agency before sending.',
      }),
  })
  .strict();

export type CreateAgencyEnquiryInput = z.infer<typeof createAgencyEnquirySchema>;

/**
 * Agency inbox query. `status` is optional (all statuses), and the cursor is the
 * opaque `(createdAt, _id)` pair from the service.
 */
export const agencyEnquiryQuerySchema = z
  .object({
    status: z.enum(AGENCY_ENQUIRY_STATUSES).optional(),
    cursor: z.string().max(400, 'That page cursor is too long.').optional(),
    limit: z.coerce
      .number()
      .int('Choose a whole number of results.')
      .min(1, 'Ask for at least one result.')
      .max(50, 'Ask for 50 results or fewer.')
      .optional(),
  })
  .strict();

export type AgencyEnquiryQueryInput = z.infer<typeof agencyEnquiryQuerySchema>;

/**
 * Agency inbox actions (D6): a status change, a claim/release, or both.
 *
 * `lostReason` is validated for length here and for presence in the service:
 * "lost without a reason" is a workflow rule, not a shape rule, and the service
 * also needs to know the current status before it can judge it.
 */
export const updateAgencyEnquirySchema = z
  .object({
    status: z.enum(AGENCY_ENQUIRY_STATUSES).optional(),
    lostReason: z
      .string()
      .trim()
      .max(
        AGENCY_ENQUIRY_LIMITS.lostReason,
        `Keep the lost reason under ${AGENCY_ENQUIRY_LIMITS.lostReason} characters.`
      )
      .optional(),
    /** `null` releases the lead; an object id assigns it. */
    assigneeId: z
      .union([
        z.string().trim().regex(OBJECT_ID, 'Choose a team member from this agency.'),
        z.null(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.lostReason !== undefined ||
      value.assigneeId !== undefined,
    { message: 'Provide an enquiry change.' }
  );

export type UpdateAgencyEnquirySchemaInput = z.infer<
  typeof updateAgencyEnquirySchema
>;

/** A consumer's own enquiry history; no status filter until D6. */
export const myEnquiryQuerySchema = z
  .object({
    cursor: z.string().max(400, 'That page cursor is too long.').optional(),
    limit: z.coerce
      .number()
      .int('Choose a whole number of results.')
      .min(1, 'Ask for at least one result.')
      .max(50, 'Ask for 50 results or fewer.')
      .optional(),
  })
  .strict();

export type MyEnquiryQueryInput = z.infer<typeof myEnquiryQuerySchema>;
