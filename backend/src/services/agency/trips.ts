import { Types } from 'mongoose';
import Agency from '../../models/Agency.js';
import AgencyMember from '../../models/AgencyMember.js';
import Trip from '../../models/Trip.js';
import { AppError } from '../../utils/AppError.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { sanitizeTripFor } from '../../utils/sanitizeTrip.js';
import {
  decideAgencyAccess,
  mapAgencyRoleToTripRole,
  type AgencyRole,
} from './access.js';
import { assertAgencyClient } from './clients.js';

/**
 * Agency trip library (Agency Workspace A2).
 *
 * Every query in this module is triple-scoped: `workspace: 'agency'`,
 * `agencyId` and (where relevant) `isDeleted`. That is the tenant boundary; a
 * trip id from another agency must answer 404 through the same code path as a
 * nonexistent id.
 */

export const AGENCY_TRIP_SUMMARY_SELECT = [
  'userId',
  'workspace',
  'agencyId',
  'assignedTo',
  'clientId',
  'title',
  'status',
  'version',
  'hasEdited',
  'rev',
  'startDate',
  'endDate',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'members',
  'tripDetails.trip_title',
  'tripDetails.duration_days',
  'tripDetails.budget_per_person',
  'tripDetails.group_type',
  'tripDetails.season',
].join(' ');

const AGENCY_TRASH_SELECT = [
  AGENCY_TRIP_SUMMARY_SELECT,
  'tripDetails.trip_title',
].join(' ');

export interface AgencyTripListInput {
  agencyId: string;
  role: AgencyRole;
  search?: string;
  status?: string;
}

function agencyRoleForTrip(role: AgencyRole) {
  const tripRole = mapAgencyRoleToTripRole(role);
  if (!tripRole) {
    throw new AppError('This agency role is not valid.', 403);
  }
  return tripRole;
}

/** Lists live agency trips visible to every member of the tenant. */
export async function listAgencyTrips(input: AgencyTripListInput) {
  const query: Record<string, any> = {
    workspace: 'agency',
    agencyId: input.agencyId,
    isDeleted: { $ne: true },
  };

  if (input.status && input.status !== 'all') {
    query.status = input.status;
  }
  if (input.search && input.search.trim()) {
    const searchRegex = new RegExp(escapeRegex(input.search.trim().slice(0, 80)), 'i');
    query.$or = [{ title: searchRegex }, { 'tripDetails.trip_title': searchRegex }];
  }

  const trips = await Trip.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(200)
    .select(AGENCY_TRIP_SUMMARY_SELECT);

  const role = agencyRoleForTrip(input.role);
  return trips.map((trip) => ({
    ...sanitizeTripFor(trip, role),
    role,
  }));
}

/** Owner/admin-only agency trash, newest deletion first. */
export async function listAgencyDeletedTrips(
  agencyId: string,
  role: AgencyRole
) {
  const trips = await Trip.find({
    workspace: 'agency',
    agencyId,
    isDeleted: true,
  })
    .sort({ deletedAt: -1, updatedAt: -1 })
    .limit(100)
    .select(AGENCY_TRASH_SELECT);

  return trips.map((trip) => ({
    ...sanitizeTripFor(trip, 'owner'),
    role: 'owner' as const,
  }));
}

export interface CreateAgencyTripInput {
  agencyId: string;
  userId: string;
  role: AgencyRole;
  title: string;
  startDate?: string;
  endDate?: string;
  assignedTo?: string;
  clientId?: string | null;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Enter a valid trip date.', 400);
  }
  return date;
}

function dayCount(startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 1;
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  return Math.min(30, Math.max(1, days));
}

/** A blank but fully-shaped itinerary so every editor tab can render. */
export function blankAgencyItinerary(title: string, days: number): Record<string, any> {
  return {
    trip_title: title,
    duration_days: days,
    budget_per_person: 0,
    season: 'Any season',
    group_type: 'Group',
    highlights: [],
    weather_advisory: {
      expected_weather: '',
      packing_tips: [],
      risks: [],
      seasonal_highlights: [],
    },
    day_by_day_itinerary: Array.from({ length: days }, (_, index) => ({
      day: index + 1,
      title: `Day ${index + 1}`,
      activities: [],
      stay_recommendations: [],
      transport: [],
      food_spots: [],
      pro_tip: [],
      permit_required: false,
    })),
    budget_breakdown: {
      accommodation: 0,
      food_and_drinks: 0,
      activities_and_entry: 0,
      local_transport: 0,
      miscellaneous_buffer: 0,
      total: 0,
    },
    local_transport: {
      walking: '',
      auto_rickshaw: '',
      local_buses: '',
      shared_cabs: '',
      tips: [],
    },
    footnotes_safety_tips: {
      cultural_etiquette: [],
      safety: [],
      payment: { upi: '', cash: '' },
      permits: { rohtang_pass_required: false, apply_online: '' },
      connectivity: { wifi: '', mobile_networks: '' },
    },
  };
}

async function assertAgencyAssignee(agencyId: string, userId: string): Promise<void> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError('Choose a valid agency team member.', 400);
  }
  const member = await AgencyMember.exists({ agencyId, userId });
  if (!member) {
    throw new AppError('That person is not part of this agency.', 400);
  }
}

export async function createAgencyTrip(input: CreateAgencyTripInput) {
  const title = input.title.trim() || 'Untitled agency trip';
  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  if (startDate && endDate && endDate < startDate) {
    throw new AppError('The end date cannot be before the start date.', 400);
  }

  const assignedTo = input.assignedTo || input.userId;
  await assertAgencyAssignee(input.agencyId, assignedTo);
  if (input.clientId) {
    await assertAgencyClient(input.agencyId, input.clientId);
  }

  const trip = new Trip({
    userId: input.userId,
    workspace: 'agency',
    agencyId: input.agencyId,
    assignedTo,
    clientId: input.clientId || undefined,
    title,
    status: 'draft',
    isDeleted: false,
    startDate,
    endDate,
    tripDetails: blankAgencyItinerary(title, dayCount(startDate, endDate)),
  });
  await trip.save();

  const role = agencyRoleForTrip(input.role);
  return { ...sanitizeTripFor(trip, role), role };
}

export interface UpdateAgencyTripInput {
  agencyId: string;
  role: AgencyRole;
  assignedTo?: string | null;
  clientId?: string | null;
}

/** Metadata-only update for the agency library (currently assignment/client). */
export async function updateAgencyTrip(trip: any, input: UpdateAgencyTripInput) {
  if (input.assignedTo !== undefined) {
    if (input.assignedTo === null || input.assignedTo === '') {
      trip.assignedTo = undefined;
    } else {
      await assertAgencyAssignee(input.agencyId, input.assignedTo);
      trip.assignedTo = input.assignedTo;
    }
  }

  if (input.clientId !== undefined) {
    if (input.clientId === null || input.clientId === '') {
      trip.clientId = undefined;
    } else {
      await assertAgencyClient(input.agencyId, input.clientId);
      trip.clientId = input.clientId;
    }
  }

  await trip.save();
  const role = agencyRoleForTrip(input.role);
  return { ...sanitizeTripFor(trip, role), role };
}

export interface AgencyGenerationContext {
  agencyId: string;
  agencyName: string;
  role: AgencyRole;
}

/**
 * Authorizes an agency generation request before any paid AI call is made.
 * A personal user gets the same 404 as an unknown agency, so ids cannot be
 * probed; a viewer/planner below planner gets a 403.
 */
export async function authorizeAgencyGeneration(
  agencyId: string,
  userId: string
): Promise<AgencyGenerationContext> {
  if (!Types.ObjectId.isValid(agencyId)) {
    throw new AppError('Agency not found', 404);
  }

  const [agency, member] = await Promise.all([
    Agency.findById(agencyId),
    AgencyMember.findOne({ agencyId, userId }),
  ]);
  const decision = decideAgencyAccess(agency, member, 'planner');
  if (decision.status === 404) throw new AppError('Agency not found', 404);
  if (decision.status === 403) {
    throw new AppError(
      "You don't have permission to create trips in this agency.",
      403
    );
  }

  return {
    agencyId,
    agencyName: agency?.name || 'Agency',
    role: decision.role!,
  };
}

/** Agency trips cannot be handed to a personal user as `owner`. */
export async function ensureAgencyDuplicateAllowed(
  trip: any,
  role: AgencyRole | undefined,
  agencyStaff: boolean
): Promise<void> {
  if (trip.workspace !== 'agency') return;
  if (!agencyStaff || !role) {
    throw new AppError(
      'Only agency team members can duplicate an agency trip.',
      403
    );
  }
  if (role === 'viewer') {
    throw new AppError(
      "You don't have permission to duplicate trips in this agency.",
      403
    );
  }
}

export function agencyTripCopyFields(trip: any, userId: string) {
  return {
    workspace: 'agency' as const,
    agencyId: trip.agencyId,
    assignedTo: userId,
    clientId: trip.clientId,
  };
}
