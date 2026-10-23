import AgencyAudit from '../../models/AgencyAudit.js';

/**
 * Best-effort audit writes. A logging failure must never turn a successful
 * export into an error for the user, but it is surfaced in server logs.
 */
export async function recordAgencyAudit(input: {
  agencyId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await AgencyAudit.create({
      agencyId: input.agencyId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
    });
  } catch (error) {
    console.warn('Could not write agency audit event:', error);
  }
}
