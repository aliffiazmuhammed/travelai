import { apiRequest } from '@/api/client';

export type ExpenseCategory =
  | 'accommodation'
  | 'food_and_drinks'
  | 'activities_and_entry'
  | 'local_transport'
  | 'miscellaneous_buffer'
  | 'other';

export type ExpenseSplitMode = 'none' | 'equal' | 'custom';

export interface ExpenseShare {
  participantId: string;
  amount: number;
}

/** One ledger row. Older trips may be missing most optional fields. */
export interface TripExpense {
  _id: string;
  label: string;
  category?: ExpenseCategory;
  /** What was entered, in `currency`. */
  amount: number;
  currency?: string;
  /** Server-converted amount in the trip's base currency. */
  amountInBase?: number;
  exchangeRate?: number;
  date?: string;
  day?: number;
  paidBy?: string;
  splitMode?: ExpenseSplitMode;
  shares?: ExpenseShare[];
  notes?: string;
  receiptUrl?: string;
  createdAt?: string;
}

export interface TripParticipant {
  _id: string;
  name: string;
  isMe?: boolean;
  userId?: string;
}

export interface TripFinance {
  baseCurrency?: string;
  exchangeRates?: Record<string, number>;
  ratesUpdatedAt?: string;
}

export interface ExpenseLedger {
  expenses: TripExpense[];
  participants: TripParticipant[];
  finance: TripFinance;
}

export interface ExpenseInput {
  label: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  paidBy?: string;
  /**
   * Omit to leave an existing custom split untouched: sending `custom` without
   * shares makes the server replace them with an empty list and reject the sum.
   */
  splitMode?: ExpenseSplitMode;
  notes?: string;
  /** Only sent for explicit custom splits; the server rescales otherwise. */
  shares?: ExpenseShare[];
}

export interface TravellerInput {
  /** Echoed back so the server keeps ids that custom splits point at. */
  _id?: string;
  name: string;
  isMe?: boolean;
}

interface LedgerResponse {
  expenses?: TripExpense[];
  participants?: TripParticipant[];
  finance?: TripFinance;
}

function tripPath(tripId: string, suffix: string): string {
  return `/itinerary/${encodeURIComponent(tripId)}${suffix}`;
}

export async function fetchExpenseLedger(tripId: string): Promise<ExpenseLedger> {
  const payload = await apiRequest<LedgerResponse>(tripPath(tripId, '/expenses'));
  return {
    expenses: payload.expenses ?? [],
    participants: payload.participants ?? [],
    finance: payload.finance ?? {},
  };
}

export async function createTripExpense(tripId: string, input: ExpenseInput): Promise<void> {
  await apiRequest(tripPath(tripId, '/expenses'), { method: 'POST', body: input });
}

export async function updateTripExpense(
  tripId: string,
  expenseId: string,
  input: ExpenseInput
): Promise<void> {
  await apiRequest(tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}`), {
    method: 'PUT',
    body: input,
  });
}

export async function deleteTripExpense(tripId: string, expenseId: string): Promise<void> {
  await apiRequest(tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}`), {
    method: 'DELETE',
  });
}

/** Whole-list save; `baseRev` is required because it rewrites shared split ids. */
export async function saveTripTravellers(
  tripId: string,
  baseRev: number,
  participants: TravellerInput[]
): Promise<void> {
  await apiRequest(tripPath(tripId, '/participants'), {
    method: 'PUT',
    body: { baseRev, participants },
  });
}
