import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose, { type FilterQuery, type UpdateQuery } from 'mongoose';
import Agency, { type AgencyStatus } from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import PlatformAudit from '../../models/PlatformAudit.js';
import User, {
  type AccountStatus,
  type AccountType,
  type IUser,
  type PlatformRole,
} from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type { AccountListQuery } from '../../schemas/platformAccounts.schema.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { recordPlatformAudit } from './audit.js';

/**
 * Platform account directory and account management (PA2).
 *
 * The directory is deliberately cross-realm but never cross-tenant: it lists
 * identity metadata (realm, tenant label, status, dates) and platform audit
 * events. It never loads trip content, clients, quotes, exports or any other
 * tenant data. Mutable operations are scoped by account id, so disabling one
 * realm's account can never affect the same email in another realm.
 */

export interface AdminAgencyLabel {
  _id: string;
  name: string;
  slug: string;
  status: AgencyStatus;
}

export interface AdminAccountRow {
  _id: string;
  email: string;
  name?: string;
  accountType: AccountType;
  status: AccountStatus;
  platformRole?: PlatformRole;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
  agency?: AdminAgencyLabel;
}

export interface AdminAuditRow {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  /** Platform operator who performed the action, when it still exists. */
  actorEmail?: string;
  createdAt: string;
}

export interface AdminMembershipRow {
  agency: AdminAgencyLabel;
  role: string;
  joinedAt: string;
}

export interface AdminAccountDetail extends AdminAccountRow {
  passwordChangedAt?: string;
  memberships: AdminMembershipRow[];
  /** Separate rows that share this email in another realm or tenant. */
  relatedAccounts: AdminAccountRow[];
  recentAudit: AdminAuditRow[];
}

export interface AdminAccountListResult {
  accounts: AdminAccountRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Realm totals for the current search/status filter (tabs). */
  counts: { all: number; personal: number; agency: number; platform: number };
}

export interface AdminOverview {
  accounts: {
    total: number;
    personal: number;
    agency: number;
    platform: number;
    disabled: number;
  };
  agencies: {
    total: number;
    active: number;
    suspended: number;
  };
  recentAudit: AdminAuditRow[];
}

interface AccountLean {
  _id: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  accountType: AccountType;
  agencyId?: mongoose.Types.ObjectId;
  platformRole?: PlatformRole;
  status: AccountStatus;
  mustChangePassword?: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
}

interface AgencyLean {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  status: AgencyStatus;
}

interface AuditLean {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  createdAt: Date;
}

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

function assertAccountId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Account not found.', 404);
  }
}

function iso(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * PA2: one temporary password format for every platform-triggered reset. The
 * `Tv!` prefix keeps printed output unambiguous and satisfies the password
 * shape rules; the rest is 144 bits of randomness.
 */
export function generateTemporaryPassword(): string {
  return `Tv!${crypto.randomBytes(18).toString('base64url')}`;
}

/**
 * Pure last-admin / self-disable policy, kept separate so the guard is testable
 * without a database. Only platform accounts can be "last admins"; disabling a
 * personal or agency account is always allowed.
 */
export function assertStatusChangeAllowed(input: {
  accountType: AccountType;
  accountId: string;
  actorId: string;
  nextStatus: AccountStatus;
  /** Active super-admins in the database, including the target account. */
  activePlatformAdmins: number;
}): void {
  if (input.accountType !== 'platform' || input.nextStatus !== 'disabled') return;

  if (String(input.accountId) === String(input.actorId)) {
    throw new AppError('You cannot disable your own platform account.', 400);
  }
  if (input.activePlatformAdmins <= 1) {
    throw new AppError(
      'The last active platform super-admin cannot be disabled.',
      409
    );
  }
}

function toAccountRow(
  account: AccountLean,
  agencies: Map<string, AgencyLean>
): AdminAccountRow {
  const agency = account.agencyId
    ? agencies.get(String(account.agencyId))
    : undefined;

  const row: AdminAccountRow = {
    _id: String(account._id),
    email: String(account.email),
    accountType: account.accountType,
    status: account.status,
    mustChangePassword: account.mustChangePassword === true,
    createdAt: iso(account.createdAt) ?? new Date(0).toISOString(),
  };

  if (account.name) row.name = String(account.name);
  if (account.platformRole) row.platformRole = account.platformRole;
  if (account.lastLoginAt) row.lastLoginAt = iso(account.lastLoginAt);
  if (agency) {
    row.agency = {
      _id: String(agency._id),
      name: String(agency.name),
      slug: String(agency.slug),
      status: agency.status,
    };
  }
  return row;
}

async function loadAgencyMap(rows: AccountLean[]): Promise<Map<string, AgencyLean>> {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.agencyId)
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id))
        .map((id) => String(id))
    ),
  ];
  if (ids.length === 0) return new Map();

  const agencies = (await Agency.find({ _id: { $in: ids } })
    .select('name slug status')
    .lean()) as unknown as AgencyLean[];

  return new Map(agencies.map((agency) => [String(agency._id), agency]));
}

async function loadActorEmails(rows: AuditLean[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((row) => String(row.actorId)))];
  if (ids.length === 0) return new Map();

  const actors = (await User.find({ _id: { $in: ids } })
    .select('email')
    .lean()) as unknown as Array<{ _id: mongoose.Types.ObjectId; email: string }>;

  return new Map(actors.map((actor) => [String(actor._id), String(actor.email)]));
}

async function projectAuditRows(rows: AuditLean[]): Promise<AdminAuditRow[]> {
  const actors = await loadActorEmails(rows);
  return rows.map((row) => {
    const projected: AdminAuditRow = {
      _id: String(row._id),
      action: String(row.action),
      targetType: String(row.targetType),
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
    };
    if (row.targetId) projected.targetId = String(row.targetId);
    const actorEmail = actors.get(String(row.actorId));
    if (actorEmail) projected.actorEmail = actorEmail;
    return projected;
  });
}

/** Recent platform audit rows, newest first (shared by overview and detail). */
export async function listRecentPlatformAudit(limit = 8): Promise<AdminAuditRow[]> {
  const rows = (await PlatformAudit.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 50))
    .select('actorId action targetType targetId createdAt')
    .lean()) as unknown as AuditLean[];

  return projectAuditRows(rows);
}

function buildAccountFilter(query: AccountListQuery): FilterQuery<IUser> {
  const filter: FilterQuery<IUser> = {};

  if (query.status !== 'all') filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ email: pattern }, { name: pattern }];
  }
  return filter;
}

/**
 * Lists accounts across realms. The same email can legitimately appear multiple
 * times (personal + one agency account per tenant + platform); each row carries
 * its realm and tenant label, and nothing here merges them.
 */
export async function listAccounts(
  query: AccountListQuery
): Promise<AdminAccountListResult> {
  const baseFilter = buildAccountFilter(query);
  const filter: FilterQuery<IUser> = { ...baseFilter };
  if (query.realm !== 'all') filter.accountType = query.realm;

  const [rows, total, countRows] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select(
        'email name accountType agencyId platformRole status mustChangePassword lastLoginAt createdAt'
      )
      .lean() as unknown as Promise<AccountLean[]>,
    User.countDocuments(filter),
    User.aggregate<{ _id: AccountType; count: number }>([
      { $match: baseFilter },
      { $group: { _id: '$accountType', count: { $sum: 1 } } },
    ]),
  ]);

  const agencies = await loadAgencyMap(rows);
  const counts = { all: 0, personal: 0, agency: 0, platform: 0 };
  for (const entry of countRows) {
    counts[entry._id] = entry.count;
    counts.all += entry.count;
  }

  return {
    accounts: rows.map((row) => toAccountRow(row, agencies)),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    counts,
  };
}

/** Account detail: identity metadata, memberships and recent platform audit. */
export async function getAccountDetail(id: string): Promise<AdminAccountDetail> {
  assertAccountId(id);

  const account = (await User.findById(id)
    .select(
      'email name accountType agencyId platformRole status mustChangePassword lastLoginAt passwordChangedAt createdAt'
    )
    .lean()) as unknown as AccountLean | null;

  if (!account) throw new AppError('Account not found.', 404);

  const [agencyMap, memberships, related, auditRows] = await Promise.all([
    loadAgencyMap([account]),
    AgencyMember.find({ userId: account._id })
      .select('agencyId role joinedAt')
      .lean() as unknown as Promise<
      Array<{
        agencyId: mongoose.Types.ObjectId;
        role: string;
        joinedAt: Date;
      }>
    >,
    User.find({ email: account.email, _id: { $ne: account._id } })
      .sort({ createdAt: 1 })
      .select(
        'email name accountType agencyId platformRole status mustChangePassword lastLoginAt createdAt'
      )
      .lean() as unknown as Promise<AccountLean[]>,
    PlatformAudit.find({ targetId: String(account._id) })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('actorId action targetType targetId createdAt')
      .lean() as unknown as Promise<AuditLean[]>,
  ]);

  const membershipAgencies = await loadAgencyMap(
    memberships.map((membership) => ({ agencyId: membership.agencyId } as AccountLean))
  );
  const relatedAgencyMap = await loadAgencyMap(related);

  const row = toAccountRow(account, agencyMap);
  const detail: AdminAccountDetail = {
    ...row,
    memberships: memberships.flatMap((membership) => {
      const agency = membershipAgencies.get(String(membership.agencyId));
      if (!agency) return [];
      return [
        {
          agency: {
            _id: String(agency._id),
            name: String(agency.name),
            slug: String(agency.slug),
            status: agency.status,
          },
          role: String(membership.role),
          joinedAt: iso(membership.joinedAt) ?? new Date(0).toISOString(),
        },
      ];
    }),
    relatedAccounts: related.map((relatedAccount) =>
      toAccountRow(relatedAccount, relatedAgencyMap)
    ),
    recentAudit: await projectAuditRows(auditRows),
  };

  if (account.passwordChangedAt) {
    detail.passwordChangedAt = iso(account.passwordChangedAt);
  }
  return detail;
}

async function countActivePlatformAdmins(): Promise<number> {
  return User.countDocuments({
    accountType: 'platform',
    platformRole: 'super_admin',
    status: 'active',
  });
}

async function loadAccountForMutation(id: string): Promise<IUser> {
  assertAccountId(id);
  const account = await User.findById(id);
  if (!account) throw new AppError('Account not found.', 404);
  return account;
}

/**
 * Enables or disables any realm's account. Disabling bumps `tokenVersion`, so
 * every live cookie/Bearer session for that account fails on its next request.
 * The policy check runs against the target's own realm only — the same email in
 * another realm is a different row and stays untouched.
 */
export async function setAccountStatus(input: {
  actorId: string;
  accountId: string;
  status: AccountStatus;
  client?: ClientContext;
}): Promise<{ account: AdminAccountRow; changed: boolean }> {
  const account = await loadAccountForMutation(input.accountId);

  if (account.status === input.status) {
    const detail = await getAccountDetail(input.accountId);
    const {
      memberships: _memberships,
      relatedAccounts: _relatedAccounts,
      recentAudit: _audit,
      ...row
    } = detail;
    return { account: row, changed: false };
  }

  if (account.accountType === 'platform' && input.status === 'disabled') {
    const activePlatformAdmins = await countActivePlatformAdmins();
    assertStatusChangeAllowed({
      accountType: account.accountType,
      accountId: String(account._id),
      actorId: input.actorId,
      nextStatus: input.status,
      activePlatformAdmins,
    });
  }

  const update: UpdateQuery<IUser> = { $set: { status: input.status } };
  if (input.status === 'disabled') update.$inc = { tokenVersion: 1 };
  await User.updateOne({ _id: account._id }, update);

  await recordPlatformAudit({
    actorId: input.actorId,
    action: input.status === 'disabled' ? 'account.disabled' : 'account.enabled',
    targetType: 'account',
    targetId: String(account._id),
    metadata: {
      realm: account.accountType,
      email: account.email,
      ...(account.agencyId ? { agencyId: String(account.agencyId) } : {}),
    },
    ...input.client,
  });

  const detail = await getAccountDetail(String(account._id));
  const {
    memberships: _memberships,
    relatedAccounts: _relatedAccounts,
    recentAudit: _audit,
    ...row
  } = detail;
  return { account: row, changed: true };
}

/**
 * Resets an agency account's workspace password to a one-time temporary value.
 * Only agency accounts are eligible: personal credentials stay self-service and
 * platform credentials rotate through `/api/admin/auth/password`.
 */
export async function resetAgencyPassword(input: {
  actorId: string;
  accountId: string;
  client?: ClientContext;
}): Promise<{
  temporaryPassword: string;
  email: string;
  workspace?: string;
  agencyName?: string;
}> {
  const account = await loadAccountForMutation(input.accountId);

  if (account.accountType !== 'agency') {
    throw new AppError(
      'Only agency workspace accounts can be reset from the platform console.',
      400
    );
  }

  const agency = account.agencyId
    ? ((await Agency.findById(account.agencyId)
        .select('name slug')
        .lean()) as unknown as { name: string; slug: string } | null)
    : null;

  const temporaryPassword = generateTemporaryPassword();
  await User.updateOne(
    { _id: account._id },
    {
      $set: {
        password: await bcrypt.hash(temporaryPassword, 12),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
      $inc: { tokenVersion: 1 },
    }
  );

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'account.password_reset',
    targetType: 'account',
    targetId: String(account._id),
    metadata: {
      realm: 'agency',
      email: account.email,
      ...(account.agencyId ? { agencyId: String(account.agencyId) } : {}),
      ...(agency ? { workspace: agency.slug, agencyName: agency.name } : {}),
    },
    ...input.client,
  });

  if (account.agencyId) {
    // Tenant-visible security event: the workspace audit viewer should show a
    // platform-issued reset even though the operator is not a tenant member.
    await recordAgencyAudit({
      agencyId: String(account.agencyId),
      actorId: input.actorId,
      action: 'member.password_reset',
      targetType: 'User',
      targetId: String(account._id),
      metadata: {
        email: account.email,
        issuedByPlatform: true,
        ...(agency ? { workspace: agency.slug } : {}),
      },
    });
  }

  return {
    temporaryPassword,
    email: String(account.email),
    ...(agency ? { workspace: String(agency.slug), agencyName: String(agency.name) } : {}),
  };
}

/** Lists platform super-admins and how many of them are currently active. */
export async function listPlatformAccounts(
  query: AccountListQuery
): Promise<AdminAccountListResult & { activeTotal: number }> {
  const result = await listAccounts({ ...query, realm: 'platform' });
  return {
    ...result,
    activeTotal: await User.countDocuments({
      accountType: 'platform',
      platformRole: 'super_admin',
      status: 'active',
    }),
  };
}

/**
 * Creates a platform super-admin with a one-time temporary password and a forced
 * first-login change. This is the only account-creation path for this realm
 * (there is no public signup), and it never attaches to an existing personal or
 * agency row with the same email.
 */
export async function createPlatformAccount(input: {
  actorId: string;
  email: string;
  name?: string;
  client?: ClientContext;
}): Promise<{ account: AdminAccountRow; temporaryPassword: string }> {
  const email = input.email.trim().toLowerCase();

  const existing = await User.findOne({ accountType: 'platform', email })
    .select('_id')
    .lean();
  if (existing) {
    throw new AppError('A platform account with this email already exists.', 409);
  }

  const temporaryPassword = generateTemporaryPassword();
  let account: IUser;
  try {
    account = await User.create({
      email,
      password: await bcrypt.hash(temporaryPassword, 12),
      accountType: 'platform',
      platformRole: 'super_admin',
      status: 'active',
      mustChangePassword: true,
      tokenVersion: 0,
      createdBy: input.actorId,
      ...(input.name ? { name: input.name } : {}),
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError('A platform account with this email already exists.', 409);
    }
    throw error;
  }

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'platform_account.created',
    targetType: 'platform_account',
    targetId: String(account._id),
    metadata: { email },
    ...input.client,
  });

  return {
    account: toAccountRow(
      {
        _id: new mongoose.Types.ObjectId(String(account._id)),
        email: account.email,
        name: account.name,
        accountType: 'platform',
        platformRole: 'super_admin',
        status: 'active',
        mustChangePassword: true,
        createdAt: account.createdAt,
      },
      new Map()
    ),
    temporaryPassword,
  };
}

/**
 * Updates a platform super-admin. Disable/enable is policy-guarded (no self
 * disable, never the last active admin); the display name is cosmetic.
 */
export async function updatePlatformAccount(input: {
  actorId: string;
  accountId: string;
  status?: AccountStatus;
  name?: string | null;
  client?: ClientContext;
}): Promise<{ account: AdminAccountRow; changed: boolean }> {
  const account = await loadAccountForMutation(input.accountId);
  if (account.accountType !== 'platform') {
    throw new AppError('Platform account not found.', 404);
  }

  let changed = false;

  if (input.status && input.status !== account.status) {
    if (input.status === 'disabled') {
      assertStatusChangeAllowed({
        accountType: 'platform',
        accountId: String(account._id),
        actorId: input.actorId,
        nextStatus: input.status,
        activePlatformAdmins: await countActivePlatformAdmins(),
      });
    }

    const update: UpdateQuery<IUser> = { $set: { status: input.status } };
    if (input.status === 'disabled') update.$inc = { tokenVersion: 1 };
    await User.updateOne({ _id: account._id }, update);
    changed = true;
  }

  if (input.name !== undefined) {
    const nextName = input.name === null ? '' : input.name.trim();
    if (nextName && nextName.length > 40) {
      throw new AppError('Name must be 40 characters or fewer.', 400);
    }
    if (nextName !== (account.name ?? '')) {
      await User.updateOne(
        { _id: account._id },
        nextName ? { $set: { name: nextName } } : { $unset: { name: 1 } }
      );
      changed = true;
    }
  }

  if (changed) {
    await recordPlatformAudit({
      actorId: input.actorId,
      action: 'platform_account.updated',
      targetType: 'platform_account',
      targetId: String(account._id),
      metadata: {
        email: account.email,
        fields: [
          ...(input.status ? ['status'] : []),
          ...(input.name !== undefined ? ['name'] : []),
        ],
      },
      ...input.client,
    });
  }

  const detail = await getAccountDetail(String(account._id));
  const {
    memberships: _memberships,
    relatedAccounts: _relatedAccounts,
    recentAudit: _audit,
    ...row
  } = detail;
  return { account: row, changed };
}

/** Console overview: realm/agency counts plus the latest platform audit rows. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const [accountCounts, agencyCounts, recentAudit] = await Promise.all([
    User.aggregate<{
      _id: { realm: AccountType; status: AccountStatus };
      count: number;
    }>([
      {
        $group: {
          _id: { realm: '$accountType', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    Agency.aggregate<{ _id: AgencyStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    listRecentPlatformAudit(8),
  ]);

  const accounts = {
    total: 0,
    personal: 0,
    agency: 0,
    platform: 0,
    disabled: 0,
  };
  for (const entry of accountCounts) {
    accounts.total += entry.count;
    if (entry._id.realm in accounts) {
      accounts[entry._id.realm] += entry.count;
    }
    if (entry._id.status === 'disabled') accounts.disabled += entry.count;
  }

  const agencies = { total: 0, active: 0, suspended: 0 };
  for (const entry of agencyCounts) {
    agencies.total += entry.count;
    if (entry._id === 'active') agencies.active += entry.count;
    if (entry._id === 'suspended') agencies.suspended += entry.count;
  }

  return { accounts, agencies, recentAudit };
}
