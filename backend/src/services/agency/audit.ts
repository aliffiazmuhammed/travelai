import AgencyAudit from '../../models/AgencyAudit.js';
import User from '../../models/User.js';
import { escapeRegex } from '../../utils/escapeRegex.js';

/**
 * Best-effort audit writes. A logging failure must never turn a successful
 * export into an error for the user, but it is surfaced in server logs.
 */
export async function recordAgencyAudit(input: {
  agencyId: string;
  /** Omitted for public, token-authenticated events (A7 share views/accepts). */
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AgencyAudit.create({
      agencyId: input.agencyId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
  } catch (error) {
    console.warn('Could not write agency audit event:', error);
  }
}

export interface AgencyAuditEntry {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Resolved display name/email of the actor; null = token/ops event. */
  actor: string | null;
  createdAt: Date;
}

export interface ListAgencyAuditResult {
  entries: AgencyAuditEntry[];
  total: number;
  page: number;
  limit: number;
}

/**
 * A8 audit viewer (owner/admin). Read-only by design — there is no update or
 * delete path for audit rows anywhere in the application.
 */
export async function listAgencyAudit(input: {
  agencyId: string;
  page: number;
  limit: number;
  actionPrefix?: string;
}): Promise<ListAgencyAuditResult> {
  const page = Math.max(1, Math.floor(input.page) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit) || 50));
  const actionPrefix = String(input.actionPrefix || '').trim().slice(0, 80);

  const query: Record<string, unknown> = { agencyId: input.agencyId };
  if (actionPrefix) {
    query.action = { $regex: `^${escapeRegex(actionPrefix)}` };
  }

  const [total, rows] = await Promise.all([
    AgencyAudit.countDocuments(query),
    AgencyAudit.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const actorIds = Array.from(
    new Set(
      rows
        .map((row) => String(row.actorId ?? ''))
        .filter((id) => id)
    )
  );
  const actorLabels = new Map<string, string>();
  if (actorIds.length) {
    const users = await User.find({ _id: { $in: actorIds } })
      .select('name email')
      .lean();
    for (const user of users) {
      actorLabels.set(
        String(user._id),
        String(user.name || '').trim() ||
          String(user.email || '').split('@')[0] ||
          'Team member'
      );
    }
  }

  const entries: AgencyAuditEntry[] = rows.map((row) => ({
    _id: String(row._id),
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    actor: row.actorId ? actorLabels.get(String(row.actorId)) ?? 'Removed member' : null,
    createdAt: row.createdAt,
  }));

  return { entries, total, page, limit };
}
