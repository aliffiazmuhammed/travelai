import AccountDeletionRequest, {
  type AccountDeletionRequestStatus,
} from '../../models/AccountDeletionRequest.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { recordPlatformAudit } from '../platform/audit.js';

/**
 * Support-queue account deletion (C-08 / D-F).
 *
 * Nothing is deleted here. A request is recorded once per account, a platform
 * audit row makes it visible to operators, and the owner keeps full access
 * until a human confirms. Roadmap F19 (owners can orphan shared trips) is a
 * review concern, not something a click can bypass.
 */

export interface DeletionRequestView {
  status: AccountDeletionRequestStatus;
  requestedAt: Date;
  reason?: string;
}

export interface RequestDeletionResult {
  request: DeletionRequestView;
  alreadyRequested: boolean;
}

function project(request: any): DeletionRequestView {
  return {
    status: request.status,
    requestedAt: request.requestedAt,
    ...(request.reason ? { reason: String(request.reason) } : {}),
  };
}

export async function requestAccountDeletion(
  userId: string,
  reason: unknown,
  context: { ip?: string; userAgent?: string } = {}
): Promise<RequestDeletionResult> {
  const existing = await AccountDeletionRequest.findOne({
    userId,
    status: 'pending',
  }).lean();
  if (existing) return { request: project(existing), alreadyRequested: true };

  // The audit trail must name a real personal account, and the queue snapshots
  // the address an operator will reply to.
  const user = await User.findOne({
    _id: userId,
    accountType: 'personal',
    status: 'active',
  })
    .select('email name')
    .lean();
  if (!user) throw new AppError('Account not found.', 404);

  const cleanReason =
    typeof reason === 'string' && reason.trim()
      ? reason.trim().slice(0, 500)
      : undefined;

  let created: any;
  try {
    created = await AccountDeletionRequest.create({
      userId,
      email: String(user.email ?? '').trim().toLowerCase(),
      name: user.name ? String(user.name) : undefined,
      reason: cleanReason,
      status: 'pending',
      requestedAt: new Date(),
    });
  } catch (error: any) {
    // Two tabs (or a retry after a timeout) can race the partial unique index.
    // The second caller gets the request that won instead of an error.
    if (error?.code === 11000) {
      const raced = await AccountDeletionRequest.findOne({
        userId,
        status: 'pending',
      }).lean();
      if (raced) return { request: project(raced), alreadyRequested: true };
    }
    throw error;
  }

  await recordPlatformAudit({
    actorId: userId,
    action: 'account.deletion_requested',
    targetType: 'account',
    targetId: userId,
    metadata: { reason: cleanReason },
    ip: context.ip,
    userAgent: context.userAgent,
  });

  return { request: project(created), alreadyRequested: false };
}

/** The open request, if any, so Profile can show the status instead of a button. */
export async function getOpenAccountDeletionRequest(
  userId: string
): Promise<DeletionRequestView | null> {
  const request = await AccountDeletionRequest.findOne({
    userId,
    status: 'pending',
  }).lean();
  return request ? project(request) : null;
}
