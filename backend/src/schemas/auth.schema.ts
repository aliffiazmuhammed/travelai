import { z } from 'zod';

export const signupSchema = z.object({
  // Optional at the API level (existing clients post email + password only),
  // but the app asks for it: the agency sees this name on every enquiry.
  name: z
    .string()
    .trim()
    .max(40, 'Names must be 40 characters or fewer.')
    .optional(),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
