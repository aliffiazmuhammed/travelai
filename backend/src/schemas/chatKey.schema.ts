import { z } from 'zod';

/**
 * Zod schemas for the end-to-end chat keys (Milestone 7, F10).
 *
 * The server is a **blind carrier**: everything here is ciphertext it cannot
 * read, so validation only enforces *shape* — proper base64, sane sizes, and
 * envelope targets that look like real member ids. Anything bigger or weirder
 * is a client bug or an attack; either way the friendliest response is a 400.
 */

export const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export const CHAT_OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/** Public keys are small (SPKI P-256 ≈ 90 base64 chars); the cap is generous. */
export const PUBKEY_MAX = 512;

/**
 * A wrapped AES-256-GCM conversation key is ~80 base64 chars; the cap leaves
 * headroom for future schemes without letting envelopes become a storage abuse.
 */
export const WRAPPED_KEY_MAX = 1024;

/** Envelope map size bound per request. */
export const ENVELOPES_MAX = 50;

const base64Field = (max: number) =>
  z
    .string()
    .regex(BASE64_RE, 'Expected base64.')
    .max(max, `Must be at most ${max} base64 characters.`);

/**
 * One envelope entry: a recipient slot → the conversation key wrapped for it.
 *
 * F10d keys are **device public keys** (base64 SPKI, so every browser of an
 * account gets its own slot); plain member ids remain valid for envelopes minted
 * before multi-device support (both alphabets are base64-safe).
 */
export const envelopesField = z
  .record(
    z
      .string()
      .min(1, 'Envelope keys must not be empty.')
      .max(PUBKEY_MAX, `Envelope keys must be at most ${PUBKEY_MAX} characters.`)
      .regex(/^[A-Za-z0-9+/=]+$/, 'Envelope keys must be member ids or public keys.'),
    base64Field(WRAPPED_KEY_MAX)
  )
  .refine((entries) => Object.keys(entries).length > 0, 'Send at least one envelope.')
  .refine(
    (entries) => Object.keys(entries).length <= ENVELOPES_MAX,
    `At most ${ENVELOPES_MAX} envelopes per request.`
  );

/** PUT /:id/chat/keys — bootstrap (any epoch when none exists) or a rotation (new epoch). */
export const setTripChatKeysSchema = z.object({
  epoch: z.coerce.number().int().min(1).max(1_000_000_000),
  envelopes: envelopesField,
});

/** POST /:id/chat/envelopes — self-healing key distribution into the CURRENT epoch. */
export const addChatEnvelopesSchema = z.object({
  envelopes: envelopesField,
});

/** PUT /api/auth/chat-key — publish this browser's public key. */
export const publishChatKeySchema = z.object({
  pubKey: base64Field(PUBKEY_MAX),
});
