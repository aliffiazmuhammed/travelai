import mongoose, { Schema, Document, Types } from 'mongoose';
import { emitTripUpdated } from '../services/collab/presence.js';

export interface ITripVersion {
  version: number;
  title?: string;
  tripDetails: Record<string, any>;
  savedAt: Date;
  note?: string;
}

export interface ITripFeedback {
  rating: 'up' | 'down';
  comment?: string;
  submittedAt: Date;
}

export type ExpenseCategory =
  | 'accommodation'
  | 'food_and_drinks'
  | 'activities_and_entry'
  | 'local_transport'
  | 'miscellaneous_buffer'
  | 'other';

export interface IExpenseShare {
  participantId: string;
  amount: number;
}

export interface ITripExpense {
  _id?: Types.ObjectId;
  label: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  amountInBase: number;
  exchangeRate: number;
  date: Date;
  day?: number;
  paidBy?: string;
  splitMode: 'none' | 'equal' | 'custom';
  shares: IExpenseShare[];
  notes?: string;
  receiptUrl?: string;
  createdAt: Date;
}

export interface ITripParticipant {
  _id?: Types.ObjectId;
  name: string;
  isMe?: boolean;
  /**
   * Set when the participant corresponds to an authenticated collaborator
   * (Milestone 6 §3.9). Participants must survive member removal, so removal
   * *unlinks* (clears `userId`) rather than deleting the row.
   */
  userId?: Types.ObjectId;
}

export interface ITripFinance {
  baseCurrency: string;
  exchangeRates?: Record<string, number>;
  ratesUpdatedAt?: Date;
}

export type RouteTravelMode = 'walk' | 'bike' | 'drive';

export interface ICustomRoute {
  _id?: Types.ObjectId;
  name: string;
  day?: number;
  color: string;
  mode: RouteTravelMode;
  /** Ordered `[lat, lng]` vertices of the drawn path. */
  points: [number, number][];
  /** Great-circle length, recomputed server-side on save. */
  distanceKm: number;
  createdAt: Date;
}

import {
  ensureCreatorMembership,
  type TripMembershipShape,
  type TripRole,
} from '../services/collab/access.js';

export interface ITripMember {
  /** The collaborating user's `_id`. */
  userId: Types.ObjectId;
  role: TripRole;
  /** Who created the invitation that added this member (absent for the creator). */
  invitedBy?: Types.ObjectId;
  joinedAt: Date;
}

export type TripWorkspace = 'personal' | 'agency';

/**
 * Sharing mode (Milestone 8 G1). `unlisted` is the share-link mode; `public`
 * adds a browsable gallery listing. `isPublic` remains the legacy share flag —
 * share/revoke keep `visibility` in sync with it.
 */
export type TripVisibility = 'private' | 'unlisted' | 'public';

/** Gallery-only metadata; never carries anything monetary or membership-related. */
export interface ITripGallery {
  hideExactDates: boolean;
  summary?: string;
  tags: string[];
}

export interface ITrip extends Document {
  userId: Types.ObjectId;
  /**
   * Which product surface owns this trip. Documents created before A2 have no
   * `workspace` and are treated as personal by every query (`$ne: 'agency'`).
   */
  workspace: TripWorkspace;
  /** Agency tenant for `workspace: 'agency'`; absent on personal trips. */
  agencyId?: Types.ObjectId;
  /** Agency member currently responsible for this trip. */
  assignedTo?: Types.ObjectId;
  /** A4 client directory link. Optional until the client model ships. */
  clientId?: Types.ObjectId;
  title?: string;
  /** Planned trip window — drives per-day weather forecasts (Milestone 4). */
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted: boolean;
  /** When the owner moved the trip to Recently deleted; absent while active. */
  deletedAt?: Date;
  /** A8: archived trips leave the active list but keep pinned exports/shares. */
  archivedAt?: Date;
  shareId?: string;
  isPublic?: boolean;
  /** Personal-trip sharing mode (Milestone 8 G1); agency rows are never public. */
  visibility: TripVisibility;
  /** Set while `visibility === 'public'`; cleared on unpublish. */
  publishedAt?: Date;
  /** Public card metadata, written by the publish endpoint only. */
  gallery?: ITripGallery;
  tripDetails: Record<string, any>;
  version: number;
  hasEdited: boolean;
  versions: ITripVersion[];
  /** Prompt version used to generate the trip (Milestone 2). */
  promptVersion?: string;
  /**
   * Every authenticated person with access, including the creator as owner
   * (Milestone 6). The authoritative access list — `userId` remains as the
   * creator/audit field only.
   */
  members: ITripMember[];
  /**
   * Optimistic-concurrency counter (Milestone 6 §3.6). Bumped by schema hooks
   * on every write; clients send `baseRev` and get a 409 when it is stale.
   */
  rev: number;
  /** Rich generation metadata: variant, language, quality score, request echo, etc. */
  generationMeta?: Record<string, any>;
  /** User rating of the generated itinerary (drives personalization + A/B insights). */
  feedback?: ITripFeedback;
  /** Group travellers used for expense splitting (Milestone 5). */
  participants: ITripParticipant[];
  /** Actual logged expenses against the planned budget (Milestone 5). */
  expenses: ITripExpense[];
  /** Base currency + cached FX rates for the trip (Milestone 5). */
  finance?: ITripFinance;
  /** User-drawn custom paths on the map (Milestone 4). */
  customRoutes: ICustomRoute[];
  createdAt: Date;
  updatedAt: Date;
}

const tripVersionSchema = new Schema<ITripVersion>(
  {
    version: { type: Number, required: true },
    title: { type: String, trim: true },
    tripDetails: { type: Object, required: true },
    savedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const tripFeedbackSchema = new Schema<ITripFeedback>(
  {
    rating: { type: String, enum: ['up', 'down'], required: true },
    comment: { type: String, trim: true, maxlength: 500 },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const tripGallerySchema = new Schema<ITripGallery>(
  {
    hideExactDates: { type: Boolean, default: false },
    summary: { type: String, trim: true, maxlength: 280 },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const tripMemberSchema = new Schema<ITripMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'editor', 'commenter', 'viewer'], required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const expenseShareSchema = new Schema<IExpenseShare>(
  {
    participantId: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const expenseSchema = new Schema<ITripExpense>({
  label: { type: String, required: true, trim: true, maxlength: 120 },
  category: {
    type: String,
    enum: [
      'accommodation',
      'food_and_drinks',
      'activities_and_entry',
      'local_transport',
      'miscellaneous_buffer',
      'other',
    ],
    default: 'other',
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  amountInBase: { type: Number, default: 0, min: 0 },
  exchangeRate: { type: Number, default: 1, min: 0 },
  date: { type: Date, default: Date.now },
  day: { type: Number },
  paidBy: { type: String, trim: true },
  splitMode: { type: String, enum: ['none', 'equal', 'custom'], default: 'none' },
  shares: { type: [expenseShareSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 500 },
  receiptUrl: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
});

const participantSchema = new Schema<ITripParticipant>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  isMe: { type: Boolean, default: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
});

const financeSchema = new Schema<ITripFinance>(
  {
    baseCurrency: { type: String, default: 'INR', uppercase: true, trim: true },
    exchangeRates: { type: Object },
    ratesUpdatedAt: { type: Date },
  },
  { _id: false }
);

const customRouteSchema = new Schema<ICustomRoute>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  day: { type: Number },
  color: { type: String, default: '#0ea5e9', trim: true, maxlength: 20 },
  mode: { type: String, enum: ['walk', 'bike', 'drive'], default: 'drive' },
  points: { type: [[Number]], default: [] },
  distanceKm: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now },
});

const tripSchema = new Schema<ITrip>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    workspace: {
      type: String,
      enum: ['personal', 'agency'],
      default: 'personal',
      index: true,
    },
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      default: undefined,
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'AgencyClient',
      default: undefined,
    },
    title: {
      type: String,
      trim: true,
    },
    startDate: { type: Date },
    endDate: { type: Date },
    status: {
      type: String,
      enum: ['draft', 'planned', 'ongoing', 'completed'],
      default: 'planned',
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: undefined,
    },
    archivedAt: {
      type: Date,
      default: undefined,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ['private', 'unlisted', 'public'],
      default: 'private',
    },
    publishedAt: {
      type: Date,
      default: undefined,
    },
    gallery: {
      type: tripGallerySchema,
      default: undefined,
    },
    tripDetails: {
      type: Object,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    hasEdited: {
      type: Boolean,
      default: false,
      index: true,
    },
    versions: {
      type: [tripVersionSchema],
      default: [],
      select: false,
    },
    promptVersion: {
      type: String,
      trim: true,
    },
    members: {
      type: [tripMemberSchema],
      default: [],
    },
    rev: {
      type: Number,
      default: 1,
      min: 1,
    },
    generationMeta: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    feedback: {
      type: tripFeedbackSchema,
      default: undefined,
    },
    participants: {
      type: [participantSchema],
      default: [],
    },
    expenses: {
      type: [expenseSchema],
      default: [],
    },
    finance: {
      type: financeSchema,
      default: undefined,
    },
    customRoutes: {
      type: [customRouteSchema],
      default: [],
    },
  },
  { timestamps: true }
);

tripSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
// Membership lookups: the dashboard lists trips the user is a member of.
tripSchema.index({ 'members.userId': 1, isDeleted: 1, createdAt: -1 });
// Recently deleted: owner-only rows, newest deletion first.
tripSchema.index({ 'members.userId': 1, isDeleted: 1, deletedAt: -1 });
// Agency library and trash, always scoped by tenant.
tripSchema.index({ agencyId: 1, workspace: 1, isDeleted: 1, createdAt: -1 });
tripSchema.index({ agencyId: 1, workspace: 1, isDeleted: 1, deletedAt: -1 });
tripSchema.index({ agencyId: 1, assignedTo: 1, isDeleted: 1 });
// Gallery listing (Milestone 8): published, live trips ordered by travel date.
tripSchema.index({ visibility: 1, isDeleted: 1, startDate: 1 });
// Explore cursor (G3): newest publication first, `_id` breaking same-millisecond
// ties so paging never skips or repeats a row. The prefix still answers plain
// "newest published" reads.
tripSchema.index({ visibility: 1, publishedAt: -1, _id: -1 });
tripSchema.index({ 'gallery.tags': 1 });

/** Agency trips must name their tenant; personal trips must not acquire one. */
tripSchema.pre('validate', function () {
  if (this.workspace === 'agency' && !this.agencyId) {
    this.invalidate('agencyId', 'Agency trips must belong to an agency.');
  }
  if (this.workspace !== 'agency' && this.agencyId) {
    this.invalidate('agencyId', 'Only agency trips can belong to an agency.');
  }
  // Gallery publishing is a personal-realm surface only (Milestone 8 invariant
  // 3). The publish service also rejects agency rows up front; this keeps the
  // rule structural for every other write path.
  if (this.workspace === 'agency' && this.visibility === 'public') {
    this.invalidate('visibility', 'Agency trips cannot be published to the gallery.');
  }
});

/**
 * P0 creation invariant (2026-10-20): every new trip carries its creator as
 * an `owner` member. Access checks read `members[]` only, so a trip created
 * without this row is listed on the dashboard but 404s on open.
 *
 * Enforcing it at the schema level covers every present and future creation
 * path (generate, stream, duplicate, seeds, scripts) instead of asking each
 * controller to remember. `isNew` is deliberate: saving an existing trip must
 * never re-add a creator who transferred ownership or left.
 */
tripSchema.pre('validate', function () {
  ensureCreatorMembership(this as unknown as TripMembershipShape);
});

/**
 * Optimistic concurrency (Milestone 6 §3.6). `rev` must move on **every**
 * write path so a stale client is always caught — document saves and direct
 * query updates alike. Bumping in hooks (instead of sprinkling `rev = rev + 1`
 * through controllers) means a new write path cannot forget it.
 */
tripSchema.pre('save', function () {
  // Fresh documents start at the default (1); only real rewrites count.
  if (!this.isNew && this.isModified()) {
    this.rev = (this.rev ?? 1) + 1;
  }
});

/** Adds/submerges `$inc: { rev: 1 }` into a direct query update. */
function withRevBump(update: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!update || Array.isArray(update)) return update;

  const existing = (update.$inc !== undefined ? update.$inc : {}) as Record<string, unknown>;
  const bumped = { ...existing, rev: Number(existing.rev ?? 0) + 1 };

  const hasOperator = Object.keys(update).some((key) => key.startsWith('$'));
  return hasOperator
    ? { ...update, $inc: bumped }
    : { $set: { ...update }, $inc: bumped };
}

for (const operation of ['findOneAndUpdate', 'updateOne', 'updateMany'] as const) {
  tripSchema.pre(operation, function () {
    const nextUpdate = withRevBump(this.getUpdate() as Record<string, unknown> | null);
    if (nextUpdate) {
      this.setUpdate(nextUpdate as any);
    }
  });
}

/**
 * E4: every successful Trip write fans out a `trip:updated` event to any open
 * SSE streams (services/collab/presence.ts). Failures inside the bus are
 * swallowed by the bus itself — a dead stream can never break a write.
 */
tripSchema.post('save', function () {
  emitTripUpdated(String(this._id));
});
tripSchema.post('findOneAndUpdate', { document: false }, function (doc: any) {
  if (doc) emitTripUpdated(String(doc._id));
});
/**
 * `post('updateOne'|'updateMany')` is NOT supported by mongoose query
 * middleware, so the three direct `Trip.updateOne` call sites (members.ts ×2,
 * invites.ts ×1) emit the change notification themselves. Everything else in
 * the app goes through `trip.save()` above — covered automatically.
 */

export default mongoose.model<ITrip>('Trip', tripSchema);
