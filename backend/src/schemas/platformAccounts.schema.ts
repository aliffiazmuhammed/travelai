import { z } from 'zod';

/**
 * Platform account directory shape walls (PA2).
 *
 * Query strings are parsed explicitly with `parseQuery` because the shared
 * `validate` middleware only inspects bodies. Every cap here is intentional:
 * admin search is still user input and must not be able to turn into an
 * expensive regex or an unbounded scan.
 */

export const ACCOUNT_REALM_FILTERS = ['all', 'personal', 'agency', 'platform'] as const;
export const ACCOUNT_STATUS_FILTERS = ['all', 'active', 'disabled'] as const;

export const accountListQuerySchema = z
  .object({
    q: z.string().trim().max(120, 'Search is limited to 120 characters.').optional().default(''),
    realm: z.enum(ACCOUNT_REALM_FILTERS).optional().default('all'),
    status: z.enum(ACCOUNT_STATUS_FILTERS).optional().default('all'),
    page: z.coerce.number().int().min(1).max(10000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export const accountStatusSchema = z
  .object({
    status: z.enum(['active', 'disabled']),
  })
  .strict();

export const createPlatformAccountSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address.'),
    name: z.string().trim().min(1, 'Enter a name or leave it blank.').max(40).optional(),
  })
  .strict();

export const updatePlatformAccountSchema = z
  .object({
    status: z.enum(['active', 'disabled']).optional(),
    name: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.name !== undefined, {
    message: 'Nothing to update.',
  });

export type AccountListQuery = z.infer<typeof accountListQuerySchema>;
export type CreatePlatformAccountInput = z.infer<typeof createPlatformAccountSchema>;
export type UpdatePlatformAccountInput = z.infer<typeof updatePlatformAccountSchema>;
