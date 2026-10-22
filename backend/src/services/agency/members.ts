import mongoose from 'mongoose';
import AgencyMember from '../../models/AgencyMember.js';
import User from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { userLabel } from '../collab/comments.js';
import {
  agencyCan,
  assertAgencyMemberRemoval,
  assertAgencyRoleChange,
  type AgencyRole,
} from './access.js';

export interface AgencyMemberRow {
  userId: string;
  role: AgencyRole;
  joinedAt: Date;
  label: string;
  avatarUrl?: string;
  /** Admin/owner view only, plus the caller's own row. */
  email?: string;
  isYou?: boolean;
}

function canSeeEmail(
  viewerRole: AgencyRole,
  viewerId: string,
  targetUserId: unknown
): boolean {
  return agencyCan(viewerRole, 'admin') || String(viewerId) === String(targetUserId);
}

/** Builds the team list for one agency. The caller is already a member. */
export async function listAgencyMembers(
  agencyId: string,
  viewerId: string,
  viewerRole: AgencyRole
): Promise<AgencyMemberRow[]> {
  const members = await AgencyMember.find({ agencyId }).sort({ joinedAt: 1 }).lean();
  const users = await User.find({
    _id: { $in: members.map((member) => member.userId) },
  })
    .select('_id email name avatarUrl')
    .lean();
  const people = new Map(users.map((user) => [String(user._id), user]));

  return members.map((member) => {
    const person = people.get(String(member.userId));
    const row: AgencyMemberRow = {
      userId: String(member.userId),
      role: member.role as AgencyRole,
      joinedAt: member.joinedAt,
      label: userLabel(person),
    };
    if (person?.avatarUrl) row.avatarUrl = String(person.avatarUrl);
    if (person?.email && canSeeEmail(viewerRole, viewerId, member.userId)) {
      row.email = String(person.email);
    }
    if (String(member.userId) === String(viewerId)) row.isYou = true;
    return row;
  });
}

export interface ChangeAgencyRoleInput {
  agencyId: string;
  actorId: string;
  actorRole: AgencyRole;
  targetUserId: string;
  nextRole: unknown;
}

/**
 * Changes a team role after the pure last-owner rules pass. The route guard
 * guarantees at least admin rank; the service re-checks the owner-only rules
 * so a future route cannot forget them.
 */
export async function changeAgencyMemberRole(
  input: ChangeAgencyRoleInput
): Promise<AgencyMemberRow[]> {
  if (!mongoose.isValidObjectId(input.targetUserId)) {
    throw new AppError('That person is not part of this agency.', 404);
  }

  const members = await AgencyMember.find({ agencyId: input.agencyId }).lean();
  assertAgencyRoleChange(
    members,
    input.targetUserId,
    input.nextRole,
    input.actorRole
  );

  const updated = await AgencyMember.findOneAndUpdate(
    { agencyId: input.agencyId, userId: input.targetUserId },
    { $set: { role: input.nextRole as AgencyRole } },
    { new: true }
  );
  if (!updated) {
    throw new AppError('That person is not part of this agency.', 404);
  }

  return listAgencyMembers(input.agencyId, input.actorId, input.actorRole);
}

export interface RemoveAgencyMemberInput {
  agencyId: string;
  actorId: string;
  actorRole: AgencyRole;
  targetUserId: string;
}

export async function removeAgencyMember(
  input: RemoveAgencyMemberInput
): Promise<AgencyMemberRow[]> {
  if (!mongoose.isValidObjectId(input.targetUserId)) {
    throw new AppError('That person is not part of this agency.', 404);
  }

  const members = await AgencyMember.find({ agencyId: input.agencyId }).lean();
  assertAgencyMemberRemoval(members, input.targetUserId, input.actorRole);

  const deleted = await AgencyMember.findOneAndDelete({
    agencyId: input.agencyId,
    userId: input.targetUserId,
  });
  if (!deleted) {
    throw new AppError('That person is not part of this agency.', 404);
  }

  return listAgencyMembers(input.agencyId, input.actorId, input.actorRole);
}
