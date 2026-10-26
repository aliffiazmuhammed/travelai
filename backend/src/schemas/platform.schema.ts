import { z } from 'zod';

/**
 * Platform admin shape walls (PA1). Whether the account exists, is active or
 * has the right role is decided by the service layer, never here.
 */

export const platformSigninSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address.'),
    password: z.string().min(1, 'Enter your password.'),
  })
  .strict();
