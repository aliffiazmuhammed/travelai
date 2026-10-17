import { Request } from 'express';
import { Types } from 'mongoose';

export interface AuthenticatedRequest extends Request {
  userId?: string;
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
