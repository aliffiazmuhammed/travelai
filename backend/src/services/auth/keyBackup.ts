import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../../models/User.js';
import Trip from '../../models/Trip.js';
import TripChatKey from '../../models/TripChatKey.js';
import TripChatKeyBackup, { type TripKeyBackup } from '../../models/TripChatKeyBackup.js';
import { AppError } from '../../utils/AppError.js';
import {
  accountKeyBackupSchema, enrollKeyBackupSchema, recoverKeyBackupSchema,
  passwordBackupUpdateSchema, putTripKeyBackupSchema, keyBackupPageSchema,
  backupEpochField, keyBackupTripPageSchema, type AccountBackupState, type AccountKeyBackup,
} from '../../schemas/keyBackup.schema.js';
import { projectKeyState } from '../collab/chatKeys.js';
import { roleOf } from '../collab/access.js';
import { isAgencyActive } from '../agency/status.js';
import { assertPasswordPolicy } from './passwordPolicy.js';

export function parseBackupInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('Invalid key backup request.', 400);
  return result.data;
}
const conflict = () => new AppError('Account credentials or key backups changed. Fetch the latest state and try again.', 409);

/** Lean is intentional: Mongoose defaults must not hide a missing tokenVersion. */
export async function loadPersonalBackupUser(userId: string): Promise<any> {
  const user = await User.findOne({ _id: userId, accountType: 'personal', status: 'active' })
    .select('+keyBackup').lean();
  if (!user) throw new AppError('Personal account not found.', 404);
  readMetadata(user); // Corrupt/present metadata is a failure, never "not enrolled".
  return user;
}
function readMetadata(user: any): AccountKeyBackup | undefined {
  if (user.keyBackup === undefined) return undefined;
  const result = accountKeyBackupSchema.safeParse(user.keyBackup);
  if (!result.success) throw new AppError('Key backup metadata is unavailable. Please try again later.', 500);
  return result.data;
}
export function projectAccountBackup(user: any): AccountBackupState {
  const metadata = readMetadata(user);
  return metadata
    ? { ...metadata, userId: String(user._id), enrolled: true }
    : { v: 1, userId: String(user._id), enrolled: false, revision: 0 };
}

/** Every personal credential writer fences both credential state AND enrollment. */
export function credentialCASFilter(user: any): Record<string, unknown> {
  const metadata = readMetadata(user);
  return {
    _id: user._id, accountType: 'personal', status: 'active', password: user.password,
    tokenVersion: user.tokenVersion === undefined ? { $exists: false } : user.tokenVersion,
    ...(metadata ? {
      'keyBackup.generation': metadata.generation, 'keyBackup.revision': metadata.revision,
    } : { keyBackup: { $exists: false } }),
  };
}
function nextRevision(revision: number): number {
  if (revision >= Number.MAX_SAFE_INTEGER) throw conflict();
  return revision + 1;
}
export function credentialUpdate(user: any, hash: string, reset: boolean) {
  const metadata = readMetadata(user);
  const version = Number(user.tokenVersion ?? 0);
  if (!Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) throw conflict();
  return { $set: {
    password: hash, passwordChangedAt: new Date(), mustChangePassword: false, tokenVersion: version + 1,
    ...(reset && metadata ? {
      'keyBackup.password': null, 'keyBackup.revision': nextRevision(metadata.revision),
    } : {}),
  } };
}
async function verifyPassword(user: any, currentPassword: string) {
  if (!await bcrypt.compare(currentPassword, user.password)) {
    throw new AppError('That is not your current password. Please try again.', 401);
  }
}
export async function getAccountBackup(userId: string): Promise<AccountBackupState> {
  return projectAccountBackup(await loadPersonalBackupUser(userId));
}
export async function enrollAccountBackup(userId: string, raw: unknown): Promise<AccountBackupState> {
  const input = parseBackupInput(enrollKeyBackupSchema, raw);
  const user = await loadPersonalBackupUser(userId);
  await verifyPassword(user, input.currentPassword);
  if (user.keyBackup !== undefined) throw conflict();
  const keyBackup: AccountKeyBackup = {
    v: 1, generation: input.generation, revision: 1, password: input.password, recovery: input.recovery,
  };
  const updated = await User.findOneAndUpdate(credentialCASFilter(user), { $set: { keyBackup } }, { new: true, runValidators: true })
    .select('+keyBackup').lean();
  if (!updated) throw conflict();
  return projectAccountBackup(updated);
}
export async function recoverAccountBackup(userId: string, raw: unknown): Promise<AccountBackupState> {
  const input = parseBackupInput(recoverKeyBackupSchema, raw);
  const user = await loadPersonalBackupUser(userId);
  await verifyPassword(user, input.currentPassword);
  const metadata = readMetadata(user);
  if (!metadata || metadata.generation !== input.generation || metadata.revision !== input.expectedRevision) throw conflict();
  const updated = await User.findOneAndUpdate(credentialCASFilter(user), { $set: {
    'keyBackup.password': input.password, 'keyBackup.recovery': input.recovery,
    'keyBackup.revision': nextRevision(metadata.revision),
  } }, { new: true, runValidators: true }).select('+keyBackup').lean();
  if (!updated) throw conflict();
  return projectAccountBackup(updated);
}

/** Personal only: agency/platform retain their existing shared profile service. */
export async function changePersonalPassword(userId: string, currentPassword: unknown, newPassword: unknown, rawBackup?: unknown): Promise<any> {
  const user = await loadPersonalBackupUser(userId);
  const metadata = readMetadata(user);
  if (metadata && rawBackup === undefined) {
    throw new AppError('Update your app or use a recovery-aware client to change your password without losing access to chat backups.', 409, 'KEY_BACKUP_UPDATE_REQUIRED');
  }
  const backup = rawBackup === undefined ? undefined : parseBackupInput(passwordBackupUpdateSchema, rawBackup);
  if (backup && (!metadata || metadata.generation !== backup.generation || metadata.revision !== backup.expectedRevision)) throw conflict();
  await verifyPassword(user, String(currentPassword ?? ''));
  const next = String(newPassword ?? '');
  assertPasswordPolicy(next, { email: user.email, name: user.name });
  if (next === String(currentPassword ?? '')) throw new AppError('Your new password must be different from the current one.', 400);
  const update = credentialUpdate(user, await bcrypt.hash(next, 12), false);
  if (metadata && backup) Object.assign(update.$set, {
    'keyBackup.password': backup.password, 'keyBackup.revision': nextRevision(metadata.revision),
  });
  const updated = await User.findOneAndUpdate(credentialCASFilter(user), update, { new: true, runValidators: true });
  if (!updated) throw conflict();
  return updated;
}

/** Recheck around writes, not a distributed transactional revocation guarantee. */
async function accessibleTrip(tripId: string, userId: string): Promise<any> {
  const trip = await Trip.findOne({ _id: tripId, isDeleted: { $ne: true } });
  if (!trip || !roleOf(trip, userId) ||
      (trip.workspace === 'agency' && trip.agencyId && !await isAgencyActive(trip.agencyId))) {
    throw new AppError('Trip not found', 404);
  }
  return trip;
}
export async function getBackupTrips(userId: string, rawQuery: unknown) {
  const { afterTripId, limit } = parseBackupInput(keyBackupTripPageSchema, rawQuery);
  const rows = await Trip.find({
    isDeleted: { $ne: true },
    members: { $elemMatch: { userId, role: { $in: ['owner', 'editor', 'commenter', 'viewer'] } } },
    ...(afterTripId ? { _id: { $gt: afterTripId } } : {}),
  }).sort({ _id: 1 }).select('_id title workspace agencyId').limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  const trips: { tripId: string; title: string }[] = [];
  for (const row of page) {
    if (row.workspace === 'agency' && !await isAgencyActive(row.agencyId)) continue;
    trips.push({ tripId: String(row._id), title: row.title || 'Trip conversation' });
  }
  return { trips, nextAfterTripId: rows.length > limit ? String(page[page.length - 1]._id) : null };
}
function pageFilter(tripId: string, beforeEpoch?: number) {
  return { tripId, ...(beforeEpoch === undefined ? {} : { epoch: { $lt: beforeEpoch } }) };
}
export async function getBackupEpochs(tripId: string, userId: string, rawQuery: unknown) {
  const { beforeEpoch, limit } = parseBackupInput(keyBackupPageSchema, rawQuery);
  const trip = await accessibleTrip(tripId, userId);
  const memberIds = (trip.members || []).map((m: any) => m.userId);
  const [current, rows, members] = await Promise.all([
    TripChatKey.findOne({ tripId }).sort({ epoch: -1 }).select('epoch'),
    // Hydrated maps are required by projectKeyState; never return raw envelopes.
    TripChatKey.find(pageFilter(tripId, beforeEpoch)).sort({ epoch: -1 }).limit(limit + 1),
    User.find({ _id: { $in: memberIds } }).select('_id email name chatPubKey chatPubKeys').lean(),
  ]);
  const page = rows.slice(0, limit);
  return {
    currentEpoch: current?.epoch ?? null,
    epochs: page.map((row) => projectKeyState(row, members, userId)),
    nextBeforeEpoch: rows.length > limit ? page[page.length - 1].epoch : null,
  };
}
function projectTripBackup(row: any): TripKeyBackup {
  return { v: 1, userId: String(row.userId), tripId: String(row.tripId), epoch: row.epoch,
    generation: row.generation, rowRevision: row.rowRevision, iv: row.iv, ct: row.ct };
}
export async function getTripBackups(tripId: string, userId: string, rawQuery: unknown) {
  const { beforeEpoch, limit } = parseBackupInput(keyBackupPageSchema, rawQuery);
  await accessibleTrip(tripId, userId);
  const user = await loadPersonalBackupUser(userId);
  if (!user.keyBackup) return { backups: [], nextBeforeEpoch: null };
  const rows = await TripChatKeyBackup.find({ ...pageFilter(tripId, beforeEpoch), userId, generation: user.keyBackup.generation })
    .sort({ epoch: -1 }).limit(limit + 1).lean();
  const page = rows.slice(0, limit);
  return { backups: page.map(projectTripBackup), nextBeforeEpoch: rows.length > limit ? page[page.length - 1].epoch : null };
}
export async function putTripBackup(tripId: string, userId: string, epoch: number, raw: unknown): Promise<TripKeyBackup> {
  parseBackupInput(backupEpochField, epoch);
  const input = parseBackupInput(putTripKeyBackupSchema, raw);
  await accessibleTrip(tripId, userId);
  const user = await loadPersonalBackupUser(userId);
  if (!user.keyBackup || user.keyBackup.generation !== input.generation) throw conflict();
  if (!await TripChatKey.exists({ tripId, epoch })) throw new AppError('Chat key epoch not found.', 404);
  const identity = { tripId, userId, epoch, generation: input.generation };
  let row: any;
  try {
    row = input.expectedRowRevision === 0
      ? await TripChatKeyBackup.create({ ...identity, v: 1, rowRevision: 1, iv: input.iv, ct: input.ct })
      : await TripChatKeyBackup.findOneAndUpdate({ ...identity, rowRevision: input.expectedRowRevision }, {
        $set: { iv: input.iv, ct: input.ct, rowRevision: input.expectedRowRevision + 1 },
      }, { new: true, runValidators: true });
  } catch (error: any) {
    if (error?.code === 11000) throw conflict();
    throw error;
  }
  if (!row) throw conflict();
  try {
    await accessibleTrip(tripId, userId);
    if (!await TripChatKey.exists({ tripId, epoch })) throw new AppError('Chat key epoch not found.', 404);
  } catch (error: any) {
    // Delete only this orphan row. An epoch disappearing must not erase other history.
    if (error instanceof AppError && error.statusCode === 404) await TripChatKeyBackup.deleteMany(identity);
    throw error;
  }
  return projectTripBackup(row);
}
