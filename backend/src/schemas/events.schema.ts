import { z } from 'zod';
import {
  AGENCY_EVENT_KINDS,
  AGENCY_EVENT_LIMITS,
} from '../models/AgencyEvent.js';
import {
  AGENCY_EVENT_INTEREST_LIMITS,
  AGENCY_EVENT_INTEREST_STATUSES,
} from '../models/AgencyEventInterest.js';

/**
 * Public event listing filters (Milestone 10 E1). Shape only: eligibility,
 * the host rule and the cursor are decided in `services/events/publicEvents.ts`.
 */
export const eventsQuerySchema = z.object({
  /** One agency's page: the listing narrowed by its directory slug. */
  agency: z
    .string()
    .trim()
    .toLowerCase()
    .max(40, 'That agency handle is too long.')
    .optional(),
  cursor: z.string().max(400, 'That page cursor is too long.').optional(),
  limit: z.coerce
    .number()
    .int('Choose a whole number of results.')
    .min(1, 'Ask for at least one result.')
    .max(24, 'Ask for 24 results or fewer.')
    .optional(),
});

export type EventsQueryInput = z.infer<typeof eventsQuerySchema>;

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The guest "I'm interested" form (M10 E2). `website` is a honeypot: it is
 * present so a bot can fill it, invisible in the real form, and quietly
 * accepted by the service without writing anything.
 */
export const eventInterestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Tell the agency your name.')
      .max(AGENCY_EVENT_INTEREST_LIMITS.name),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email address.')
      .max(AGENCY_EVENT_INTEREST_LIMITS.email),
    phone: z
      .string()
      .trim()
      .min(3, 'Enter a phone number the agency can reach you on.')
      .max(AGENCY_EVENT_INTEREST_LIMITS.phone),
    note: z
      .string()
      .trim()
      .max(AGENCY_EVENT_INTEREST_LIMITS.note)
      .optional(),
    website: z.string().max(200).optional(),
  })
  .strict();

export type EventInterestFormInput = z.infer<typeof eventInterestSchema>;

const eventHighlights = z
  .array(
    z
      .string()
      .trim()
      .max(
        AGENCY_EVENT_LIMITS.listItem,
        `Keep each highlight under ${AGENCY_EVENT_LIMITS.listItem} characters.`
      )
  )
  .max(
    AGENCY_EVENT_LIMITS.highlights,
    `Add at most ${AGENCY_EVENT_LIMITS.highlights} highlights.`
  );

const eventDate = z
  .string()
  .trim()
  .regex(DATE_ONLY, 'Choose a valid date.');

/**
 * Agency event editor (M10 E2). Nothing here is required: a draft may be saved
 * while it is still half-written. Publishing is where readiness is enforced,
 * so an unfinished draft never blocks the team from saving progress.
 */
const agencyEventShape = {
  title: z.string().trim().max(AGENCY_EVENT_LIMITS.title),
  summary: z.string().trim().max(AGENCY_EVENT_LIMITS.summary),
  kind: z.enum(AGENCY_EVENT_KINDS),
  destination: z.string().trim().max(AGENCY_EVENT_LIMITS.destination),
  venue: z.string().trim().max(AGENCY_EVENT_LIMITS.venue),
  startDate: eventDate,
  endDate: eventDate,
  capacity: z
    .number()
    .int('Use a whole number of spots.')
    .min(1, 'Capacity must be at least one spot.')
    .max(AGENCY_EVENT_LIMITS.capacityMax)
    .nullable(),
  pricePerPerson: z
    .number()
    .int('Use whole rupees.')
    .min(0)
    .max(AGENCY_EVENT_LIMITS.priceMax)
    .nullable(),
  highlights: eventHighlights,
  coverAssetId: z
    .string()
    .regex(OBJECT_ID, 'Choose a cover image from your asset library.')
    .nullable(),
};

export const createAgencyEventSchema = z.object(agencyEventShape).partial().strict();

export const updateAgencyEventSchema = z.object(agencyEventShape).partial().strict();

export type AgencyEventFormInput = z.infer<typeof updateAgencyEventSchema>;

export const eventInterestsQuerySchema = z.object({
  status: z.enum(AGENCY_EVENT_INTEREST_STATUSES).optional(),
});

export const decideEventInterestSchema = z
  .object({
    status: z.enum(['confirmed', 'declined']),
  })
  .strict();
