import { Response } from 'express';
import crypto from 'crypto';
import { catchAsync } from '../utils/catchAsync.js';
import { sanitizeTripFor } from '../utils/sanitizeTrip.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import { tripContext } from '../middleware/tripAccess.middleware.js';
import {
  computeAmountInBase,
  computeEqualShares,
  rescaleShares,
  sharesMatchTotal,
} from '../services/finance/expenses.js';
import {
  DEFAULT_BASE_CURRENCY,
  fetchBasePerUnitRates,
} from '../services/finance/currency.js';
import {
  buildReceiptFilename,
  contentMatchesMime,
  deleteReceiptFile,
  saveReceiptFile,
} from '../services/finance/receipt.js';

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const baseCurrencyOf = (trip: any): string =>
  String(trip.finance?.baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();

const participantIdsOf = (trip: any): string[] =>
  (trip.participants || []).map((participant: any) => String(participant._id));

/**
 * Resolves the base-per-unit exchange rate for a currency: an explicitly
 * provided rate wins, then the trip's stored snapshot, then a live lookup.
 */
async function resolveRate(
  trip: any,
  currency: string,
  providedRate?: unknown
): Promise<number> {
  const base = baseCurrencyOf(trip);
  const code = String(currency || base).toUpperCase();
  if (code === base) return 1;

  const provided = Number(providedRate);
  if (Number.isFinite(provided) && provided > 0) return provided;

  const stored = Number(trip.finance?.exchangeRates?.[code]);
  if (Number.isFinite(stored) && stored > 0) return stored;

  try {
    const snapshot = await fetchBasePerUnitRates(base, [code]);
    const fetched = Number(snapshot.rates?.[code]);
    if (Number.isFinite(fetched) && fetched > 0) return fetched;
  } catch {
    /* Fall through to the friendly error below */
  }

  throw new AppError(
    `We could not fetch an exchange rate for ${code}. Please try again or enter the rate manually.`,
    502
  );
}

/** Recomputes an expense's base amount and shares from its currency/mode. */
function deriveAmountAndShares(
  expense: any,
  trip: any,
  options: { providedShares?: any[]; previousAmountInBase?: number } = {}
) {
  const base = baseCurrencyOf(trip);
  const rate = Number(expense.exchangeRate) > 0 ? Number(expense.exchangeRate) : 1;
  const nextAmountInBase = computeAmountInBase(expense.amount, rate);

  expense.currency = String(expense.currency || base).toUpperCase();
  expense.exchangeRate = rate;
  expense.amountInBase = nextAmountInBase;

  if (expense.splitMode === 'equal') {
    expense.shares = computeEqualShares(nextAmountInBase, participantIdsOf(trip));
    return;
  }

  if (expense.splitMode === 'none') {
    expense.shares = [];
    return;
  }

  // Custom splits: keep explicit shares, otherwise scale the existing ones
  if (Array.isArray(options.providedShares)) {
    expense.shares = options.providedShares.map((share) => ({
      participantId: String(share.participantId),
      amount: round2(share.amount),
    }));
  } else {
    const previous = Number(options.previousAmountInBase) || 0;
    const ratio = previous > 0 ? nextAmountInBase / previous : 1;
    expense.shares = rescaleShares(expense.shares || [], ratio);
  }

  if (!sharesMatchTotal(expense.shares || [], nextAmountInBase)) {
    throw new AppError('Custom split amounts must add up to the expense total.', 400);
  }
}

/**
 * Lists a trip's expense ledger, travellers and finance settings.
 * GET /api/itinerary/:id/expenses
 */
export const getTripExpenses = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip } = tripContext(req);

    res.status(200).json({
      success: true,
      expenses: trip.expenses || [],
      participants: trip.participants || [],
      finance: trip.finance || { baseCurrency: DEFAULT_BASE_CURRENCY },
    });
  }
);

/**
 * Adds an expense to a trip.
 * POST /api/itinerary/:id/expenses
 */
export const addTripExpense = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const body = req.body || {};
    const base = baseCurrencyOf(trip);
    const currency = String(body.currency || base).toUpperCase();
    const rate = await resolveRate(trip, currency, body.exchangeRate);

    const expense: any = {
      label: body.label,
      category: body.category || 'other',
      amount: Number(body.amount) || 0,
      currency,
      exchangeRate: rate,
      date: body.date || new Date(),
      day: body.day,
      paidBy: body.paidBy,
      splitMode: body.splitMode || 'none',
      shares: [],
      notes: body.notes,
      receiptUrl: body.receiptUrl,
      createdAt: new Date(),
    };

    deriveAmountAndShares(expense, trip, {
      providedShares: body.splitMode === 'custom' ? body.shares || [] : undefined,
    });

    (trip.expenses as any).push(expense);
    await trip.save();
    res.status(201).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Updates an existing expense.
 * PUT /api/itinerary/:id/expenses/:expenseId
 */
export const updateTripExpense = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const expense: any = (trip.expenses as any).id(req.params.expenseId);

    if (!expense) {
      throw new AppError('Expense not found', 404);
    }

    const body = req.body || {};
    const previousAmountInBase = Number(expense.amountInBase) || 0;

    const currency = String(body.currency ?? expense.currency ?? baseCurrencyOf(trip)).toUpperCase();
    const rate = await resolveRate(
      trip,
      currency,
      body.exchangeRate ?? (body.currency ? undefined : expense.exchangeRate)
    );

    const scalarFields = ['label', 'category', 'day', 'paidBy', 'notes', 'receiptUrl'] as const;
    for (const field of scalarFields) {
      if (body[field] !== undefined) {
        expense[field] = field === 'day' ? Number(body[field]) : body[field];
      }
    }
    if (body.date !== undefined) expense.date = body.date;
    if (body.amount !== undefined) expense.amount = Number(body.amount);
    if (body.splitMode !== undefined) expense.splitMode = body.splitMode;

    expense.currency = currency;
    expense.exchangeRate = rate;

    deriveAmountAndShares(expense, trip, {
      providedShares:
        body.splitMode === 'custom' || (body.shares !== undefined && expense.splitMode === 'custom')
          ? body.shares || []
          : undefined,
      previousAmountInBase,
    });

    await trip.save();
    res.status(200).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Deletes an expense.
 * DELETE /api/itinerary/:id/expenses/:expenseId
 */
export const deleteTripExpense = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const expense: any = (trip.expenses as any).id(req.params.expenseId);

    if (!expense) {
      throw new AppError('Expense not found', 404);
    }

    const receiptUrl = expense.receiptUrl;
    expense.deleteOne();
    await trip.save();

    // Keep the uploads directory free of orphaned files
    await deleteReceiptFile(receiptUrl);

    res.status(200).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Attaches (or replaces) a receipt file on an expense (Milestone 5.5).
 * POST /api/itinerary/:id/expenses/:expenseId/receipt
 */
export const uploadExpenseReceipt = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;

    if (!file) {
      throw new AppError('Please choose a receipt file to upload.', 400);
    }

    const { trip, role } = tripContext(req);
    const expense: any = (trip.expenses as any).id(req.params.expenseId);

    if (!expense) {
      throw new AppError('Expense not found', 404);
    }

    // Never trust the declared MIME type alone — verify the actual bytes
    if (!contentMatchesMime(file.mimetype, file.buffer)) {
      throw new AppError('That file does not look like a valid image or PDF receipt.', 400);
    }

    const filename = buildReceiptFilename(
      trip._id,
      expense._id,
      file.mimetype,
      `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    );
    const { url: nextUrl } = await saveReceiptFile(filename, file.buffer, file.mimetype);

    // Replacing a receipt should not leave the old file behind
    const previousUrl = expense.receiptUrl;
    if (previousUrl && previousUrl !== nextUrl) {
      await deleteReceiptFile(previousUrl);
    }

    expense.receiptUrl = nextUrl;
    await trip.save();

    res.status(200).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Removes an expense's receipt file.
 * DELETE /api/itinerary/:id/expenses/:expenseId/receipt
 */
export const deleteExpenseReceipt = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const expense: any = (trip.expenses as any).id(req.params.expenseId);

    if (!expense) {
      throw new AppError('Expense not found', 404);
    }

    const previousUrl = expense.receiptUrl;
    expense.receiptUrl = undefined;
    await trip.save();

    await deleteReceiptFile(previousUrl);

    res.status(200).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Replaces the trip's traveller list (used for expense splitting).
 * PUT /api/itinerary/:id/participants
 */
export const updateTripParticipants = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const incoming = (req.body?.participants || []) as Array<{
      _id?: string;
      name: string;
      isMe?: boolean;
    }>;

    trip.participants = reconcileParticipants(trip, incoming) as any;

    // Re-derive equal splits so stored shares stay consistent with the new list
    const base = baseCurrencyOf(trip);
    for (const expense of trip.expenses as any) {
      if (expense.splitMode === 'equal') {
        expense.currency = String(expense.currency || base).toUpperCase();
        expense.shares = computeEqualShares(
          Number(expense.amountInBase) || 0,
          participantIdsOf(trip)
        );
      }
    }

    await trip.save();
    res.status(200).json(sanitizeTripFor(trip, role));
  }
);

/**
 * Reconciles the incoming traveller rows with the existing participants while
 * keeping each surviving participant's `_id` stable (bug F4).
 *
 * Custom expense splits (`shares[].participantId`) and `paidBy` reference these
 * ids, so the previous behaviour — `.map()`ing the array into fresh subdocs —
 * silently re-pointed every expense at participants that no longer exist.
 *
 * Ids survive in two ways:
 * 1. the client echoes `_id` back (the schema passes it through);
 * 2. a client row with the same trimmed `name` rescues an existing participant
 *    that has not been claimed yet (covers clients that never send `_id`).
 * Rows matching neither are new participants and get fresh ids. Existing
 * participants that no row claims are removed — preserving the historical
 * behaviour — and equal-splits are re-derived afterwards.
 *
 * A matched participant's member link (`userId`, Milestone 6 §3.9) also
 * carries over, so re-saving the traveller list never unlinks a collaborator.
 */
function reconcileParticipants(
  trip: any,
  incoming: Array<{ _id?: string; name: string; isMe?: boolean }>
): Array<{ _id?: string; userId?: unknown; name: string; isMe: boolean }> {
  const existing: any[] = [...(trip.participants || [])];
  const claimed = new Set<string>();
  const normalize = (value: unknown): string => String(value ?? '').trim();

  const rows = incoming.map((row) => {
    const name = normalize(row.name) || 'Traveller';
    const isMe = Boolean(row.isMe);

    const echoedId = row._id != null ? String(row._id) : '';
    const claimedById =
      echoedId
        ? existing.find(
            (participant) =>
              participant && String(participant._id) === echoedId && !claimed.has(echoedId)
          )
        : undefined;

    const claimedByName =
      claimedById ||
      existing.find(
        (participant) =>
          participant &&
          !claimed.has(String(participant._id)) &&
          normalize(participant.name) === name
      );

    if (claimedByName) {
      const id = String(claimedByName._id);
      claimed.add(id);
      // Keep the member link (`userId`) so re-saving the traveller list never
      // unlinks the participant from a collaborator (Milestone 6 §3.9).
      const linked = claimedByName.userId ? { userId: claimedByName.userId } : {};
      return { ...linked, _id: id, name, isMe };
    }

    return { name, isMe };
  });

  return rows;
}

/**
 * Changes the trip's base currency and/or refreshes the cached FX snapshot.
 * Every expense is re-converted with the new rates (custom splits are scaled
 * proportionally so they keep summing to the total).
 * PUT /api/itinerary/:id/finance
 */
export const updateTripFinance = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const { trip, role } = tripContext(req);
    const body = req.body || {};

    if (!body.baseCurrency && !body.refresh) {
      throw new AppError('Provide a base currency or request a rate refresh.', 400);
    }

    const base = String(body.baseCurrency || baseCurrencyOf(trip)).toUpperCase();

    let snapshot;
    try {
      // One call quotes every supported currency relative to the new base
      snapshot = await fetchBasePerUnitRates(base);
    } catch {
      throw new AppError(
        'Exchange rates are temporarily unavailable. Please try again shortly.',
        502
      );
    }

    const rates: Record<string, number> = { ...(snapshot.rates || {}) };

    for (const expense of trip.expenses as any) {
      const code = String(expense.currency || base).toUpperCase();
      const live = code === base ? 1 : Number(rates[code]);
      const rate = Number.isFinite(live) && live > 0 ? live : Number(expense.exchangeRate) || 1;

      const previous = Number(expense.amountInBase) || 0;
      const next = round2((Number(expense.amount) || 0) * rate);

      expense.exchangeRate = rate;
      expense.amountInBase = next;

      if (expense.splitMode === 'equal') {
        expense.shares = computeEqualShares(next, participantIdsOf(trip));
      } else if (expense.splitMode === 'custom') {
        const ratio = previous > 0 ? next / previous : 1;
        expense.shares = rescaleShares(expense.shares || [], ratio);
      }
    }

    trip.finance = {
      baseCurrency: base,
      exchangeRates: { ...rates, [base]: 1 },
      ratesUpdatedAt: new Date(snapshot.updatedAt),
    } as any;

    await trip.save();
    res.status(200).json(sanitizeTripFor(trip, role));
  }
);
