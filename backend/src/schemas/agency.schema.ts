import { z } from 'zod';
import {
  agencyInvitableRoleSchema,
  agencyRoleSchema,
} from '../services/agency/access.js';
import {
  QUOTE_CURRENCIES,
  QUOTE_MAX_DISCOUNT,
  QUOTE_MAX_LINE_ITEMS,
  QUOTE_MAX_MARKUP_PCT,
  QUOTE_MAX_QUANTITY,
  QUOTE_MAX_TAX_PCT,
  QUOTE_MAX_UNIT_PRICE,
} from '../services/agency/quotes.js';
import {
  AGENCY_TERMS_MAX_ITEMS,
  AGENCY_TERMS_MAX_LENGTH,
} from '../services/agency/agencies.js';

/** Zod schemas for the Agency Workspace A1 endpoints. */

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * An empty string is a deliberate "clear this field" instruction, so every
 * optional branding value accepts it. Uploaded assets point at the tenant
 * content route (`/api/agency/...`), which is not an absolute URL.
 */
function clearable(
  pattern: (value: string) => boolean,
  message: string,
  max = 2048
) {
  return z
    .string()
    .trim()
    .max(max)
    .refine((value) => value === '' || pattern(value), message);
}

const clearableAssetUrl = clearable(
  (value) =>
    isHttpUrl(value) ||
    (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')),
  'Enter a valid image URL.'
);

const clearableWebsite = clearable(isHttpUrl, 'Enter a valid website URL.');

const clearableEmail = clearable(
  (value) => z.string().email().safeParse(value).success,
  'Enter a valid contact email.',
  160
);

const clearablePhone = clearable(
  (value) => value.length >= 3,
  'Enter a contact phone number.',
  40
);

const clearableColour = clearable(
  (value) => HEX_COLOUR.test(value),
  'Use a 6-digit hex colour such as #0F766E.',
  7
);

const clearableGstin = clearable(
  (value) => GSTIN.test(value),
  'Enter a valid 15-character GSTIN.',
  20
);

export const agencyBrandingSchema = z.object({
  logoUrl: clearableAssetUrl.optional(),
  mascotUrl: clearableAssetUrl.optional(),
  primaryColor: clearableColour.optional(),
  accentColor: clearableColour.optional(),
  fontHeading: z.string().trim().max(120).optional(),
  fontBody: z.string().trim().max(120).optional(),
  contactEmail: clearableEmail.optional(),
  contactPhone: clearablePhone.optional(),
  website: clearableWebsite.optional(),
  address: z.string().trim().max(400).optional(),
});

export const createAgencySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Agency name must be at least 2 characters.')
    .max(80, 'Agency name must be 80 characters or fewer.'),
  gstin: clearableGstin.optional(),
  branding: agencyBrandingSchema.optional(),
});

const termLine = z
  .string()
  .trim()
  .min(1, 'Remove the empty quote-default line.')
  .max(
    AGENCY_TERMS_MAX_LENGTH,
    `Keep each quote-default line under ${AGENCY_TERMS_MAX_LENGTH} characters.`
  );

export const agencyTermsSchema = z
  .object({
    inclusions: z.array(termLine).max(AGENCY_TERMS_MAX_ITEMS).optional(),
    exclusions: z.array(termLine).max(AGENCY_TERMS_MAX_ITEMS).optional(),
    terms: z.array(termLine).max(AGENCY_TERMS_MAX_ITEMS).optional(),
  })
  .refine(
    (value) =>
      value.inclusions !== undefined ||
      value.exclusions !== undefined ||
      value.terms !== undefined,
    { message: 'Provide a quote default to update.' }
  );

export const updateAgencySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Agency name must be at least 2 characters.')
      .max(80, 'Agency name must be 80 characters or fewer.')
      .optional(),
    gstin: clearableGstin.optional(),
    branding: agencyBrandingSchema.optional(),
    defaultTerms: agencyTermsSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.gstin !== undefined ||
      value.branding !== undefined ||
      value.defaultTerms !== undefined,
    {
      message: 'Provide a name, branding or quote-default change.',
    }
  );

export const createAgencyAssetSchema = z.object({
  kind: z.enum(['logo', 'mascot', 'font', 'image']),
  fontFamily: z.string().trim().max(120).optional(),
  licenseNote: z.string().trim().max(500).optional(),
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

export const createAgencyTripSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Give this trip a working title.')
      .max(120, 'Trip titles must be 120 characters or fewer.'),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    assignedTo: z
      .string()
      .regex(OBJECT_ID, 'Choose a valid agency team member.')
      .optional(),
    clientId: z.string().regex(OBJECT_ID, 'Choose a valid client.').nullable().optional(),
  })
  .refine(
    (value) =>
      !value.startDate || !value.endDate || new Date(value.endDate) >= new Date(value.startDate),
    {
      message: 'The end date cannot be before the start date.',
      path: ['endDate'],
    }
  );

export const updateAgencyTripSchema = z
  .object({
    assignedTo: z
      .string()
      .regex(OBJECT_ID, 'Choose a valid agency team member.')
      .nullable()
      .optional(),
    clientId: z.string().regex(OBJECT_ID, 'Choose a valid client.').nullable().optional(),
  })
  .refine((value) => value.assignedTo !== undefined || value.clientId !== undefined, {
    message: 'Provide an assignment or client change.',
  });

/* -------------------------------------------------------------------------- */
/*  Client directory (A4)                                                     */
/* -------------------------------------------------------------------------- */

const clientEmail = z
  .string()
  .trim()
  .max(160, 'Keep the client email under 160 characters.')
  .refine(
    (value) => value === '' || z.string().email().safeParse(value).success,
    'Enter a valid client email address.'
  );

export const createAgencyClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the client's name.")
    .max(120, 'Client names must be 120 characters or fewer.'),
  email: clientEmail.optional(),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const updateAgencyClientSchema = createAgencyClientSchema
  .partial()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.email !== undefined ||
      value.phone !== undefined ||
      value.company !== undefined ||
      value.notes !== undefined,
    { message: 'Provide a client change.' }
  );

/* -------------------------------------------------------------------------- */
/*  Quote (A4)                                                                */
/* -------------------------------------------------------------------------- */

const quoteTermLine = z
  .string()
  .trim()
  .min(1, 'Remove the empty quote line.')
  .max(
    AGENCY_TERMS_MAX_LENGTH,
    `Keep each quote line under ${AGENCY_TERMS_MAX_LENGTH} characters.`
  );

const quoteTerms = z.array(quoteTermLine).max(AGENCY_TERMS_MAX_ITEMS);

/**
 * Line items accept only pricing inputs. `total` is intentionally absent and
 * both objects are strict, so a client that posts a server-computed field gets
 * a 400 instead of having it silently ignored.
 */
const quoteLineItemSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, 'Each quote line needs a label.')
      .max(160, 'Quote line labels must be 160 characters or fewer.'),
    description: z.string().trim().max(500).optional(),
    quantity: z
      .number()
      .finite()
      .min(0.01, 'Each quote line needs a quantity.')
      .max(QUOTE_MAX_QUANTITY),
    unitPrice: z
      .number()
      .finite()
      .min(0, 'Unit prices cannot be negative.')
      .max(QUOTE_MAX_UNIT_PRICE),
  })
  .strict();

const quoteClientSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the client's name for the quote.")
      .max(120, 'Client names must be 120 characters or fewer.'),
    email: clientEmail.optional(),
    phone: z.string().trim().max(40).optional(),
    adults: z.number().int().min(1).max(30),
    children: z.number().int().min(0).max(30),
    rooms: z.number().int().min(0).max(30).nullable().optional(),
  })
  .strict();

export const saveAgencyQuoteSchema = z
  .object({
    clientId: z
      .string()
      .regex(OBJECT_ID, 'Choose a valid client.')
      .nullable()
      .optional(),
    client: quoteClientSchema,
    currency: z.enum([...QUOTE_CURRENCIES], {
      message: 'Choose a supported quote currency.',
    }),
    lineItems: z
      .array(quoteLineItemSchema)
      .min(1, 'Add at least one line item to the quote.')
      .max(QUOTE_MAX_LINE_ITEMS),
    markupPct: z.number().finite().min(0).max(QUOTE_MAX_MARKUP_PCT).optional(),
    taxPct: z.number().finite().min(0).max(QUOTE_MAX_TAX_PCT).optional(),
    discount: z.number().finite().min(0).max(QUOTE_MAX_DISCOUNT).optional(),
    validUntil: z.string().trim().min(1, 'Choose how long this quote stays valid.'),
    inclusions: quoteTerms.optional(),
    exclusions: quoteTerms.optional(),
    terms: quoteTerms.optional(),
    preparedBy: z.string().trim().max(120).optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Exports (A5)                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Export requests carry identity only. The quote totals and template content
 * stay server-derived; `quoteId` pins a specific version, and omitting it means
 * "the latest quote for this trip".
 */
export const createAgencyExportSchema = z
  .object({
    templateId: z
      .string()
      .regex(OBJECT_ID, 'Choose a template for this export.'),
    quoteId: z
      .string()
      .regex(OBJECT_ID, 'Choose a valid quote version.')
      .nullable()
      .optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Public proposal shares (A7)                                               */
/* -------------------------------------------------------------------------- */

/** Link lifetime is capped by the service at 90 days. */
export const createAgencyProposalLinkSchema = z
  .object({
    ttlDays: z.coerce.number().int().min(1).max(90).optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Custom templates (A6)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Multipart fields arrive as strings. `assets` is a JSON object encoded as a
 * field because admin day-image mappings are structured; the service still
 * normalises and validates every id and day number.
 */
const templateAssetsField = z
  .string()
  .trim()
  .max(8000, 'The asset choices are too large.')
  .optional();

export const createAgencyTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Give this template a name.')
      .max(80, 'Template names must be 80 characters or fewer.'),
    description: z.string().trim().max(240).optional(),
    audience: z.enum(['client', 'internal'], {
      message: 'Choose a client or internal template.',
    }),
    assets: templateAssetsField,
  })
  .strict();

export const addAgencyTemplateVersionSchema = z
  .object({
    assets: templateAssetsField,
  })
  .strict();

export const updateAgencyTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Give this template a name.')
      .max(80, 'Template names must be 80 characters or fewer.')
      .optional(),
    description: z.string().trim().max(240).optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'Provide a name or description change.',
  })
  .strict();

export const previewAgencyTemplateVersionSchema = z
  .object({
    tripId: z.string().regex(OBJECT_ID, 'Choose a trip for the preview.'),
    quoteId: z
      .string()
      .regex(OBJECT_ID, 'Choose a valid quote version.')
      .nullable()
      .optional(),
  })
  .strict();

export const updateAgencyPlanSchema = z
  .object({
    tierId: z.string().trim().min(1).max(40, 'Plan ids must be 40 characters or fewer.'),
    seats: z.number().int().positive().optional(),
    monthlyExports: z.number().int().nonnegative().optional(),
    storageMb: z.number().int().nonnegative().optional(),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  PA0 account realm                                                         */
/* -------------------------------------------------------------------------- */

export const agencySigninSchema = z
  .object({
    workspace: z
      .string()
      .trim()
      .min(1, 'Enter your workspace.')
      .max(40, 'Workspace names are 40 characters or fewer.'),
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(1, 'Enter your password.'),
  })
  .strict();

/**
 * Invite activation creates (or signs into) an agency account for the invite's
 * tenant. The password is always required: a forwarded link must not be enough
 * to take over an existing account.
 */
export const activateAgencyInviteSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(6, 'Choose a password with at least 6 characters.'),
    name: z.string().trim().max(40, 'Names must be 40 characters or fewer.').optional(),
  })
  .strict();
