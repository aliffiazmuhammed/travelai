import { z } from 'zod';

/**
 * Profile-editing walls (Milestone 7, F14).
 *
 * These are *shape* walls only. Whether a name is allowed to change, whether the
 * current password is right, and whether a photo is a real image are decided in
 * `services/user/profile.ts` — the schema layer never touches the database.
 */

/** The display name cap, shared with the label clamp in `collab/comments.ts`. */
export const NAME_MAX_LEN = 40;

export const updateProfileSchema = z.object({
  // An empty string is meaningful: it clears the name and falls back to the
  // email local part, exactly like an account that never set one.
  name: z
    .string()
    .max(200, 'That name is too long.')
    .refine(
      (value) => value.replace(/\s+/g, ' ').trim().length <= NAME_MAX_LEN,
      `Names must be ${NAME_MAX_LEN} characters or fewer.`
    ),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    // Same rule as signup (6+), so a member never gets a stricter policy on the
    // change screen than they were held to when they joined.
    newPassword: z.string().min(6, 'Your new password must be at least 6 characters.'),
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'Your new password must be different from the current one.',
    path: ['newPassword'],
  });
