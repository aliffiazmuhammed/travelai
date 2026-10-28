import mongoose, { Types } from 'mongoose';
import Trip from '../../models/Trip.js';
import TripReport, {
  AUTO_HIDE_REPORT_THRESHOLD,
  type ITripReport,
  type ReportReason,
  type ReportTargetType,
} from '../../models/TripReport.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { emitTripUpdated } from '../collab/presence.js';
import { normalizeHandle } from '../user/profile.js';
import { loadPublicAgencyRecord } from '../directory/profile.js';

/**
 * Reporting and automatic gallery hiding (Milestone 8 G6, extended in M9 D5).
 *
 * Three decisions define this module:
 *
 * 1. **Only public content is reportable.** A private draft is not in front of
 *    strangers, and agency content never enters the gallery — but a published
 *    agency directory profile is public, so it is reportable in its own right.
 * 2. **Auto-hide is a query flip, not a delete.** At three distinct open
 *    reports the trip gains `moderation.hiddenAt`; every public read already
 *    intersects `publicTripClauses()`, so the listing, traveler page, clone
 *    and join all drop it together. The owner's document is untouched, which
 *    is what lets an admin dismissal restore it.
 * 3. **Businesses are never auto-hidden.** A personal profile and an agency
 *    profile only enter the ops queue; taking a company page down is a manual
 *    decision (M9 defaults), because one coordinated report burst must not
 *    erase a legitimate listing.
 *
 * A report row is one per reporter per target (unique index). Reporting your
 * own trip or profile is refused — self-reports are not a moderation signal.
 */

export const MAX_REPORT_NOTE = 500;

export interface ReportView {
  _id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: string;
  status: ITripReport['status'];
  createdAt: Date;
}

export interface ReportResult {
  report: ReportView;
  /** True when this report pushed the trip over the auto-hide threshold. */
  hidden: boolean;
}

const isObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

function ownerIdOf(trip: any): string | undefined {
  const owner = (Array.isArray(trip?.members) ? trip.members : []).find(
    (member: any) => String(member?.role) === 'owner'
  );
  return owner?.userId ? String(owner.userId) : undefined;
}

function projectReport(report: ITripReport): ReportView {
  return {
    _id: String(report._id),
    targetType: report.targetType,
    targetId: String(report.targetId),
    reason: report.reason,
    ...(report.note ? { note: report.note } : {}),
    status: report.status,
    createdAt: report.createdAt,
  };
}

function normalizeNote(note: unknown): string | undefined {
  const text = String(note ?? '').trim();
  if (!text) return undefined;
  if (text.length > MAX_REPORT_NOTE) {
    throw new AppError(
      `Keep your note to ${MAX_REPORT_NOTE} characters or fewer.`,
      400
    );
  }
  return text;
}

/**
 * Checks that the target exists and is publicly visible.
 *
 * A trip is addressed by id. A personal profile is addressed by its **public
 * handle** — that is the only identifier the public page ever receives, and it
 * keeps internal user ids out of the visitor's browser. An agency profile
 * (M9 D5) is addressed by its directory slug for the same reason; the report
 * row stores the owning Agency id so ops can hide/restore by tenant.
 *
 * The owner id is returned for trips so the caller can refuse a self-report. A
 * target that is already hidden is still reportable: a visitor may have loaded
 * the page just before the threshold flipped.
 */
async function loadReportableTarget(
  targetType: ReportTargetType,
  targetRef: string,
  reporterId: string
): Promise<{ ownerId?: string; targetId: string }> {
  const ref = String(targetRef ?? '').trim();

  if (targetType === 'agency_profile') {
    const record = await loadPublicAgencyRecord(ref);
    if (!record) throw new AppError('That content could not be found.', 404);
    return { targetId: String(record.agency._id) };
  }

  if (targetType === 'trip') {
    if (!isObjectId(ref)) {
      throw new AppError('That content could not be found.', 404);
    }

    const trip = await Trip.findOne({
      _id: ref,
      visibility: 'public',
      isDeleted: { $ne: true },
      workspace: { $ne: 'agency' },
    })
      .select('members')
      .lean();
    if (!trip) throw new AppError('That content could not be found.', 404);

    const ownerId = ownerIdOf(trip);
    if (ownerId && ownerId === reporterId) {
      throw new AppError('You cannot report your own trip.', 400);
    }
    return { targetId: ref, ...(ownerId ? { ownerId } : {}) };
  }

  // Profiles: normally a handle, but an id is still accepted so internal
  // callers and older clients do not need a second lookup path.
  const handle = normalizeHandle(ref);
  const filter: Record<string, unknown> = { accountType: 'personal' };
  if (isObjectId(ref)) {
    filter._id = ref;
  } else if (handle) {
    filter['profile.handle'] = handle;
  } else {
    throw new AppError('That content could not be found.', 404);
  }

  const user = await User.findOne(filter)
    .select('_id')
    .lean();
  if (!user) throw new AppError('That content could not be found.', 404);
  if (String(user._id) === reporterId) {
    throw new AppError('You cannot report your own profile.', 400);
  }
  return { ownerId: String(user._id), targetId: String(user._id) };
}

/**
 * Counts distinct open reporters. The unique index already makes rows
 * distinct, but `distinct()` keeps the threshold honest if a future migration
 * ever relaxes that index.
 */
async function countOpenReporters(tripId: string): Promise<number> {
  const reporters = await TripReport.distinct('reporterId', {
    targetType: 'trip',
    targetId: tripId,
    status: 'open',
  });
  return Array.isArray(reporters) ? reporters.length : 0;
}

/** Hides a trip from every public surface; idempotent and audit-friendly. */
export async function hideTripForReports(
  tripId: string,
  hiddenBy?: string
): Promise<boolean> {
  if (!isObjectId(tripId)) return false;

  const filter: Record<string, unknown> = {
    _id: tripId,
    'moderation.hiddenAt': null,
  };
  const moderation: Record<string, unknown> = {
    hiddenAt: new Date(),
    source: hiddenBy ? 'admin' : 'auto_report',
  };
  if (hiddenBy) moderation.hiddenBy = hiddenBy;

  const result = await Trip.updateOne(filter, { $set: { moderation } });
  const changed = result.modifiedCount > 0;
  if (changed) emitTripUpdated(tripId);
  return changed;
}

/**
 * Restores a hidden trip after an admin dismissal. Only the moderation marker
 * is removed, so `visibility`, `publishedAt` and the gallery copy are exactly
 * what the owner published.
 */
export async function restoreTripAfterReports(tripId: string): Promise<boolean> {
  if (!isObjectId(tripId)) return false;

  const result = await Trip.updateOne(
    { _id: tripId, 'moderation.hiddenAt': { $ne: null } },
    { $unset: { moderation: '' } }
  );
  const changed = result.modifiedCount > 0;
  if (changed) emitTripUpdated(tripId);
  return changed;
}

/**
 * Creates one report and applies the threshold. The unique index is the
 * duplicate brake (a read-then-write check would race); `11000` becomes the
 * same friendly 409.
 */
export async function createReport(input: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  note?: unknown;
}): Promise<ReportResult> {
  const { ownerId, targetId } = await loadReportableTarget(
    input.targetType,
    input.targetId,
    input.reporterId
  );

  let report: ITripReport;
  try {
    report = await TripReport.create({
      reporterId: new Types.ObjectId(input.reporterId),
      targetType: input.targetType,
      targetId: new Types.ObjectId(targetId),
      reason: input.reason,
      note: normalizeNote(input.note),
      status: 'open',
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('You have already reported this content.', 409);
    }
    throw error;
  }

  // Personal and agency profiles are queue-only: hiding a personal profile
  // would remove every trip they own, and hiding an agency page is a manual
  // business decision. Both are explicit admin actions, never an auto flip.
  if (input.targetType !== 'trip' || !ownerId) {
    return { report: projectReport(report), hidden: false };
  }

  const openReports = await countOpenReporters(targetId);
  if (openReports < AUTO_HIDE_REPORT_THRESHOLD) {
    return { report: projectReport(report), hidden: false };
  }

  const hidden = await hideTripForReports(targetId);
  return { report: projectReport(report), hidden };
}
