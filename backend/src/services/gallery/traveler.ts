/**
 * Public traveler profile (Milestone 8 G2).
 *
 * The handle is the only lookup key, and it only resolves for personal accounts
 * that hold one. The trip list is deliberately narrow: published, owned by this
 * account, not agency content, not deleted, and not already over. A trip with no
 * start date counts as upcoming ("Dates flexible"), so it is not silently
 * dropped from a profile.
 *
 * Everything the page renders comes back through `projectTravelerProfile`, so
 * the payload cannot grow an email, member list or price field by accident.
 */

import Trip from '../../models/Trip.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { normalizeHandle } from '../user/profile.js';
import {
  projectTravelerProfile,
  type GalleryTravelerProfile,
} from './projection.js';

/** Upper bound for one profile page; the gallery (G3) owns real pagination. */
const PROFILE_TRIP_LIMIT = 30;

function startOfTodayUtc(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

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
    visibility: 'public',
    workspace: { $ne: 'agency' },
    isDeleted: { $ne: true },
    // Ownership comes from the members[] role, the same source the publish
    // service trusts, so a transferred trip never lists under its creator.
    members: { $elemMatch: { userId: user._id, role: 'owner' } },
    $or: [
      { startDate: { $gte: startOfTodayUtc() } },
      { startDate: { $exists: false } },
      { startDate: null },
    ],
  })
    .select('title tripDetails gallery startDate endDate publishedAt generationMeta')
    .sort({ publishedAt: -1, _id: -1 })
    .limit(PROFILE_TRIP_LIMIT)
    .lean();

  return projectTravelerProfile(user, trips as any[]);
}
