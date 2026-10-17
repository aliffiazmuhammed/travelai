import mongoose, { Schema, Document, Types } from 'mongoose';

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

export interface ITrip extends Document {
  userId: Types.ObjectId;
  title?: string;
  /** Planned trip window — drives per-day weather forecasts (Milestone 4). */
  startDate?: Date;
  endDate?: Date;
  status: 'draft' | 'planned' | 'ongoing' | 'completed';
  isDeleted: boolean;
  shareId?: string;
  isPublic?: boolean;
  tripDetails: Record<string, any>;
  version: number;
  hasEdited: boolean;
  versions: ITripVersion[];
  /** Prompt version used to generate the trip (Milestone 2). */
  promptVersion?: string;
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

export default mongoose.model<ITrip>('Trip', tripSchema);
