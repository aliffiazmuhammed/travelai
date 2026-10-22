/** Agency Workspace A1 client types. */

export type AgencyRole = 'owner' | 'admin' | 'planner' | 'viewer';
export type AgencyInvitableRole = Exclude<AgencyRole, 'owner'>;

export interface AgencyBranding {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  address?: string;
}

export interface Agency {
  _id: string;
  name: string;
  branding: AgencyBranding;
  /** The caller's role in this agency. */
  role: AgencyRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyMember {
  userId: string;
  role: AgencyRole;
  joinedAt: string;
  label: string;
  avatarUrl?: string;
  /** Only present for admins/owners, or on the caller's own row. */
  email?: string;
  isYou?: boolean;
}

export interface AgencyInvite {
  _id: string;
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  email: string | null;
  tokenHint: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revokedAt: string | null;
  createdAt: string;
}

export interface AgencyInvitePreview {
  agency: { _id: string; name: string };
  role: AgencyInvitableRole;
  kind: 'link' | 'email';
  invitedBy?: string;
  expiresAt: string;
  emailBoundTo?: string;
}

export interface AgencyHealth {
  enabled?: boolean;
  milestone?: string;
  writesEnabled?: boolean;
}
