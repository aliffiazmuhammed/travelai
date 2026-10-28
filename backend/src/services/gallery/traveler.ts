/**
 * Public traveler profile (Milestone 8 G2).
 *
 * The handle is the only lookup key, and it only resolves for personal accounts
 * that hold one. The trip list is deliberately narrow: published, owned by this
 * account, not agency content and not deleted. Unlike the gallery listing, it
 * is not limited to upcoming trips — a traveler page is a portfolio, so a trip
 * stays listed after it ends. A trip with no start date reads "Dates flexible".
 *
 * Everything the page renders comes back through `projectTravelerProfile`, so
 * the payload cannot grow an email, member list or price field by accident.
 */

import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { normalizeHandle } from '../user/profile.js';
import { publicTripClauses } from './explore.js';
import {
  projectTravelerProfile,
  type GalleryTravelerProfile,
} from './projection.js';

/** Upper bound for one profile page; the gallery (G3) owns real pagination. */
const PROFILE_TRIP_LIMIT = 30;

export async function loadTravelerProfile(
  rawHandle: unknown
): Promise<GalleryTravelerProfile> {
  const handle = normalizeHandle(rawHandle);
  const user: any = await User.findOne({
    accountType: 'personal',
    status: 'active',
    'profile.handle': handle,
  })
    .select('name avatarUrl profile')
    .lean();

  if (!user) {
    throw new AppError('Traveler not found.', 404);
  }

  const trips = await Trip.find({
    // Reuse the gallery's eligibility rule (G6: this now also drops hidden
    // trips), minus the upcoming window — finished trips stay on the profile.
    // Ownership comes from the members[] role, the same source the publish
    // service trusts, so a transferred trip never lists under its creator.
    $and: [
      ...publicTripClauses({ includePast: true }),
      { members: { $elemMatch: { userId: user._id, role: 'owner' } } },
    ],
  })
    .select('title tripDetails gallery startDate endDate publishedAt generationMeta')
    .sort({ publishedAt: -1, _id: -1 })
    .limit(PROFILE_TRIP_LIMIT)
    .lean();

  return projectTravelerProfile(user, trips as any[]);
}
