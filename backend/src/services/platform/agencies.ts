import mongoose, { type FilterQuery } from 'mongoose';
import Agency, {
  type AgencyStatus,
  type IAgency,
  type IAgencyBilling,
} from '../../models/Agency.js';
import AgencyProfile from '../../models/AgencyProfile.js';
import AgencyInvite from '../../models/AgencyInvite.js';
import AgencyMember from '../../models/AgencyMember.js';
import PlatformAudit, { type IPlatformAudit } from '../../models/PlatformAudit.js';
import Trip from '../../models/Trip.js';
import User, { type AccountStatus } from '../../models/User.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type {
  AgencyListQuery,
  AgencyMemberInviteInput,
  AgencyPlanChangeInput,
  PlatformAuditQuery,
} from '../../schemas/platformAgencies.schema.js';
import type { LinkOriginHints } from '../collab/invites.js';
import { AGENCY_ROLE_RANK, type AgencyRole } from '../agency/access.js';
import { recordAgencyAudit } from '../agency/audit.js';
import { publicProfileFilter } from '../directory/profile.js';
import {
  changeAgencyMemberRole as changeMemberRoleService,
  removeAgencyMember as removeMemberService,
} from '../agency/members.js';
import {
  createAgencyInvite,
  projectAgencyInvite,
} from '../agency/invites.js';
import {
  agencyUsage,
  applyAgencyPlan,
  planLimitsFor,
  type AgencyPlanLimits,
  type AgencyUsage,
  type AgencyPlanChange,
} from '../agency/plan.js';
import { resetAgencyPassword, type ClientContext } from './accounts.js';
import { recordPlatformAudit } from './audit.js';
import {
  loadDirectoryAdminView,
  type DirectoryAdminView,
} from './directoryAdmin.js';

/**
 * Platform agency lifecycle and access operations (PA4).
 *
 * The console reuses the tenant's own plan/member/invite rules instead of
 * reimplementing them, then adds the cross-tenant pieces the tenant cannot do
 * for itself: suspension, owner transfer, platform-triggered invites and a
 * platform audit trail. Tenant content is never read or returned here — only
 * identity metadata, plan limits and aggregate usage.
 */

export interface PlatformAgencyOwner {
  accountId: string;
  email: string;
  name?: string;
  status: AccountStatus;
  joinedAt: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
}

export interface PlatformAgencyMemberRow {
  userId: string;
  email: string;
  name?: string;
  role: AgencyRole;
  status: AccountStatus;
  joinedAt: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
}

export interface PlatformAgencyBilling {
  contactName?: string;
  contactEmail?: string;
  renewalDate?: string;
  notes?: string;
}

export interface PlatformAgencyRow {
  _id: string;
  name: string;
  slug: string;
  status: AgencyStatus;
  plan: AgencyPlanLimits;
  billing?: PlatformAgencyBilling;
  memberCount: number;
  ownerCount: number;
  owner?: PlatformAgencyOwner;
  provisionedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Latest tenant signal: agency update, staff sign-in or trip update. */
  lastActivityAt: string;
}

export interface PlatformAgencyDetail extends PlatformAgencyRow {
  usage: AgencyUsage;
  /** Raw overrides only; omitted fields inherit the tier. */
  planOverrides?: {
    seats?: number;
    monthlyExports?: number;
    storageMb?: number;
  };
  owners: PlatformAgencyOwner[];
  members: PlatformAgencyMemberRow[];
  pendingInvites: number;
  recentAudit: PlatformAuditEntry[];
  /** Public directory state, packages and readiness (M9 D7). */
  directory: DirectoryAdminView;
}

export interface PlatformAgencyListResult {
  agencies: PlatformAgencyRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { all: number; active: number; suspended: number };
}

export interface PlatformAuditEntry {
  _id: string;
  action: string;
  targetType: string;
  targetId?: string;
  actorId?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface PlatformAuditListResult {
  entries: PlatformAuditEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  facets: { actions: string[]; targetTypes: string[] };
}

interface AgencyLean {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  status: AgencyStatus;
  plan?: { tierId: string; seats?: number; monthlyExports?: number; storageMb?: number };
  billing?: IAgencyBilling;
  provisionedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipLean {
  _id: mongoose.Types.ObjectId;
  agencyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: AgencyRole;
  joinedAt: Date;
}

interface MemberUserLean {
  _id: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  status: AccountStatus;
  lastLoginAt?: Date;
  mustChangePassword?: boolean;
}

interface AuditLean {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

function assertAgencyId(id: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Agency not found.', 404);
  }
}

function iso(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isoRequired(value: Date | undefined): string {
  return iso(value) ?? new Date(0).toISOString();
}

function projectBilling(billing?: IAgencyBilling): PlatformAgencyBilling | undefined {
  if (!billing || Object.keys(billing).length === 0) return undefined;
  const projected: PlatformAgencyBilling = {};
  if (billing.contactName) projected.contactName = String(billing.contactName);
  if (billing.contactEmail) projected.contactEmail = String(billing.contactEmail);
  if (billing.renewalDate) {
    const renewal = iso(billing.renewalDate as Date);
    if (renewal) projected.renewalDate = renewal;
  }
  if (billing.notes) projected.notes = String(billing.notes);
  return Object.keys(projected).length > 0 ? projected : undefined;
}

async function loadAgency(id: string): Promise<AgencyLean> {
  assertAgencyId(id);
  const agency = (await Agency.findById(id)
    .select('name slug status plan billing provisionedAt createdAt updatedAt')
    .lean()) as unknown as AgencyLean | null;
  if (!agency) throw new AppError('Agency not found.', 404);
  return agency;
}

async function loadMemberRows(agencyId: string): Promise<{
  memberships: MembershipLean[];
  users: Map<string, MemberUserLean>;
}> {
  const memberships = (await AgencyMember.find({ agencyId })
    .sort({ joinedAt: 1, _id: 1 })
    .select('agencyId userId role joinedAt')
    .lean()) as unknown as MembershipLean[];

  const userIds = memberships.map((membership) => membership.userId);
  const users = userIds.length
    ? ((await User.find({ _id: { $in: userIds } })
        .select('email name status lastLoginAt mustChangePassword')
        .lean()) as unknown as MemberUserLean[])
    : [];

  return {
    memberships,
    users: new Map(users.map((user) => [String(user._id), user])),
  };
}

function projectOwner(
  membership: MembershipLean,
  user: MemberUserLean | undefined
): PlatformAgencyOwner {
  return {
    accountId: String(membership.userId),
    email: String(user?.email ?? ''),
    ...(user?.name ? { name: String(user.name) } : {}),
    status: user?.status ?? 'disabled',
    joinedAt: isoRequired(membership.joinedAt),
    ...(user?.lastLoginAt ? { lastLoginAt: iso(user.lastLoginAt) } : {}),
    mustChangePassword: user?.mustChangePassword === true,
  };
}

function projectMember(
  membership: MembershipLean,
  user: MemberUserLean | undefined
): PlatformAgencyMemberRow {
  return {
    userId: String(membership.userId),
    email: String(user?.email ?? ''),
    ...(user?.name ? { name: String(user.name) } : {}),
    role: membership.role,
    status: user?.status ?? 'disabled',
    joinedAt: isoRequired(membership.joinedAt),
    ...(user?.lastLoginAt ? { lastLoginAt: iso(user.lastLoginAt) } : {}),
    mustChangePassword: user?.mustChangePassword === true,
  };
}

/** Owner rows first, then the remaining roles by joined date. */
function sortMembers(
  memberships: MembershipLean[]
): MembershipLean[] {
  return [...memberships].sort((a, b) => {
    const rank = AGENCY_ROLE_RANK[b.role] - AGENCY_ROLE_RANK[a.role];
    if (rank !== 0) return rank;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
}

async function projectAgencyRows(
  agencies: AgencyLean[]
): Promise<PlatformAgencyRow[]> {
  if (agencies.length === 0) return [];
  const ids = agencies.map((agency) => agency._id);

  const memberships = (await AgencyMember.find({ agencyId: { $in: ids } })
    .select('agencyId userId role joinedAt')
    .lean()) as unknown as MembershipLean[];

  const memberUserIds = [...new Set(memberships.map((membership) => membership.userId))];
  const memberUsers = memberUserIds.length
    ? ((await User.find({ _id: { $in: memberUserIds } })
        .select('email name status lastLoginAt mustChangePassword')
        .lean()) as unknown as MemberUserLean[])
    : [];
  const memberById = new Map(
    memberUsers.map((user) => [String(user._id), user])
  );

  const tripActivity = new Map(
    (
      (await Trip.aggregate<{ _id: mongoose.Types.ObjectId; last: Date }>([
        {
          $match: {
            agencyId: { $in: ids },
            workspace: 'agency',
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: '$agencyId', last: { $max: '$updatedAt' } } },
      ])) as Array<{ _id: mongoose.Types.ObjectId; last: Date }>
    ).map((entry) => [String(entry._id), entry.last])
  );

  const byAgency = new Map<
    string,
    { memberships: MembershipLean[]; owners: MembershipLean[] }
  >();
  for (const agency of agencies) {
    byAgency.set(String(agency._id), { memberships: [], owners: [] });
  }
  for (const membership of memberships) {
    const bucket = byAgency.get(String(membership.agencyId));
    if (!bucket) continue;
    bucket.memberships.push(membership);
    if (membership.role === 'owner') bucket.owners.push(membership);
  }

  return agencies.map((agency) => {
    const bucket = byAgency.get(String(agency._id)) ?? {
      memberships: [],
      owners: [],
    };
    const owner = sortMembers(bucket.owners)[0];
    const lastLogin = bucket.memberships.reduce<Date | undefined>((latest, membership) => {
      const value = memberById.get(String(membership.userId))?.lastLoginAt;
      if (!value) return latest;
      const at = new Date(value);
      return !latest || at > latest ? at : latest;
    }, undefined);
    const lastActivity = [agency.updatedAt, agency.createdAt, lastLogin, tripActivity.get(String(agency._id))]
      .filter((value): value is Date => Boolean(value))
      .reduce<Date | undefined>((latest, value) => (!latest || value > latest ? value : latest), undefined);
    const row: PlatformAgencyRow = {
      _id: String(agency._id),
      name: String(agency.name),
      slug: String(agency.slug),
      status: agency.status,
      plan: planLimitsFor(agency),
      memberCount: bucket.memberships.length,
      ownerCount: bucket.owners.length,
      provisionedAt: isoRequired(agency.provisionedAt ?? agency.createdAt),
      createdAt: isoRequired(agency.createdAt),
      updatedAt: isoRequired(agency.updatedAt),
      lastActivityAt: isoRequired(lastActivity),
    };
    const billing = projectBilling(agency.billing);
    if (billing) row.billing = billing;
    if (owner) {
      const ownerRow = projectOwner(
        owner,
        memberById.get(String(owner.userId))
      );
      if (ownerRow.email) row.owner = ownerRow;
    }
    return row;
  });
}

function buildAgencyFilter(query: AgencyListQuery): FilterQuery<IAgency> {
  const clauses: FilterQuery<IAgency>[] = [];

  if (query.status !== 'all') clauses.push({ status: query.status });

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    clauses.push({
      $or: [
        { name: pattern },
        { slug: pattern },
        { 'billing.contactName': pattern },
        { 'billing.contactEmail': pattern },
      ],
    });
  }

  if (query.planTierId !== 'all') {
    if (!env.AGENCY_PLAN_TIERS[query.planTierId]) {
      throw new AppError('Choose a valid plan filter.', 400);
    }
    clauses.push({
      $or: [
        { 'plan.tierId': query.planTierId },
        ...(query.planTierId === env.AGENCY_PLAN_DEFAULT
          ? [{ plan: { $exists: false } }, { plan: null }]
          : []),
      ],
    });
  }

  return clauses.length === 0 ? {} : { $and: clauses };
}

/**
 * Directory-state filter. Profile rows own publication, so the console resolves
 * the requested state to agency ids once and then reuses the existing filters.
 * An empty id set is kept as `$in: []` so "no matches" is explicit.
 */
async function profileFilterClause(
  profile: AgencyListQuery['profile']
): Promise<FilterQuery<IAgency> | null> {
  if (profile === 'all') return null;
  const rows = (await AgencyProfile.find(
    profile === 'published'
      ? publicProfileFilter()
      : { 'moderation.hiddenAt': { $ne: null } }
  )
    .select('agencyId')
    .lean()) as Array<{ agencyId: mongoose.Types.ObjectId }>;
  return { _id: { $in: rows.map((row) => row.agencyId) } };
}

function appendClause(
  filter: FilterQuery<IAgency>,
  clause: FilterQuery<IAgency>
): FilterQuery<IAgency> {
  const existing = filter.$and as FilterQuery<IAgency>[] | undefined;
  if (existing) return { $and: [...existing, clause] };
  if (Object.keys(filter).length === 0) return clause;
  return { $and: [filter, clause] };
}

/** Directory list. Usage totals are computed on the detail view. */
export async function listAgencies(
  query: AgencyListQuery
): Promise<PlatformAgencyListResult> {
  const profileClause = await profileFilterClause(query.profile);
  const baseQuery = buildAgencyFilter(query);
  const filter = profileClause
    ? appendClause(baseQuery, profileClause)
    : baseQuery;

  const allClauses =
    (filter.$and as FilterQuery<IAgency>[] | undefined) ??
    (Object.keys(filter).length > 0 ? [filter] : []);
  const baseClauses = allClauses.filter((clause) => !('status' in clause));
  const baseFilter: FilterQuery<IAgency> =
    baseClauses.length > 0 ? { $and: baseClauses } : {};

  const [agencies, total, statusRows] = await Promise.all([
    Agency.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select('name slug status plan billing provisionedAt createdAt updatedAt')
      .lean() as unknown as Promise<AgencyLean[]>,
    Agency.countDocuments(filter),
    Agency.aggregate<{ _id: AgencyStatus; count: number }>([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = { all: 0, active: 0, suspended: 0 };
  for (const entry of statusRows) {
    counts[entry._id] = entry.count;
    counts.all += entry.count;
  }

  return {
    agencies: await projectAgencyRows(agencies),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    counts,
  };
}

async function projectAuditRows(rows: AuditLean[]): Promise<PlatformAuditEntry[]> {
  const actorIds = [...new Set(rows.map((row) => String(row.actorId)))];
  const actors = actorIds.length
    ? ((await User.find({ _id: { $in: actorIds } })
        .select('email')
        .lean()) as unknown as Array<{
        _id: mongoose.Types.ObjectId;
        email: string;
      }>)
    : [];
  const emails = new Map(
    actors.map((actor) => [String(actor._id), String(actor.email)])
  );

  return rows.map((row) => {
    const entry: PlatformAuditEntry = {
      _id: String(row._id),
      action: String(row.action),
      targetType: String(row.targetType),
      actorId: String(row.actorId),
      createdAt: isoRequired(row.createdAt),
    };
    if (row.targetId) entry.targetId = String(row.targetId);
    const email = emails.get(String(row.actorId));
    if (email) entry.actorEmail = email;
    if (row.metadata) entry.metadata = row.metadata;
    if (row.ip) entry.ip = String(row.ip);
    return entry;
  });
}

/** Full tenant detail: plan, live usage, billing, owners/members and audit. */
export async function getAgencyDetail(id: string): Promise<PlatformAgencyDetail> {
  const agency = await loadAgency(id);
  const { memberships, users } = await loadMemberRows(id);

  const now = new Date();
  const [usage, pendingInvites, auditRows, directory] = await Promise.all([
    agencyUsage(id),
    AgencyInvite.countDocuments({
      agencyId: id,
      revokedAt: null,
      expiresAt: { $gt: now },
      $expr: { $lt: [{ $size: '$acceptedBy' }, '$maxUses'] },
    }),
    PlatformAudit.find({
      $or: [
        { targetType: 'agency', targetId: id },
        { 'metadata.agencyId': id },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(12)
      .select('actorId action targetType targetId metadata ip createdAt')
      .lean() as unknown as Promise<AuditLean[]>,
    loadDirectoryAdminView(id),
  ]);

  const ordered = sortMembers(memberships);
  const members = ordered.map((membership) =>
    projectMember(membership, users.get(String(membership.userId)))
  );
  const owners = ordered
    .filter((membership) => membership.role === 'owner')
    .map((membership) => projectOwner(membership, users.get(String(membership.userId))));

  const row = (await projectAgencyRows([agency]))[0];
  const planOverrides = {
    ...(agency.plan?.seats !== undefined ? { seats: agency.plan.seats } : {}),
    ...(agency.plan?.monthlyExports !== undefined
      ? { monthlyExports: agency.plan.monthlyExports }
      : {}),
    ...(agency.plan?.storageMb !== undefined
      ? { storageMb: agency.plan.storageMb }
      : {}),
  };
  return {
    ...row,
    usage,
    ...(Object.keys(planOverrides).length > 0 ? { planOverrides } : {}),
    owners,
    members,
    pendingInvites,
    recentAudit: await projectAuditRows(auditRows),
    directory,
  };
}

/* -------------------------------------------------------------------------- */
/*  Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

export async function setAgencyStatus(input: {
  actorId: string;
  agencyId: string;
  status: AgencyStatus;
  client?: ClientContext;
}): Promise<{ agency: PlatformAgencyDetail; changed: boolean }> {
  const agency = await loadAgency(input.agencyId);
  if (agency.status === input.status) {
    return { agency: await getAgencyDetail(input.agencyId), changed: false };
  }

  await Agency.updateOne(
    { _id: agency._id },
    { $set: { status: input.status } }
  );

  if (input.status === 'suspended') {
    // Every existing agency JWT dies immediately as well as on its next
    // request. Reactivation deliberately does not restore those tokens.
    await User.updateMany(
      { accountType: 'agency', agencyId: agency._id },
      { $inc: { tokenVersion: 1 } }
    );
  }

  const action = input.status === 'suspended' ? 'agency.suspended' : 'agency.reactivated';
  const metadata = {
    name: agency.name,
    workspace: agency.slug,
    previousStatus: agency.status,
    status: input.status,
  };

  await recordPlatformAudit({
    actorId: input.actorId,
    action,
    targetType: 'agency',
    targetId: String(agency._id),
    metadata,
    ...input.client,
  });
  await recordAgencyAudit({
    agencyId: String(agency._id),
    actorId: input.actorId,
    action,
    targetType: 'Agency',
    targetId: String(agency._id),
    metadata,
  });

  return { agency: await getAgencyDetail(input.agencyId), changed: true };
}

export async function changeAgencyPlanAsAdmin(input: {
  actorId: string;
  agencyId: string;
  plan: AgencyPlanChangeInput;
  client?: ClientContext;
}): Promise<{ agency: PlatformAgencyDetail; previous: AgencyPlanLimits }> {
  const result = await applyAgencyPlan({
    agencyId: input.agencyId,
    plan: input.plan as AgencyPlanChange,
    actorId: input.actorId,
    action: 'plan.changed',
    metadata: { ...input.plan },
  });

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'agency.plan_changed',
    targetType: 'agency',
    targetId: String(result.agency._id),
    metadata: {
      name: result.agency.name,
      workspace: result.agency.slug,
      previousTierId: result.previous.tierId,
      previousLimits: result.previous,
      limits: result.limits,
    },
    ...input.client,
  });

  return {
    agency: await getAgencyDetail(input.agencyId),
    previous: result.previous,
  };
}

/* -------------------------------------------------------------------------- */
/*  Access operations                                                          */
/* -------------------------------------------------------------------------- */

export async function inviteAgencyMember(input: {
  actorId: string;
  agencyId: string;
  invite: AgencyMemberInviteInput;
  linkOrigins?: LinkOriginHints;
  client?: ClientContext;
}): Promise<{
  invite: ReturnType<typeof projectAgencyInvite>;
  link: string;
  agency: PlatformAgencyDetail;
}> {
  const agency = await loadAgency(input.agencyId);
  const result = await createAgencyInvite({
    agencyId: input.agencyId,
    createdBy: input.actorId,
    role: input.invite.role,
    kind: input.invite.kind,
    email: input.invite.email,
    maxUses: input.invite.maxUses,
    ttlHours: input.invite.ttlHours,
    linkOrigins: input.linkOrigins,
  });

  const metadata = {
    name: agency.name,
    workspace: agency.slug,
    role: result.invite.role,
    kind: result.invite.kind,
    ...(result.invite.email ? { email: result.invite.email } : {}),
  };

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'agency.member_invited',
    targetType: 'agency',
    targetId: input.agencyId,
    metadata,
    ...input.client,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'member.invited',
    targetType: 'AgencyInvite',
    targetId: String(result.invite._id),
    metadata,
  });

  return {
    invite: projectAgencyInvite(result.invite),
    link: result.link,
    agency: await getAgencyDetail(input.agencyId),
  };
}

export async function changeAgencyMemberRoleAsAdmin(input: {
  actorId: string;
  agencyId: string;
  targetUserId: string;
  role: AgencyRole;
  client?: ClientContext;
}): Promise<PlatformAgencyDetail> {
  const agency = await loadAgency(input.agencyId);
  const target = await User.findOne({
    _id: input.targetUserId,
    accountType: 'agency',
    agencyId: input.agencyId,
  })
    .select('email')
    .lean();

  await changeMemberRoleService({
    agencyId: input.agencyId,
    actorId: input.actorId,
    // The platform operator is not a tenant member; owner rank lets the shared
    // pure rules evaluate the request without inventing a membership.
    actorRole: 'owner',
    targetUserId: input.targetUserId,
    nextRole: input.role,
  });

  const metadata = {
    name: agency.name,
    workspace: agency.slug,
    memberId: input.targetUserId,
    ...(target?.email ? { email: String(target.email) } : {}),
    role: input.role,
  };

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'agency.member_role_changed',
    targetType: 'agency',
    targetId: input.agencyId,
    metadata,
    ...input.client,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'member.role_changed',
    targetType: 'User',
    targetId: input.targetUserId,
    metadata,
  });

  return getAgencyDetail(input.agencyId);
}

export async function removeAgencyMemberAsAdmin(input: {
  actorId: string;
  agencyId: string;
  targetUserId: string;
  client?: ClientContext;
}): Promise<PlatformAgencyDetail> {
  const agency = await loadAgency(input.agencyId);
  const target = await User.findOne({
    _id: input.targetUserId,
    accountType: 'agency',
    agencyId: input.agencyId,
  })
    .select('email')
    .lean();

  await removeMemberService({
    agencyId: input.agencyId,
    actorId: input.actorId,
    actorRole: 'owner',
    targetUserId: input.targetUserId,
  });

  // The membership is gone, but bumping the token version makes the removed
  // member's next request fail immediately instead of only at the role guard.
  await User.updateOne(
    {
      _id: input.targetUserId,
      accountType: 'agency',
      agencyId: input.agencyId,
    },
    { $inc: { tokenVersion: 1 } }
  );

  const metadata = {
    name: agency.name,
    workspace: agency.slug,
    memberId: input.targetUserId,
    ...(target?.email ? { email: String(target.email) } : {}),
  };

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'agency.member_removed',
    targetType: 'agency',
    targetId: input.agencyId,
    metadata,
    ...input.client,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'member.removed',
    targetType: 'User',
    targetId: input.targetUserId,
    metadata,
  });

  return getAgencyDetail(input.agencyId);
}

export interface OwnerTransfer {
  fromUserId: string;
  toUserId: string;
}

/**
 * Pure owner-transfer rules. The source defaults to the earliest owner; the
 * target must be a different, existing, non-owner member. Promotion happens
 * before the source is demoted, so the tenant is never ownerless even for one
 * write.
 */
export function resolveOwnerTransfer(
  members: Array<{ userId: unknown; role?: unknown; joinedAt?: Date | string }>,
  toUserId: string,
  fromUserId?: string
): OwnerTransfer {
  const target = members.find(
    (member) => String(member.userId) === String(toUserId)
  );
  if (!target) {
    throw new AppError('That person is not part of this agency.', 404);
  }

  const source = fromUserId
    ? members.find((member) => String(member.userId) === String(fromUserId))
    : [...members]
        .filter((member) => member.role === 'owner')
        .sort(
          (a, b) =>
            new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime()
        )[0];

  if (!source) {
    throw new AppError('This workspace has no owner to transfer.', 409);
  }
  if (source.role !== 'owner') {
    throw new AppError('Choose a current owner as the transfer source.', 409);
  }
  if (String(source.userId) === String(target.userId)) {
    throw new AppError('Choose a different member as the new owner.', 400);
  }
  if (target.role === 'owner') {
    throw new AppError('That member is already an owner.', 409);
  }

  return {
    fromUserId: String(source.userId),
    toUserId: String(target.userId),
  };
}

export async function transferAgencyOwner(input: {
  actorId: string;
  agencyId: string;
  toUserId: string;
  fromUserId?: string;
  client?: ClientContext;
}): Promise<PlatformAgencyDetail> {
  const agency = await loadAgency(input.agencyId);
  const { memberships, users } = await loadMemberRows(input.agencyId);
  const transfer = resolveOwnerTransfer(
    memberships,
    input.toUserId,
    input.fromUserId
  );

  const targetMembership = memberships.find(
    (membership) => String(membership.userId) === transfer.toUserId
  );
  const previousRole = targetMembership?.role ?? 'viewer';

  await changeMemberRoleService({
    agencyId: input.agencyId,
    actorId: input.actorId,
    actorRole: 'owner',
    targetUserId: transfer.toUserId,
    nextRole: 'owner',
  });

  try {
    await changeMemberRoleService({
      agencyId: input.agencyId,
      actorId: input.actorId,
      actorRole: 'owner',
      targetUserId: transfer.fromUserId,
      nextRole: 'admin',
    });
  } catch (error) {
    // Compensating rollback: the target was only promoted by this call, so a
    // failed demotion must not leave an unintended extra owner.
    await AgencyMember.updateOne(
      { agencyId: input.agencyId, userId: transfer.toUserId },
      { $set: { role: previousRole } }
    ).catch(() => undefined);
    throw error;
  }

  const fromEmail = users.get(transfer.fromUserId)?.email;
  const toEmail = users.get(transfer.toUserId)?.email;
  const metadata = {
    name: agency.name,
    workspace: agency.slug,
    fromUserId: transfer.fromUserId,
    toUserId: transfer.toUserId,
    ...(fromEmail ? { fromEmail: String(fromEmail) } : {}),
    ...(toEmail ? { toEmail: String(toEmail) } : {}),
  };

  await recordPlatformAudit({
    actorId: input.actorId,
    action: 'agency.owner_transferred',
    targetType: 'agency',
    targetId: input.agencyId,
    metadata,
    ...input.client,
  });
  await recordAgencyAudit({
    agencyId: input.agencyId,
    actorId: input.actorId,
    action: 'agency.owner_transferred',
    targetType: 'User',
    targetId: transfer.toUserId,
    metadata,
  });

  return getAgencyDetail(input.agencyId);
}

export async function resetAgencyMemberPassword(input: {
  actorId: string;
  agencyId: string;
  userId: string;
  client?: ClientContext;
}): Promise<{
  temporaryPassword: string;
  email: string;
  workspace?: string;
  agencyName?: string;
}> {
  assertAgencyId(input.agencyId);
  if (!mongoose.isValidObjectId(input.userId)) {
    throw new AppError('Agency member not found.', 404);
  }

  const account = await User.findOne({
    _id: input.userId,
    accountType: 'agency',
    agencyId: input.agencyId,
  })
    .select('_id')
    .lean();
  if (!account) throw new AppError('Agency member not found.', 404);

  // Reuses the PA2 reset path (hash, tokenVersion bump, platform audit and the
  // tenant-visible audit row). The personal account for the same email is a
  // different row and is never touched.
  return resetAgencyPassword({
    actorId: input.actorId,
    accountId: input.userId,
    client: input.client,
  });
}

/* -------------------------------------------------------------------------- */
/*  Audit console                                                              */
/* -------------------------------------------------------------------------- */

function auditDateBoundary(value: string, endOfDay: boolean): Date {
  const date = new Date(value);
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

export function buildPlatformAuditFilter(
  query: PlatformAuditQuery
): FilterQuery<IPlatformAudit> {
  const filter: FilterQuery<IPlatformAudit> = {};

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [
      { action: pattern },
      { targetType: pattern },
      { targetId: pattern },
    ];
  }
  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.targetId) filter.targetId = query.targetId;
  if (query.actorId) filter.actorId = query.actorId;

  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) createdAt.$gte = auditDateBoundary(query.from, false);
    if (query.to) createdAt.$lte = auditDateBoundary(query.to, true);
    filter.createdAt = createdAt;
  }

  return filter;
}

/** Platform audit viewer. Tenant audit rows are deliberately not exposed here. */
export async function listPlatformAudit(
  query: PlatformAuditQuery
): Promise<PlatformAuditListResult> {
  const filter = buildPlatformAuditFilter(query);

  const [rows, total, actions, targetTypes] = await Promise.all([
    PlatformAudit.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select('actorId action targetType targetId metadata ip createdAt')
      .lean() as unknown as Promise<AuditLean[]>,
    PlatformAudit.countDocuments(filter),
    PlatformAudit.distinct('action'),
    PlatformAudit.distinct('targetType'),
  ]);

  return {
    entries: await projectAuditRows(rows),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    facets: {
      actions: (actions as unknown[])
        .map((value) => String(value))
        .sort()
        .slice(0, 200),
      targetTypes: (targetTypes as unknown[])
        .map((value) => String(value))
        .sort()
        .slice(0, 200),
    },
  };
}

/** The audit console may also filter one tenant's platform history. */
export async function countAgencyPlatformAudit(agencyId: string): Promise<number> {
  assertAgencyId(agencyId);
  return PlatformAudit.countDocuments({
    $or: [
      { targetType: 'agency', targetId: agencyId },
      { 'metadata.agencyId': agencyId },
    ],
  });
}
