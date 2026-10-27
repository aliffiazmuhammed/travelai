import { z } from 'zod';

/**
 * Profile-editing walls (Milestone 7, F14; Milestone 8 G1 adds the traveler
 * handle and bio).
 *
 * These are *shape* walls only. Whether a name/handle is allowed, whether the
 * handle is free, whether the current password is right, and whether a photo is
 * a real image are decided in `services/user/profile.ts` — the schema layer
 * never touches the database.
 */

/** The display name cap, shared with the label clamp in `collab/comments.ts`. */
export const NAME_MAX_LEN = 40;

/** Public traveler handle bounds (Milestone 8 G1). */
export const HANDLE_MIN_LEN = 3;
export const HANDLE_MAX_LEN = 24;
export const BIO_MAX_LEN = 280;

/**
 * Applies the same normalization the service uses, so the schema can reject a
 * bad shape before any database work: trim, drop a leading `@`, lowercase.
 */
export function normalizeHandleInput(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

const nameField = z
  .string()
  .max(200, 'That name is too long.')
  .refine(
    (value) => value.replace(/\s+/g, ' ').trim().length <= NAME_MAX_LEN,
    `Names must be ${NAME_MAX_LEN} characters or fewer.`
  );

const handleField = z
  .string()
  .max(64, 'That handle is too long.')
  .refine((value) => {
    const handle = normalizeHandleInput(value);
    return (
      handle.length === 0 ||
      (handle.length >= HANDLE_MIN_LEN &&
        handle.length <= HANDLE_MAX_LEN &&
        /^[a-z0-9_]+$/.test(handle))
    );
  }, `Handles must be ${HANDLE_MIN_LEN}–${HANDLE_MAX_LEN} characters using lowercase letters, numbers and underscores.`);

const bioField = z
  .string()
  .max(BIO_MAX_LEN * 4, 'That bio is too long.')
  .refine(
    (value) => value.trim().length <= BIO_MAX_LEN,
    `Bios must be ${BIO_MAX_LEN} characters or fewer.`
  );

/**
 * Personal profile updates. Every field is optional (an empty `name` clears the
 * name, an empty `handle` clears the handle), but a request must carry at least
 * one of them. Agency accounts use `agencyProfileSchema` instead: handles and
 * bios are gallery identity and have no meaning in the agency realm.
 */
export const updateProfileSchema = z
  .object({
    name: nameField.optional(),
    handle: handleField.optional(),
    bio: bioField.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Choose at least one profile field to update.',
  });

/** Agency staff profile: display name only. */
export const agencyProfileSchema = z.object({
  name: nameField,
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
