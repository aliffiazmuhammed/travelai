import { Types } from 'mongoose';
import AgencyClient, { IAgencyClient } from '../../models/AgencyClient.js';
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';

/**
 * Agency client directory (A4).
 *
 * Every lookup is scoped by `agencyId`; an id from another tenant answers 404
 * exactly like a missing one. Directory records are address-book data only —
 * they never grant trip access.
 */

export interface AgencyClientSummary {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  /**
   * The directory enquiry this client came from, when there is one. The quote
   * panel uses it to tell a traveller account (in-app proposal) from an ad-hoc
   * client (PDF share only).
   */
  sourceEnquiryId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function projectAgencyClient(client: IAgencyClient | any): AgencyClientSummary {
  return {
    _id: String(client._id),
    name: String(client.name ?? ''),
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    company: client.company ?? undefined,
    notes: client.notes ?? undefined,
    sourceEnquiryId: client.sourceEnquiryId
      ? String(client.sourceEnquiryId)
      : null,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export async function listAgencyClients(
  agencyId: string,
  search?: string
): Promise<AgencyClientSummary[]> {
  const query: Record<string, unknown> = { agencyId };
  const term = String(search ?? '').trim().slice(0, 80);
  if (term) {
    const regex = new RegExp(escapeRegex(term), 'i');
    query.$or = [{ name: regex }, { company: regex }, { email: regex }];
  }

  const clients = await AgencyClient.find(query)
    .sort({ name: 1, updatedAt: -1 })
    .limit(200)
    .lean();

  return clients.map(projectAgencyClient);
}

function normalizeName(value: unknown): string {
  const name = String(value ?? '').trim();
  if (!name) {
    throw new AppError("Enter the client's name.", 400);
  }
  if (name.length > 120) {
    throw new AppError('Client names must be 120 characters or fewer.', 400);
  }
  return name;
}

/**
 * Empty string and `null` both clear an optional field. Undefined means "leave
 * this field alone", which is what makes PATCH partial.
 */
function normalizeOptional(
  value: unknown,
  label: string,
  max: number,
  lowerCase = false
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value !== 'string') {
    throw new AppError(`Enter a valid ${label}.`, 400);
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) {
    throw new AppError(`Keep the ${label} under ${max} characters.`, 400);
  }
  return lowerCase ? normalized.toLowerCase() : normalized;
}

function normalizeEmail(value: unknown): string | undefined {
  const email = normalizeOptional(value, 'email address', 160, true);
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError('Enter a valid client email address.', 400);
  }
  return email;
}

export interface CreateAgencyClientInput {
  agencyId: string;
  createdBy: string;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  notes?: unknown;
}

export async function createAgencyClient(
  input: CreateAgencyClientInput
): Promise<AgencyClientSummary> {
  const email = normalizeEmail(input.email);
  const phone = normalizeOptional(input.phone, 'phone number', 40);
  const company = normalizeOptional(input.company, 'company', 120);
  const notes = normalizeOptional(input.notes, 'note', 1000);

  const client = await AgencyClient.create({
    agencyId: input.agencyId,
    createdBy: input.createdBy,
    name: normalizeName(input.name),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(company ? { company } : {}),
    ...(notes ? { notes } : {}),
  });
  return projectAgencyClient(client);
}

export interface UpdateAgencyClientInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  notes?: unknown;
}

/** Builds the allow-listed update; empty values unset the optional fields. */
export function buildAgencyClientUpdate(input: UpdateAgencyClientInput): {
  $set: Record<string, unknown>;
  $unset: Record<string, 1>;
} {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  if (input.name !== undefined) {
    $set.name = normalizeName(input.name);
  }
  for (const key of ['email', 'phone', 'company', 'notes'] as const) {
    if (input[key] === undefined) continue;
    const normalized =
      key === 'email'
        ? normalizeEmail(input[key])
        : normalizeOptional(
            input[key],
            key === 'phone' ? 'phone number' : key,
            key === 'notes' ? 1000 : key === 'company' ? 120 : 40
          );
    if (normalized) $set[key] = normalized;
    else $unset[key] = 1;
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    throw new AppError('Provide a client change.', 400);
  }

  return { $set, $unset };
}

export async function updateAgencyClient(
  agencyId: string,
  clientId: string,
  input: UpdateAgencyClientInput
): Promise<AgencyClientSummary> {
  if (!Types.ObjectId.isValid(clientId)) {
    throw new AppError('Client not found', 404);
  }
  const { $set, $unset } = buildAgencyClientUpdate(input);
  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const client = await AgencyClient.findOneAndUpdate(
    { _id: clientId, agencyId },
    update,
    { new: true, runValidators: true }
  );
  if (!client) {
    throw new AppError('Client not found', 404);
  }
  return projectAgencyClient(client);
}

/**
 * Removes a directory record and unlinks it from this tenant's trips. Quote
 * snapshots are intentionally untouched: sent commercial documents are
 * append-only and keep the client details they were issued with.
 */
export async function deleteAgencyClient(
  agencyId: string,
  clientId: string
): Promise<AgencyClientSummary> {
  if (!Types.ObjectId.isValid(clientId)) {
    throw new AppError('Client not found', 404);
  }
  const client = await AgencyClient.findOneAndDelete({ _id: clientId, agencyId });
  if (!client) {
    throw new AppError('Client not found', 404);
  }

  await Trip.updateMany(
    { agencyId, workspace: 'agency', clientId: client._id },
    { $unset: { clientId: 1 } }
  );

  return projectAgencyClient(client);
}

/** Tenant-scoped client reference check used by trips and quotes. */
export async function assertAgencyClient(
  agencyId: string,
  clientId: string
): Promise<void> {
  if (!Types.ObjectId.isValid(clientId)) {
    throw new AppError('Choose a valid client.', 400);
  }
  const exists = await AgencyClient.exists({ _id: clientId, agencyId });
  if (!exists) {
    throw new AppError('That client is not in this agency directory.', 404);
  }
}
