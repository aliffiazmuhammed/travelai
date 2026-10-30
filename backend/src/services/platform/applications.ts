import mongoose, { type FilterQuery } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyApplication, {
  type AgencyApplicationStatus,
  type IAgencyApplication,
} from '../../models/AgencyApplication.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import type {
  AgencyApplicationListQuery,
  RejectAgencyApplicationInput,
  SubmitAgencyApplicationInput,
} from '../../schemas/agencyApplications.schema.js';
import { recordPlatformAudit } from './audit.js';
import {
  provisionAgency,
  type ProvisionAgencyInput,
  type ProvisionAgencyResult,
} from './provisioning.js';

/**
 * Public agency applications and their review (PA6).
 *
 * An application is a row of intent, nothing more: submitting it creates no
 * account and no tenant. Approval is deliberately *not* a second provisioning
 * implementation — it calls `provisionAgency`, the same primitive the console
 * uses for a hand-onboarded agency, so a self-applied agency is indistinguishable
 * from any other tenant afterwards (owner account, membership, plan, audits).
 *
 * There is no mailer in this codebase, so the one-time password is returned to
 * the approving admin and shown once. The applicant learns nothing from the
 * server; the admin contacts them with the detail they supplied.
 */

export const AGENCY_APPLICATION_LABEL: Record<AgencyApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface AgencyApplicationReceipt {
  submitted: true;
}

export interface PlatformAgencyApplicationRow {
  _id: string;
  name: string;
  phone: string;
  email: string;
  note?: string;
  status: AgencyApplicationStatus;
  submittedAt: string;
  decidedAt?: string;
  decisionNote?: string;
  /** Present after approval — the workspace this application became. */
  agencyId?: string;
  agencySlug?: string;
}

export interface PlatformAgencyApplicationListResult {
  applications: PlatformAgencyApplicationRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  counts: { all: number; pending: number; approved: number; rejected: number };
}

export interface ApproveAgencyApplicationResult {
  application: PlatformAgencyApplicationRow;
  provision: ProvisionAgencyResult;
}

interface ApplicationLean {
  _id: mongoose.Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  note?: string;
  status: AgencyApplicationStatus;
  decidedAt?: Date | null;
  decisionNote?: string;
  agencyId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 7–15 digits once formatting is removed; stored exactly as the visitor typed. */
export function normalizeApplicationPhone(value: unknown): string {
  const phone = text(value);
  if (!phone) throw new AppError('Enter a phone number we can reach you on.', 400);
  if (!/^\+?[\d\s().-]+$/.test(phone)) {
    throw new AppError(
      'Use digits, spaces, dashes, brackets and an optional leading + for the phone number.',
      400
    );
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    throw new AppError('Enter a phone number with 7 to 15 digits.', 400);
  }
  return phone;
}

export function normalizeApplicationName(value: unknown): string {
  const name = text(value).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) {
    throw new AppError('Agency name must be 2 to 80 characters.', 400);
  }
  return name;
}

export function normalizeApplicationEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  if (!email) throw new AppError('Enter an email address we can reply to.', 400);
  if (email.length > 160) {
    throw new AppError('Keep the email under 160 characters.', 400);
  }
  return email;
}

export function normalizeApplicationNote(value: unknown, limit = 600): string {
  return text(value).slice(0, limit);
}

/**
 * Anonymous submit. The honeypot short-circuits to the same receipt a human
 * sees, so a bot learns nothing from the response.
 */
export async function submitAgencyApplication(
  input: SubmitAgencyApplicationInput
): Promise<AgencyApplicationReceipt> {
  if (text(input.website)) return { submitted: true };

  const name = normalizeApplicationName(input.name);
  const phone = normalizeApplicationPhone(input.phone);
  const email = normalizeApplicationEmail(input.email);
  const note = normalizeApplicationNote(input.note);

  // One agency account per email across every tenant (PA0). Applying with an
  // email that already owns a workspace can never be approved, so say so now.
  if (await User.exists({ email, accountType: 'agency' })) {
    throw new AppError(
      'This email already has an agency workspace. Sign in instead, or apply with a different email if this is a new agency.',
      409
    );
  }

  try {
    await AgencyApplication.create({ name, phone, email, note, status: 'pending' });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError(
        'An application for this email is already being reviewed. We will be in touch.',
        409
      );
    }
    throw error;
  }

  return { submitted: true };
}

/* -------------------------------------------------------------------------- */
/*  Admin review                                                              */
/* -------------------------------------------------------------------------- */

function assertApplicationId(id: unknown): string {
  const value = String(id ?? '').trim();
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError('Application not found.', 404);
  }
  return value;
}

function buildApplicationFilter(
  query: AgencyApplicationListQuery
): FilterQuery<IAgencyApplication> {
  const filter: FilterQuery<IAgencyApplication> = {};
  if (query.status !== 'all') filter.status = query.status;
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }
  return filter;
}

async function agencySlugMap(
  rows: ApplicationLean[]
): Promise<Map<string, { slug: string }>> {
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
    .select('slug')
    .lean()) as unknown as Array<{ _id: mongoose.Types.ObjectId; slug: string }>;
  return new Map(
    agencies.map((agency) => [String(agency._id), { slug: String(agency.slug) }])
  );
}

function projectApplication(
  row: ApplicationLean,
  agencySlug?: string
): PlatformAgencyApplicationRow {
  return {
    _id: String(row._id),
    name: String(row.name),
    phone: String(row.phone),
    email: String(row.email),
    ...(row.note ? { note: String(row.note) } : {}),
    status: row.status,
    submittedAt: (row.createdAt ?? new Date()).toISOString(),
    ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}),
    ...(row.decisionNote ? { decisionNote: String(row.decisionNote) } : {}),
    ...(row.agencyId ? { agencyId: String(row.agencyId) } : {}),
    ...(agencySlug ? { agencySlug } : {}),
  };
}

export async function listAgencyApplications(
  query: AgencyApplicationListQuery
): Promise<PlatformAgencyApplicationListResult> {
  const filter = buildApplicationFilter(query);

  const [rows, total, statusRows] = await Promise.all([
    AgencyApplication.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .select('name phone email note status decidedAt decisionNote agencyId createdAt')
      .lean() as unknown as Promise<ApplicationLean[]>,
    AgencyApplication.countDocuments(filter),
    AgencyApplication.aggregate<{ _id: AgencyApplicationStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const counts = { all: 0, pending: 0, approved: 0, rejected: 0 };
  for (const entry of statusRows) {
    if (entry._id in counts) counts[entry._id] = entry.count;
    counts.all += entry.count;
  }

  const slugs = await agencySlugMap(rows);

  return {
    applications: rows.map((row) =>
      projectApplication(
        row,
        row.agencyId ? slugs.get(String(row.agencyId))?.slug : undefined
      )
    ),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    counts,
  };
}

/**
 * Approve = provision. The tenant write happens first because it is the part
 * that can fail loudly (email already owns a workspace, slug clash); the
 * application row is then marked decided. If that mark is lost to a concurrent
 * decision the workspace still exists, so we report success and warn instead of
 * asking the admin to retry a write that already happened.
 */
export async function approveAgencyApplication(
  id: unknown,
  actorId: string,
  client?: ProvisionAgencyInput['client']
): Promise<ApproveAgencyApplicationResult> {
  const applicationId = assertApplicationId(id);

  const application = (await AgencyApplication.findById(applicationId).lean()) as
    | ApplicationLean
    | null;
  if (!application) throw new AppError('That application no longer exists.', 404);
  if (application.status !== 'pending') {
    throw new AppError('This application has already been decided.', 409);
  }

  const provision = await provisionAgency({
    actorId,
    name: String(application.name),
    ownerEmail: String(application.email),
    client,
  });

  const decidedAt = new Date();
  const updated = (await AgencyApplication.findOneAndUpdate(
    { _id: applicationId, status: 'pending' },
    {
      $set: {
        status: 'approved',
        decidedBy: actorId,
        decidedAt,
        agencyId: provision.agency._id,
        ownerUserId: provision.owner.accountId,
      },
    },
    { new: true }
  ).lean()) as ApplicationLean | null;

  if (!updated) {
    console.warn(
      `Agency application ${applicationId} was decided while approving; workspace ${provision.agency.slug} was still created.`
    );
  }

  await recordPlatformAudit({
    actorId,
    action: 'agency.application_approved',
    targetType: 'agency_application',
    targetId: applicationId,
    metadata: {
      name: application.name,
      email: application.email,
      phone: application.phone,
      workspace: provision.agency.slug,
      agencyId: provision.agency._id,
    },
    ...client,
  });

  const decided = updated ?? application;

  return {
    application: projectApplication(
      {
        ...decided,
        status: 'approved',
        decidedAt: decided.decidedAt ?? decidedAt,
        agencyId: new mongoose.Types.ObjectId(provision.agency._id),
      },
      provision.agency.slug
    ),
    provision,
  };
}

export async function rejectAgencyApplication(
  id: unknown,
  actorId: string,
  input: RejectAgencyApplicationInput,
  client?: ProvisionAgencyInput['client']
): Promise<PlatformAgencyApplicationRow> {
  const applicationId = assertApplicationId(id);
  const decisionNote = normalizeApplicationNote(input.note, 500);

  const updated = (await AgencyApplication.findOneAndUpdate(
    { _id: applicationId, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        decidedBy: actorId,
        decidedAt: new Date(),
        decisionNote,
      },
    },
    { new: true }
  ).lean()) as ApplicationLean | null;

  if (!updated) {
    if (!(await AgencyApplication.exists({ _id: applicationId }))) {
      throw new AppError('That application no longer exists.', 404);
    }
    throw new AppError('This application has already been decided.', 409);
  }

  await recordPlatformAudit({
    actorId,
    action: 'agency.application_rejected',
    targetType: 'agency_application',
    targetId: applicationId,
    metadata: {
      name: updated.name,
      email: updated.email,
      ...(decisionNote ? { note: decisionNote } : {}),
    },
    ...client,
  });

  return projectApplication(updated);
}
