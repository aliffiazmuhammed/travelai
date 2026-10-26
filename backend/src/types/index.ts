import { Request } from 'express';
import { Types } from 'mongoose';

/** PA0 account realms. `platform_token` is never accepted by shared routes. */
export type AccountRealm = 'personal' | 'agency' | 'platform';

/** JWT payload shape. Legacy personal tokens lack `realm`/`ver` (treated as personal/0). */
export interface RealmTokenClaims {
  userId: string;
  realm: AccountRealm;
  agencyId?: string;
  role?: 'super_admin';
  ver: number;
}

/** One verified realm identity on a shared trip request. */
export interface RealmIdentity {
  userId: string;
  realm: AccountRealm;
  agencyId?: string;
  mustChangePassword?: boolean;
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  /** Set by the realm guards; shared trip routes may hold both candidates. */
  realm?: AccountRealm;
  agencyId?: string;
  sessionCandidates?: RealmIdentity[];
}

export interface TripPreferencesInput {
  pace?: 'relaxed' | 'balanced' | 'packed';
  dietary?: string[];
  avoid?: string[];
  accessibility?: string[];
}

export interface TripInput {
  destination: string;
  days: number;
  budget: number;
  startdate: string;
  enddate: string;
  interests: string[] | string;
  groupType: string;
  language?: string;
  preferences?: TripPreferencesInput;
}

export interface SignupInput {
  email: string;
  password: string;
}

export interface SigninInput {
  email: string;
  password: string;
}

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  password: string;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TripDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tripDetails: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
