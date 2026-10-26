import type { User } from './auth';

/**
 * Platform realm types (PA1/PA2). A platform account is never a personal or
 * agency account with extra fields: the realm and role are part of the session
 * contract and drive the `/admin` gate.
 */
export interface PlatformSessionUser extends User {
  accountType: 'platform';
  platformRole: 'super_admin';
  mustChangePassword: boolean;
}

export interface PlatformAuthSession {
  success: boolean;
  user: PlatformSessionUser;
}

export interface PlatformHealth {
  enabled?: boolean;
  milestone?: string;
}

/* -------------------------------------------------------------------------- */
/*  Account directory (PA2)                                                    */
/* -------------------------------------------------------------------------- */

export type PlatformAccountType = 'personal' | 'agency' | 'platform';
export type PlatformAccountStatus = 'active' | 'disabled';
export type PlatformRealmFilter = 'all' | PlatformAccountType;
export type PlatformStatusFilter = 'all' | PlatformAccountStatus;

export interface PlatformAgencyLabel {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
}

/** One directory row. The same email can appear once per realm/tenant. */
export interface PlatformAccountRow {
  _id: string;
  email: string;
  name?: string;
  accountType: PlatformAccountType;
  status: PlatformAccountStatus;
  platformRole?: 'super_admin';
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt?: string;
  agency?: PlatformAgencyLabel;
}

export interface PlatformMembershipRow {
  agency: PlatformAgencyLabel;
  role: string;
  joinedAt: string;
}

/** Platform audit event; never contains tenant content or credentials. */
export interface PlatformAuditRow {
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

export interface PlatformAccountDetail extends PlatformAccountRow {
  passwordChangedAt?: string;
  memberships: PlatformMembershipRow[];
  relatedAccounts: PlatformAccountRow[];
  recentAudit: PlatformAuditRow[];
}

export interface PlatformAccountCounts {
  all: number;
  personal: number;
  agency: number;
  platform: number;
}

export interface PlatformAccountList {
  success: boolean;
  accounts: PlatformAccountRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: PlatformAccountCounts;
}

export interface PlatformAdminList extends PlatformAccountList {
  activeTotal: number;
}

export interface PlatformOverview {
  success: boolean;
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
  recentAudit: PlatformAuditRow[];
}

export interface PlatformAccountQuery {
  q?: string;
  realm?: PlatformRealmFilter;
  status?: PlatformStatusFilter;
  page?: number;
  limit?: number;
}

/* -------------------------------------------------------------------------- */
/*  Agency provisioning (PA3)                                                  */
/* -------------------------------------------------------------------------- */

export interface PlatformPlanTier {
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
  isDefault: boolean;
}

export interface PlatformOwnerAgencyLabel {
  name: string;
  workspace: string;
}

/** Pre-submit owner lookup. Blocked means this email cannot own a new tenant. */
export interface PlatformOwnerPreview {
  email: string;
  personalAccount: boolean;
  platformAccount: boolean;
  otherAgency?: PlatformOwnerAgencyLabel;
  blocked: boolean;
  blockedReason?: string;
  warnings: string[];
}

export interface PlatformProvisionedAgency {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: {
    tierId: string;
    seats: number;
    monthlyExports: number;
    storageMb: number;
  };
  billing?: {
    contactName?: string;
    contactEmail?: string;
    renewalDate?: string;
    notes?: string;
  };
  provisionedAt: string;
}

export interface PlatformProvisionedOwner {
  accountId: string;
  email: string;
  name?: string;
  /** False when an existing agency account for this tenant was attached. */
  created: boolean;
  mustChangePassword: boolean;
  workspace: string;
}

export interface PlatformProvisionResult {
  success: boolean;
  message: string;
  agency: PlatformProvisionedAgency;
  owner: PlatformProvisionedOwner;
  /** Present only when this call created the owner account. Shown once. */
  temporaryPassword?: string;
  warnings: string[];
}

export interface PlatformAgencyInput {
  name: string;
  slug?: string;
  planTierId?: string;
  ownerEmail: string;
  ownerName?: string;
  billing?: {
    contactName?: string;
    contactEmail?: string;
    renewalDate?: string;
    notes?: string;
  };
}

/* -------------------------------------------------------------------------- */
/*  Agency lifecycle, access operations and audit (PA4)                        */
/* -------------------------------------------------------------------------- */

export type PlatformAgencyStatus = 'active' | 'suspended';
export type PlatformAgencyStatusFilter = 'all' | PlatformAgencyStatus;
export type PlatformAgencyRole = 'owner' | 'admin' | 'planner' | 'viewer';

export interface PlatformAgencyPlanLimits {
  tierId: string;
  seats: number;
  monthlyExports: number;
  storageMb: number;
}

export interface PlatformAgencyUsage {
  seats: number;
  exportsThisMonth: number;
  storageBytes: number;
}

export interface PlatformAgencyBilling {
  contactName?: string;
  contactEmail?: string;
  renewalDate?: string;
  notes?: string;
}

export interface PlatformAgencyOwner {
  accountId: string;
  email: string;
  name?: string;
  status: PlatformAccountStatus;
  joinedAt: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
}

export interface PlatformAgencyMember {
  userId: string;
  email: string;
  name?: string;
  role: PlatformAgencyRole;
  status: PlatformAccountStatus;
  joinedAt: string;
  lastLoginAt?: string;
  mustChangePassword: boolean;
}

export interface PlatformAgencyRow {
  _id: string;
  name: string;
  slug: string;
  status: PlatformAgencyStatus;
  plan: PlatformAgencyPlanLimits;
  billing?: PlatformAgencyBilling;
  memberCount: number;
  ownerCount: number;
  owner?: PlatformAgencyOwner;
  provisionedAt: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface PlatformAgencyDetail extends PlatformAgencyRow {
  usage: PlatformAgencyUsage;
  /** Raw overrides only; omitted fields inherit the tier. */
  planOverrides?: {
    seats?: number;
    monthlyExports?: number;
    storageMb?: number;
  };
  owners: PlatformAgencyOwner[];
  members: PlatformAgencyMember[];
  pendingInvites: number;
  recentAudit: PlatformAuditRow[];
}

export interface PlatformAgencyList {
  success: boolean;
  agencies: PlatformAgencyRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { all: number; active: number; suspended: number };
}

export interface PlatformAgencyQuery {
  q?: string;
  status?: PlatformAgencyStatusFilter;
  planTierId?: string;
  page?: number;
  limit?: number;
}

export interface PlatformAgencyMemberInviteInput {
  role: Exclude<PlatformAgencyRole, 'owner'>;
  kind: 'link' | 'email';
  email?: string;
  maxUses?: number;
  ttlHours?: number;
}

export interface PlatformAgencyInviteResult {
  success: boolean;
  message: string;
  invite: {
    _id: string;
    role: Exclude<PlatformAgencyRole, 'owner'>;
    kind: 'link' | 'email';
    email: string | null;
    expiresAt: string;
    maxUses: number;
  };
  link: string;
  agency: PlatformAgencyDetail;
}

export interface PlatformAuditList {
  success: boolean;
  entries: PlatformAuditRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  facets: { actions: string[]; targetTypes: string[] };
}

export interface PlatformAuditQuery {
  q?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
