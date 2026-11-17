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

/** Write endpoints answer with the whole sanitized trip; only the ledger is read. */
interface TripWriteResponse {
  expenses?: TripExpense[];
}

export interface ReceiptFile {
  uri: string;
  name: string;
  type: string;
  /** The browser's File/Blob; React Native sends the uri shape instead. */
  file?: Blob;
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

export async function createTripExpense(
  tripId: string,
  input: ExpenseInput
): Promise<TripExpense[]> {
  const payload = await apiRequest<TripWriteResponse>(tripPath(tripId, '/expenses'), {
    method: 'POST',
    body: input,
  });
  return payload.expenses ?? [];
}

export async function updateTripExpense(
  tripId: string,
  expenseId: string,
  input: ExpenseInput
): Promise<TripExpense[]> {
  const payload = await apiRequest<TripWriteResponse>(
    tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}`),
    { method: 'PUT', body: input }
  );
  return payload.expenses ?? [];
}

export async function deleteTripExpense(tripId: string, expenseId: string): Promise<void> {
  await apiRequest(tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}`), {
    method: 'DELETE',
  });
}

/** Attaches (or replaces) the receipt file on an expense. */
export async function uploadExpenseReceipt(
  tripId: string,
  expenseId: string,
  receipt: ReceiptFile
): Promise<void> {
  const body = new FormData();
  if (receipt.file) {
    body.append('receipt', receipt.file, receipt.name);
  } else {
    body.append('receipt', {
      uri: receipt.uri,
      name: receipt.name,
      type: receipt.type,
    } as unknown as Blob);
  }
  await apiRequest(tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}/receipt`), {
    method: 'POST',
    body,
  });
}

export async function deleteExpenseReceipt(tripId: string, expenseId: string): Promise<void> {
  await apiRequest(tripPath(tripId, `/expenses/${encodeURIComponent(expenseId)}/receipt`), {
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
