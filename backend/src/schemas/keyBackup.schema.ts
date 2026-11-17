import { z } from 'zod';

// Protocol v1: only canonical unpadded base64url. Never normalize passwords.
export const BACKUP_EPOCH_MAX = 1_000_000_000;
export const BACKUP_PAGE_MAX = 25;
export const BACKUP_BODY_MAX = 8192;
export function isCanonicalBase64url(value: string, bytes: number): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value) &&
    value.length === Math.ceil(bytes * 4 / 3) &&
    Buffer.from(value, 'base64url').length === bytes &&
    Buffer.from(value, 'base64url').toString('base64url') === value;
}
const binary = (bytes: number) => z.string().length(Math.ceil(bytes * 4 / 3))
  .refine((value) => isCanonicalBase64url(value, bytes), 'Expected canonical base64url of the required length.');
export const generationField = binary(16);
export const sealedKeySchema = z.object({ iv: binary(12), ct: binary(48) }).strict();
export const passwordWrapSchema = sealedKeySchema.extend({ salt: binary(16) }).strict();
export const revisionField = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const backupEpochField = z.number().int().min(1).max(BACKUP_EPOCH_MAX);
export const accountKeyBackupSchema = z.object({
  v: z.literal(1), generation: generationField, revision: revisionField,
  password: passwordWrapSchema.nullable(), recovery: sealedKeySchema,
}).strict();
export type SealedKey = z.infer<typeof sealedKeySchema>;
export type PasswordWrap = z.infer<typeof passwordWrapSchema>;
export type AccountKeyBackup = z.infer<typeof accountKeyBackupSchema>;
export type AccountBackupState =
  | { v: 1; userId: string; enrolled: false; revision: 0 }
  | ({ userId: string; enrolled: true } & AccountKeyBackup);
export const enrollKeyBackupSchema = z.object({
  v: z.literal(1), currentPassword: z.string().min(1), expectedRevision: z.literal(0),
  generation: generationField, password: passwordWrapSchema, recovery: sealedKeySchema,
}).strict();
export const recoverKeyBackupSchema = enrollKeyBackupSchema.extend({ expectedRevision: revisionField }).strict();
export const passwordBackupUpdateSchema = z.object({
  generation: generationField, expectedRevision: revisionField, password: passwordWrapSchema,
}).strict();
export type PasswordBackupUpdate = z.infer<typeof passwordBackupUpdateSchema>;
export const putTripKeyBackupSchema = z.object({
  v: z.literal(1), generation: generationField,
  expectedRowRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  iv: binary(12), ct: binary(48),
}).strict();
// Reject repeated query parameters, fractions, scientific notation and coercion surprises.
const queryInteger = (max: number) => z.string().regex(/^[1-9][0-9]*$/)
  .transform(Number).pipe(z.number().int().min(1).max(max));
export const keyBackupPageSchema = z.object({
  beforeEpoch: queryInteger(BACKUP_EPOCH_MAX).optional(),
  limit: queryInteger(BACKUP_PAGE_MAX).optional().default(BACKUP_PAGE_MAX),
}).strict();
export const keyBackupEpochParam = queryInteger(BACKUP_EPOCH_MAX);
export const keyBackupTripPageSchema = z.object({
  afterTripId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  limit: queryInteger(BACKUP_PAGE_MAX).optional().default(BACKUP_PAGE_MAX),
}).strict();
