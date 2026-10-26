import bcrypt from 'bcryptjs';
import Agency, { type IAgency } from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import User, { type IUser } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { signSessionForAccount } from '../auth/realm.js';
import { publicUser } from '../user/profile.js';
import type { AgencyRole } from './access.js';

/**
 * Tenant-scoped agency authentication (PA0).
 *
 * Login is two-dimensional: the workspace slug resolves the tenant, then
 * `{ accountType: 'agency', agencyId, email }` resolves the account inside that
 * tenant. A wrong slug, suspended tenant, missing/disabled account and wrong
 * password all answer one generic credential error so workspaces and accounts
 * cannot be enumerated.
 */

const GENERIC_LOGIN_ERROR =
  'Incorrect workspace, email or password. Please check your details and try again.';
const WORKSPACE_NOT_FOUND = 'Workspace not found';

/** Slug normalization shared by login, context and links. */
export function normalizeWorkspaceSlug(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Tenant-uploaded logos live behind the authenticated content route, so they
 * cannot render on a public login page. External URLs are safe to publish.
 */
export function publicTenantLogo(logoUrl: unknown): string | undefined {
  const url = String(logoUrl ?? '').trim();
  if (!url) return undefined;
  if (url.startsWith('/api/agency/')) return undefined;
  return url;
}

export interface AgencyPublicTenant {
  _id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface AgencyLoginContext {
  agency: AgencyPublicTenant;
}

/** Public login-context lookup; unknown or suspended workspaces look identical. */
export async function getAgencyLoginContext(
  workspace: unknown
): Promise<AgencyLoginContext> {
  const slug = normalizeWorkspaceSlug(workspace);
  if (!slug) throw new AppError(WORKSPACE_NOT_FOUND, 404);

  const agency = await Agency.findOne({ slug, status: 'active' })
    .select('name slug branding')
    .lean();
  if (!agency) throw new AppError(WORKSPACE_NOT_FOUND, 404);

  return {
    agency: {
      _id: String(agency._id),
      name: String(agency.name ?? ''),
      slug: String(agency.slug ?? ''),
      logoUrl: publicTenantLogo((agency.branding as any)?.logoUrl),
    },
  };
}

export interface AgencySession {
  user: IUser;
  agency: IAgency;
  role: AgencyRole;
}

/** The one projection both signin and `/me` return. */
export function projectAgencySession(session: AgencySession) {
  const { user, agency, role } = session;
  return {
    user: {
      ...publicUser(user),
      accountType: 'agency' as const,
      mustChangePassword: user.mustChangePassword === true,
    },
    agency: {
      _id: String(agency._id),
      name: String(agency.name ?? ''),
      slug: String(agency.slug ?? ''),
      logoUrl: publicTenantLogo(agency.branding?.logoUrl),
      primaryColor: agency.branding?.primaryColor,
      status: agency.status,
      role,
    },
  };
}

export interface AgencySigninInput {
  workspace: unknown;
  email: unknown;
  password: unknown;
}

export interface AgencySigninResult extends AgencySession {
  token: string;
}

/**
 * Signs an agency account in to one tenant. The caller already resolved the
 * slug in the SPA, but the server re-resolves it: the credentials are only
 * valid for the tenant they name.
 */
export async function signinAgency(
  input: AgencySigninInput
): Promise<AgencySigninResult> {
  const slug = normalizeWorkspaceSlug(input.workspace);
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');

  const agency = slug
    ? await Agency.findOne({ slug, status: 'active' })
    : null;
  if (!agency) throw new AppError(GENERIC_LOGIN_ERROR, 401);

  const user = await User.findOne({
    accountType: 'agency',
    agencyId: agency._id,
    email,
  });
  if (!user || user.status !== 'active') {
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  const matches = await bcrypt.compare(password, user.password);
  if (!matches) throw new AppError(GENERIC_LOGIN_ERROR, 401);

  const membership = await AgencyMember.findOne({
    agencyId: agency._id,
    userId: user._id,
  })
    .select('role')
    .lean();
  if (!membership) {
    // The account exists but has no tenant role; never issue a session that
    // could only answer 403 everywhere.
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

  return {
    user,
    agency,
    role: membership.role as AgencyRole,
    token: signSessionForAccount(user, 'agency'),
  };
}

/**
 * Loads the agency account behind a verified `protectAgency` session.
 * A removed membership is a 403: the caller proved they own this account, so
 * there is no tenant id to conceal from them.
 */
export async function loadAgencySession(userId: string): Promise<AgencySession> {
  const user = await User.findOne({
    _id: userId,
    accountType: 'agency',
    status: 'active',
  });
  if (!user || !user.agencyId) {
    throw new AppError(
      'Your session has expired or is invalid. Please sign in again.',
      401
    );
  }

  const agency = await Agency.findById(user.agencyId);
  if (!agency || agency.status !== 'active') {
    throw new AppError(
      'Your session has expired or is invalid. Please sign in again.',
      401
    );
  }

  const membership = await AgencyMember.findOne({
    agencyId: agency._id,
    userId: user._id,
  })
    .select('role')
    .lean();
  if (!membership) {
    throw new AppError('Your access to this workspace has been removed.', 403);
  }

  return { user, agency, role: membership.role as AgencyRole };
}
