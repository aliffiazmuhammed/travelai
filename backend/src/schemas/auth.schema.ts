import { z } from 'zod';
import { newPasswordField } from '../services/auth/passwordPolicy.js';

/**
 * Phase 1B consent payload. Optional at the API level so an older app build can
 * still sign up while `AUTH_LEGAL_CONSENT_REQUIRED` is off; the service decides
 * whether the versions are current and whether absence is allowed.
 */
export const signupConsentSchema = z.object({
  termsVersion: z.string().trim().min(1).max(40),
  privacyVersion: z.string().trim().min(1).max(40),
  marketingOptIn: z.boolean().optional(),
});

export const signupSchema = z.object({
  // Optional at the API level (existing clients post email + password only),
  // but the app asks for it: the agency sees this name on every enquiry.
  name: z
    .string()
    .trim()
    .max(40, 'Names must be 40 characters or fewer.')
    .optional(),
  email: z.string().email('Invalid email address'),
  password: newPasswordField,
  consent: signupConsentSchema.optional(),
});

export const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

const resetTokenField = z
  .string()
  .trim()
  .min(20, 'This reset link is invalid or has expired.');

export const validateResetTokenSchema = z.object({ token: resetTokenField });

export const resetPasswordSchema = z.object({
  token: resetTokenField,
  password: newPasswordField,
});

/**
 * The request flow is deliberately explicit: `confirm` must be the literal
 * true, so a stray form post cannot queue a deletion by accident.
 */
export const accountDeletionRequestSchema = z.object({
  confirm: z
    .boolean()
    .refine((value) => value === true, 'Confirm that you want to request account deletion.'),
  reason: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters.')
    .optional(),
});
