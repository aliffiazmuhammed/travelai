/**
 * PA0 migration helpers.
 *
 * The script (`scripts/migrate-account-realms.mts`) does the database work;
 * these pure functions decide what to backfill and validate the post-migration
 * invariant that an agency membership never points at a non-agency account.
 * Keeping them pure is what lets the fixture tests run without MongoDB.
 */

export interface LegacyUserRow {
  _id: unknown;
  email?: string;
  accountType?: string;
  agencyId?: unknown;
  status?: string;
  mustChangePassword?: boolean;
  tokenVersion?: number;
}

export interface LegacyMembershipRow {
  _id: unknown;
  userId: unknown;
  agencyId: unknown;
}

export type MembershipViolationReason =
  | 'missing_account'
  | 'personal_account'
  | 'platform_account'
  | 'tenant_mismatch';

export interface MembershipViolation {
  membershipId: string;
  userId: string;
  agencyId: string;
  reason: MembershipViolationReason;
}

/** The fields every pre-PA0 user needs before the new guards can read them. */
export function legacyUserBackfill(user: LegacyUserRow): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!user.accountType) patch.accountType = 'personal';
  if (!user.status) patch.status = 'active';
  if (user.mustChangePassword === undefined) patch.mustChangePassword = false;
  if (user.tokenVersion === undefined || user.tokenVersion === null) {
    patch.tokenVersion = 0;
  }
  return patch;
}

function sameId(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null || right === undefined || right === null) {
    return false;
  }
  return String(left) === String(right);
}

/**
 * Every membership must point at an agency account bound to the same tenant.
 *
 * After the legacy backfill every old user is `personal`, so existing
 * memberships are expected to fail this check until the pilot's agency data is
 * reset or the production mapping (§10.3) repoints them.
 */
export function findAgencyMembershipViolations(
  memberships: readonly LegacyMembershipRow[],
  users: readonly LegacyUserRow[]
): MembershipViolation[] {
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const violations: MembershipViolation[] = [];

  for (const membership of memberships) {
    const account = byId.get(String(membership.userId));
    const base = {
      membershipId: String(membership._id),
      userId: String(membership.userId),
      agencyId: String(membership.agencyId),
    };

    if (!account) {
      violations.push({ ...base, reason: 'missing_account' });
      continue;
    }
    if (account.accountType === 'personal' || account.accountType === undefined) {
      violations.push({ ...base, reason: 'personal_account' });
      continue;
    }
    if (account.accountType === 'platform') {
      violations.push({ ...base, reason: 'platform_account' });
      continue;
    }
    if (!sameId(account.agencyId, membership.agencyId)) {
      violations.push({ ...base, reason: 'tenant_mismatch' });
    }
  }

  return violations;
}

/**
 * One agency account belongs to exactly one tenant, so the same `userId` may
 * appear in at most one membership row. Duplicates block the unique index and
 * usually mean an old personal account was reused across tenants.
 */
export function findDuplicateMembershipUserIds(
  memberships: readonly LegacyMembershipRow[]
): string[] {
  const counts = new Map<string, number>();
  for (const membership of memberships) {
    const key = String(membership.userId);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([userId]) => userId);
}
