import { z } from 'zod';
import { DIRECTORY_LIMITS } from '../services/directory/taxonomy.js';
import { AGENCY_PACKAGE_LIMITS } from '../models/AgencyPackage.js';

/**
 * Directory profile writes (Milestone 9 D1).
 *
 * Shape walls only — taxonomy membership, normalisation and publish readiness
 * are decided in `services/directory/profile.ts`. An empty string is a
 * deliberate "clear this field" instruction, exactly like agency branding.
 */
export const saveAgencyDirectoryProfileSchema = z
  .object({
    about: z.string().max(DIRECTORY_LIMITS.about).optional(),
    baseCity: z.string().max(DIRECTORY_LIMITS.baseCity).optional(),
    destinations: z
      .array(z.string().max(DIRECTORY_LIMITS.listItem))
      .max(DIRECTORY_LIMITS.destinations)
      .optional(),
    specialties: z
      .array(z.string().max(DIRECTORY_LIMITS.listItem))
      .max(DIRECTORY_LIMITS.specialties)
      .optional(),
    languages: z.array(z.string().max(8)).max(9).optional(),
    services: z.array(z.string().max(40)).max(10).optional(),
    showPhone: z.boolean().optional(),
    showGstin: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide a profile change.',
  });

/**
 * Anonymous directory filters (M9 D3). Shape only; eligibility, search fields
 * and cursor handling live in `services/directory/listing.ts`.
 */
export const directoryListQuerySchema = z.object({
  q: z.string().trim().max(80, 'Search terms can be 80 characters or fewer.').optional(),
  city: z.string().trim().max(DIRECTORY_LIMITS.baseCity).optional(),
  destination: z
    .string()
    .trim()
    .max(DIRECTORY_LIMITS.listItem, 'That destination is too long.')
    .optional(),
  specialty: z
    .string()
    .trim()
    .max(DIRECTORY_LIMITS.listItem, 'That specialty is too long.')
    .optional(),
  language: z.string().trim().max(8, 'Choose a language from the list.').optional(),
  cursor: z.string().max(400, 'That page cursor is too long.').optional(),
  limit: z.coerce
    .number()
    .int('Choose a whole number of results.')
    .min(1, 'Ask for at least one result.')
    .max(24, 'Ask for 24 results or fewer.')
    .optional(),
});

/**
 * Package writes (M9 D4). Shape only: snapshot copying, cover ownership and
 * publish readiness are decided in `services/directory/packages.ts`.
 */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const packageFieldShape = {
  title: z.string().max(AGENCY_PACKAGE_LIMITS.title).optional(),
  summary: z.string().max(AGENCY_PACKAGE_LIMITS.summary).optional(),
  nights: z.coerce
    .number()
    .int('Nights must be a whole number.')
    .min(0, 'Nights cannot be negative.')
    .max(AGENCY_PACKAGE_LIMITS.nights, 'That is too many nights.')
    .optional(),
  fromPricePerPerson: z
    .union([
      z.coerce
        .number()
        .int('Enter a per-person price in whole rupees.')
        .min(0, 'The price cannot be negative.')
        .max(AGENCY_PACKAGE_LIMITS.priceMax, 'That price looks too high.'),
      z.null(),
    ])
    .optional(),
  currency: z.literal('INR').optional(),
  highlights: z
    .array(z.string().max(AGENCY_PACKAGE_LIMITS.listItem))
    .max(AGENCY_PACKAGE_LIMITS.highlights)
    .optional(),
  inclusions: z
    .array(z.string().max(AGENCY_PACKAGE_LIMITS.listItem))
    .max(AGENCY_PACKAGE_LIMITS.inclusions)
    .optional(),
  coverAssetId: z.union([z.string().regex(OBJECT_ID), z.null()]).optional(),
};

export const createAgencyPackageSchema = z
  .object({
    tripId: z.string().regex(OBJECT_ID, 'Choose a valid trip.').optional(),
    ...packageFieldShape,
  })
  .refine(
    (value) => Boolean(value.tripId) || Boolean(value.title?.trim()),
    { message: 'Choose a trip or give the package a title.' }
  );

export const updateAgencyPackageSchema = z
  .object(packageFieldShape)
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide a package change.',
  });
