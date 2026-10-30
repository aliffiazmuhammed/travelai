import mongoose from 'mongoose';
import AgencyEvent from '../../models/AgencyEvent.js';
import AgencyEventInterest, {
  AGENCY_EVENT_INTEREST_LIMITS,
} from '../../models/AgencyEventInterest.js';
import { AppError } from '../../utils/AppError.js';
import {
  loadPublicEventHost,
  publicEventDetailClauses,
  startOfTodayUtc,
} from './publicEvents.js';

/**
 * "I'm interested" on a public event (Milestone 10 E2).
 *
 * This is the guest's only write on the event surface, so it carries the same
 * eligibility as the event page: published, not ops-hidden, hosted by an active
 * agency with a live directory profile. On top of that the window itself must
 * still accept people — not closed, not finished, and not full.
 *
 * The record is a contact card, not an enquiry: there is no thread and no
 * account. The agency verifies by phone or email and confirms the spot.
 * Duplicates are rejected by the partial unique index, which is the only
 * race-free way to keep one live interest per person per event.
 */

export interface EventInterestInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  /** Honeypot: a field no person can see, so a filled value is a bot. */
  website?: unknown;
}

export interface EventInterestAcknowledgement {
  id: string;
  status: 'pending';
  createdAt: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeName(value: unknown): string {
  const name = text(value);
  if (name.length < 2) {
    throw new AppError('Tell the agency your name.', 400);
  }
  if (name.length > AGENCY_EVENT_INTEREST_LIMITS.name) {
    throw new AppError(
      `Keep your name under ${AGENCY_EVENT_INTEREST_LIMITS.name} characters.`,
      400
    );
  }
  return name;
}

function normalizeEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  if (
    email.length > AGENCY_EVENT_INTEREST_LIMITS.email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new AppError('Enter a valid email address.', 400);
  }
  return email;
}

function normalizePhone(value: unknown): string {
  const phone = text(value);
  if (phone.length < 3 || phone.length > AGENCY_EVENT_INTEREST_LIMITS.phone) {
    throw new AppError('Enter a phone number the agency can reach you on.', 400);
  }
  return phone;
}

function normalizeNote(value: unknown): string {
  const note = text(value);
  if (note.length > AGENCY_EVENT_INTEREST_LIMITS.note) {
    throw new AppError(
      `Keep your note under ${AGENCY_EVENT_INTEREST_LIMITS.note} characters.`,
      400
    );
  }
  return note;
}

const ALREADY_LISTED =
  'You are already on the list for this event. The agency will be in touch.';

/**
 * Records one interest. Returns `null` when the honeypot was filled: the caller
 * answers a normal success so a bot learns nothing from the response.
 */
export async function submitEventInterest(input: {
  eventId: string;
  body: EventInterestInput;
}): Promise<EventInterestAcknowledgement | null> {
  if (text(input.body.website)) return null;

  const name = normalizeName(input.body.name);
  const email = normalizeEmail(input.body.email);
  const phone = normalizePhone(input.body.phone);
  const note = normalizeNote(input.body.note);

  if (!mongoose.isValidObjectId(input.eventId)) {
    throw new AppError('Event not found.', 404);
  }

  const event = (await AgencyEvent.findOne({
    _id: input.eventId,
    $and: publicEventDetailClauses(),
  })
    .select('agencyId capacity closedAt startDate endDate')
    .lean()) as any;
  if (!event) throw new AppError('Event not found.', 404);

  const host = await loadPublicEventHost(event.agencyId);
  if (!host) throw new AppError('Event not found.', 404);

  if (event.closedAt) {
    throw new AppError(
      'This event has closed. Look for another date, or contact the agency directly.',
      409
    );
  }

  const endDate = new Date(event.endDate ?? event.startDate);
  if (!Number.isNaN(endDate.getTime()) && endDate < startOfTodayUtc()) {
    throw new AppError('This event has already finished.', 409);
  }

  const capacity = Number(event.capacity);
  if (Number.isFinite(capacity) && capacity >= 1) {
    const confirmed = await AgencyEventInterest.countDocuments({
      eventId: event._id,
      status: 'confirmed',
    });
    if (confirmed >= Math.floor(capacity)) {
      throw new AppError(
        'Every spot is taken. Contact the agency to ask about another date.',
        409
      );
    }
  }

  let interest: any;
  try {
    interest = await AgencyEventInterest.create({
      eventId: event._id,
      agencyId: event.agencyId,
      name,
      email,
      phone,
      note,
      status: 'pending',
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new AppError(ALREADY_LISTED, 409);
    }
    throw error;
  }

  return {
    id: String(interest._id),
    status: 'pending',
    createdAt: interest.createdAt
      ? new Date(interest.createdAt).toISOString()
      : null,
  };
}
