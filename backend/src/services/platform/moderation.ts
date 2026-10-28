import mongoose from 'mongoose';
import Trip from '../../models/Trip.js';
import TripReport, {
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from '../../models/TripReport.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import type { ModerationQueryInput } from '../../schemas/platformModeration.schema.js';
import { recordPlatformAudit } from './audit.js';
import {
  hideTripForReports,
  restoreTripAfterReports,
} from '../gallery/reports.js';

/**
 * Minimal platform moderation console (Milestone 8 G6).
 *
 * The console is a *reported-content* surface, not a general trip browser: it
 * only ever loads targets that have at least one report, and a trip is shown as
 * a card-sized summary (title, destination, publisher, visibility, dates). The
 * itinerary body, money and members are never selected. Two actions resolve a
 * report stack:
 *
 * - **De-list** hides a trip from every public surface and closes the reports
 *   as `hidden`.
 * - **Dismiss** closes the reports as `dismissed` and, for a trip, clears the
 *   moderation marker so an auto-hidden listing returns without republishing.
 *
 * Profiles are queue-only: hiding a profile would silently take down every trip
 * its owner has published, so that stays a deliberate account action rather than
 * a one-click moderation side effect.
 */

export interface ModerationReporter {
  label: string;
  email?: string;
  handle?: string;
}

export interface ModerationReportRow {
  _id: string;
  reason: ReportReason;
  note?: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt?: string;
  reporter?: ModerationReporter;
}

export interface ModerationTripSummary {
  _id: string;
  title: string;
  destination: string;
  visibility: string;
  publishedAt?: string;
  startDate?: string;
  endDate?: string;
  publisherHandle?: string;
  publisherName?: string;
  hidden: boolean;
  hiddenAt?: string;
  hiddenSource?: string;
}

export interface ModerationProfileSummary {
  _id: string;
  name: string;
  email?: string;
  handle?: string;
  status: string;
}

export interface ModerationGroup {
  targetType: ReportTargetType;
  targetId: string;
  reportCount: number;
  lastReportedAt: string;
  reasons: Array<{ reason: ReportReason; count: number }>;
  reports: ModerationReportRow[];
  hidden: boolean;
  trip?: ModerationTripSummary;
  profile?: ModerationProfileSummary;
}

export interface ModerationList {
  groups: ModerationGroup[];
  status: ReportStatus;
  totals: { open: number; hidden: number; dismissed: number };
}

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

interface AggregatedReport {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  reason: ReportReason;
  note?: string;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt?: Date;
}

interface AggregatedGroup {
  _id: { targetType: ReportTargetType; targetId: mongoose.Types.ObjectId };
  reportCount: number;
  lastReportedAt: Date;
  reports: AggregatedReport[];
}

const isObjectId = (value: string): boolean => mongoose.isValidObjectId(value);

function iso(value: Date | undefined | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ownerIdOf(trip: any): string | undefined {
  const owner = (Array.isArray(trip?.members) ? trip.members : []).find(
    (member: any) => String(member?.role) === 'owner'
  );
  return owner?.userId ? String(owner.userId) : undefined;
}

function reasonCounts(reports: AggregatedReport[]): ModerationGroup['reasons'] {
  const counts = new Map<ReportReason, number>();
  for (const report of reports) {
    counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

async function listTotals(): Promise<ModerationList['totals']> {
  const rows = await TripReport.aggregate<{ _id: ReportStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const totals = { open: 0, hidden: 0, dismissed: 0 };
  for (const row of rows) {
    if (row._id in totals) totals[row._id] = row.count;
  }
  return totals;
}

/** Groups reports by target for the selected status, newest activity first. */
async function aggregateGroups(
  status: ReportStatus,
  limit: number
): Promise<AggregatedGroup[]> {
  return TripReport.aggregate<AggregatedGroup>([
    { $match: { status } },
    {
      $group: {
        _id: { targetType: '$targetType', targetId: '$targetId' },
        reportCount: { $sum: 1 },
        lastReportedAt: { $max: '$createdAt' },
        reports: {
          $push: {
            _id: '$_id',
            reporterId: '$reporterId',
            reason: '$reason',
            note: '$note',
            status: '$status',
            createdAt: '$createdAt',
            resolvedAt: '$resolvedAt',
          },
        },
      },
    },
    { $sort: { lastReportedAt: -1 } },
    { $limit: limit },
  ]);
}

export async function listReportedContent(
  query: ModerationQueryInput
): Promise<ModerationList> {
  const status = query.status;
  const [groups, totals] = await Promise.all([
    aggregateGroups(status, query.limit),
    listTotals(),
  ]);

  const tripIds = groups
    .filter((group) => group._id.targetType === 'trip')
    .map((group) => group._id.targetId);
  const profileIds = groups
    .filter((group) => group._id.targetType === 'profile')
    .map((group) => group._id.targetId);
  const reporterIds = [
    ...new Set(groups.flatMap((group) => group.reports.map((r) => String(r.reporterId)))),
  ];

  const [trips, profiles, reporters] = await Promise.all([
    tripIds.length
      ? ((await Trip.find({ _id: { $in: tripIds } })
          .select(
            'title tripDetails.trip_title tripDetails.destination tripDetails.duration_days visibility publishedAt startDate endDate members moderation'
          )
          .lean()) as any[])
      : Promise.resolve([]),
    profileIds.length
      ? ((await User.find({ _id: { $in: profileIds } })
          .select('name email profile status')
          .lean()) as any[])
      : Promise.resolve([]),
    reporterIds.length
      ? ((await User.find({ _id: { $in: reporterIds } })
          .select('name email profile')
          .lean()) as any[])
      : Promise.resolve([]),
  ]);

  const publisherIds = [
    ...new Set(trips.map(ownerIdOf).filter((id): id is string => Boolean(id))),
  ];
  const publishers = publisherIds.length
    ? ((await User.find({ _id: { $in: publisherIds } })
        .select('name profile')
        .lean()) as any[])
    : [];

  const tripMap = new Map(trips.map((trip) => [String(trip._id), trip]));
  const profileMap = new Map(profiles.map((profile) => [String(profile._id), profile]));
  const reporterMap = new Map(reporters.map((reporter) => [String(reporter._id), reporter]));
  const publisherMap = new Map(publishers.map((user) => [String(user._id), user]));

  return {
    status,
    totals,
    groups: groups.map((group) => {
      const { targetType, targetId } = group._id;
      const id = String(targetId);
      const trip = targetType === 'trip' ? tripMap.get(id) : undefined;
      const profile = targetType === 'profile' ? profileMap.get(id) : undefined;
      const hidden = Boolean(trip?.moderation?.hiddenAt);

      const reports: ModerationReportRow[] = [...group.reports]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((report) => {
          const reporter = reporterMap.get(String(report.reporterId));
          const row: ModerationReportRow = {
            _id: String(report._id),
            reason: report.reason,
            status: report.status,
            createdAt: iso(report.createdAt) ?? new Date(0).toISOString(),
          };
          if (report.note) row.note = report.note;
          const resolvedAt = iso(report.resolvedAt);
          if (resolvedAt) row.resolvedAt = resolvedAt;
          if (reporter) {
            const handle = text(reporter.profile?.handle);
            row.reporter = {
              label:
                text(reporter.name) || handle || text(reporter.email) || 'A traveller',
              ...(reporter.email ? { email: String(reporter.email) } : {}),
              ...(handle ? { handle } : {}),
            };
          }
          return row;
        });

      const out: ModerationGroup = {
        targetType,
        targetId: id,
        reportCount: group.reportCount,
        lastReportedAt:
          iso(group.lastReportedAt) ?? new Date(0).toISOString(),
        reasons: reasonCounts(group.reports),
        reports,
        hidden,
      };

      if (trip) {
        const publisher = publisherMap.get(ownerIdOf(trip) ?? '');
        const summary: ModerationTripSummary = {
          _id: String(trip._id),
          title: text(trip.title) || text(trip.tripDetails?.trip_title) || 'Untitled trip',
          destination:
            text(trip.tripDetails?.destination) ||
            text(trip.tripDetails?.trip_title) ||
            text(trip.title) ||
            'Untitled trip',
          visibility: String(trip.visibility ?? 'private'),
          hidden,
        };
        const publishedAt = iso(trip.publishedAt);
        const startDate = iso(trip.startDate);
        const endDate = iso(trip.endDate);
        const hiddenAt = iso(trip.moderation?.hiddenAt);
        if (publishedAt) summary.publishedAt = publishedAt;
        if (startDate) summary.startDate = startDate;
        if (endDate) summary.endDate = endDate;
        if (hiddenAt) summary.hiddenAt = hiddenAt;
        if (trip.moderation?.source) summary.hiddenSource = String(trip.moderation.source);
        if (publisher) {
          summary.publisherName =
            text(publisher.name) || text(publisher.profile?.handle) || undefined;
          summary.publisherHandle = text(publisher.profile?.handle) || undefined;
        }
        out.trip = summary;
      }

      if (profile) {
        out.profile = {
          _id: String(profile._id),
          name: text(profile.name) || text(profile.profile?.handle) || 'A traveller',
          status: String(profile.status ?? 'active'),
          ...(profile.email ? { email: String(profile.email) } : {}),
          ...(text(profile.profile?.handle)
            ? { handle: text(profile.profile?.handle) }
            : {}),
        };
      }

      return out;
    }),
  };
}

export interface ModerationActionInput {
  actorId: string;
  targetType: ReportTargetType;
  targetId: string;
  action: 'hide' | 'dismiss';
  client?: ClientContext;
}

export interface ModerationActionResult {
  targetType: ReportTargetType;
  targetId: string;
  action: 'hide' | 'dismiss';
  hidden: boolean;
  resolved: number;
  changed: boolean;
}

/**
 * Applies one moderation decision to one target and closes every open report
 * for it. `hide` also de-lists a trip; `dismiss` restores a hidden trip. Both
 * are audited with the number of reports resolved.
 */
export async function resolveReportedContent(
  input: ModerationActionInput
): Promise<ModerationActionResult> {
  if (input.targetType === 'trip' && !isObjectId(input.targetId)) {
    throw new AppError('Reported content not found.', 404);
  }
  if (input.targetType === 'profile' && !isObjectId(input.targetId)) {
    throw new AppError('Reported content not found.', 404);
  }

  if (input.targetType === 'profile' && input.action === 'hide') {
    throw new AppError(
      'Profiles cannot be de-listed from this console. Dismiss the report or disable the account.',
      400
    );
  }

  if (input.targetType === 'trip') {
    const exists = await Trip.exists({ _id: input.targetId });
    if (!exists) throw new AppError('Reported content not found.', 404);
  } else {
    const exists = await User.exists({ _id: input.targetId });
    if (!exists) throw new AppError('Reported content not found.', 404);
  }

  let changed = false;
  if (input.targetType === 'trip') {
    changed =
      input.action === 'hide'
        ? await hideTripForReports(input.targetId, input.actorId)
        : await restoreTripAfterReports(input.targetId);
  }

  const now = new Date();
  // Dismissing also reclassifies reports that a previous de-list closed as
  // `hidden`, so a restored listing does not keep a phantom stack in the
  // De-listed tab while its trip is public again.
  const closingStatuses = input.action === 'hide' ? ['open'] : ['open', 'hidden'];
  const update = await TripReport.updateMany(
    {
      targetType: input.targetType,
      targetId: input.targetId,
      status: { $in: closingStatuses },
    },
    {
      $set: {
        status: input.action === 'hide' ? 'hidden' : 'dismissed',
        resolvedBy: input.actorId,
        resolvedAt: now,
      },
    }
  );

  const target = await Trip.findOne({ _id: input.targetId })
    .select('moderation')
    .lean()
    .catch(() => null);
  const hidden =
    input.targetType === 'trip' ? Boolean((target as any)?.moderation?.hiddenAt) : false;

  await recordPlatformAudit({
    actorId: input.actorId,
    action: input.action === 'hide' ? 'content.hidden' : 'content.dismissed',
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: {
      reportsResolved: update.modifiedCount,
      hidden,
    },
    ...input.client,
  });

  return {
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    hidden,
    resolved: update.modifiedCount,
    changed,
  };
}
