import type {
  ExpenseCategory,
  ExpenseSplitMode,
  TripExpense,
  TripParticipant,
} from '@/api/expenses';
import { assetUrl } from '@/config';

/** Mirrors `backend/src/services/finance/receipt.ts`; the server is the judge. */
export const RECEIPT_MAX_MB = 5;
export const RECEIPT_MAX_BYTES = RECEIPT_MAX_MB * 1024 * 1024;
export const RECEIPT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export function isPdfReceipt(url?: string | null): boolean {
  return /\.pdf(\?|#|$)/i.test(String(url ?? ''));
}

export function receiptKindLabel(url?: string | null): string {
  return isPdfReceipt(url) ? 'PDF receipt' : 'Photo receipt';
}

/** Absolute URL for a stored receipt (relative `/uploads/...` or Cloudinary). */
export function receiptLink(url?: string | null): string {
  const value = String(url ?? '');
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : assetUrl(value);
}

/** Pre-flight check so an obviously bad file never makes an upload round trip. */
export function receiptError(file: {
  name?: string;
  type?: string;
  size?: number;
}): string | null {
  const type = String(file.type ?? '').toLowerCase();
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(type)) {
    return 'Receipts must be a JPEG, PNG, WebP image or PDF.';
  }
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) return 'That file appears to be empty.';
  if (size > RECEIPT_MAX_BYTES) return `Receipts must be smaller than ${RECEIPT_MAX_MB} MB.`;
  return null;
}

export const EXPENSE_CATEGORIES = [
  { id: 'accommodation', label: 'Accommodation', icon: 'bed-outline', color: '#3b82f6' },
  { id: 'food_and_drinks', label: 'Food & drinks', icon: 'restaurant-outline', color: '#f97316' },
  {
    id: 'activities_and_entry',
    label: 'Activities & entry',
    icon: 'ticket-outline',
    color: '#10b981',
  },
  { id: 'local_transport', label: 'Local transport', icon: 'car-outline', color: '#8b5cf6' },
  {
    id: 'miscellaneous_buffer',
    label: 'Buffer & misc',
    icon: 'ellipsis-horizontal-outline',
    color: '#f59e0b',
  },
  { id: 'other', label: 'Other', icon: 'pricetag-outline', color: '#64748b' },
] as const;

const CATEGORY_BY_ID = new Map(EXPENSE_CATEGORIES.map((category) => [category.id, category]));

export function getCategoryMeta(id: string | undefined) {
  return CATEGORY_BY_ID.get(id as ExpenseCategory) ?? EXPENSE_CATEGORIES[5];
}

export const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee' },
  { code: 'USD', symbol: '$', name: 'US dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss franc' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai baht' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit' },
] as const;

export function currencyMeta(code: string | undefined) {
  const upper = String(code || 'INR').toUpperCase();
  return CURRENCIES.find((currency) => currency.code === upper) ?? { code: upper, symbol: upper, name: upper };
}

/** "₹12,400" / "€120.50" — no decimals unless the amount actually has them. */
export function formatMoney(amount: number, currency = 'INR'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const decimals = Math.abs(value % 1) > 0.005 ? 2 : 0;
  let body: string;
  try {
    body = value.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    body = value.toFixed(decimals);
  }
  return `${currencyMeta(currency).symbol}${body}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov" from an expense's date (or when it was logged). */
export function expenseDay(expense: TripExpense): string {
  const iso = expense.date ?? expense.createdAt;
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export const SPLIT_LABEL: Record<ExpenseSplitMode, string> = {
  none: 'Not split',
  equal: 'Split evenly',
  custom: 'Custom split',
};

export function splitLabel(mode: ExpenseSplitMode | undefined): string {
  return SPLIT_LABEL[mode ?? 'none'];
}

export function payerName(expense: TripExpense, participants: TripParticipant[]): string {
  if (!expense.paidBy) return '';
  const payer = participants.find((participant) => participant._id === expense.paidBy);
  return payer?.name ?? '';
}

/** The amount actually charged, shown in the base currency. */
export function baseAmountOf(expense: TripExpense): number {
  const base = Number(expense.amountInBase);
  if (Number.isFinite(base) && base > 0) return base;
  return Number(expense.amount) || 0;
}

export interface PersonBalance {
  participantId: string;
  name: string;
  paid: number;
  share: number;
  net: number;
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
}

const toCents = (value: number): number => Math.round((Number(value) || 0) * 100);
const fromCents = (value: number): number => Math.round(value) / 100;

/** Each traveller's paid / share / net, mirroring the web ledger. */
export function computeBalances(
  expenses: TripExpense[],
  participants: TripParticipant[]
): PersonBalance[] {
  const paidCents = new Map<string, number>();
  const shareCents = new Map<string, number>();
  const names = new Map<string, string>();

  for (const participant of participants) {
    names.set(participant._id, participant.name);
    paidCents.set(participant._id, 0);
    shareCents.set(participant._id, 0);
  }

  for (const expense of expenses) {
    const amountCents = toCents(baseAmountOf(expense));
    const payer = expense.paidBy;

    if (payer) {
      paidCents.set(payer, (paidCents.get(payer) ?? 0) + amountCents);
      if (!shareCents.has(payer)) shareCents.set(payer, 0);
    }

    const shares = expense.shares ?? [];
    if (expense.splitMode === 'none' || shares.length === 0) {
      if (payer) shareCents.set(payer, (shareCents.get(payer) ?? 0) + amountCents);
      continue;
    }

    for (const share of shares) {
      if (!share.participantId) continue;
      shareCents.set(
        share.participantId,
        (shareCents.get(share.participantId) ?? 0) + toCents(share.amount)
      );
    }
  }

  const ids = new Set([...paidCents.keys(), ...shareCents.keys()]);

  return Array.from(ids)
    .map((participantId) => ({
      participantId,
      name: names.get(participantId) ?? 'Someone',
      paid: fromCents(paidCents.get(participantId) ?? 0),
      share: fromCents(shareCents.get(participantId) ?? 0),
      net: fromCents((paidCents.get(participantId) ?? 0) - (shareCents.get(participantId) ?? 0)),
    }))
    .sort((a, b) => b.net - a.net);
}

/** Greedy debt simplification — at most `travellers - 1` payments. */
export function settleTransfers(balances: PersonBalance[]): SettlementTransfer[] {
  const creditors = balances
    .filter((balance) => toCents(balance.net) > 0)
    .map((balance) => ({ id: balance.participantId, cents: toCents(balance.net) }))
    .sort((a, b) => b.cents - a.cents);
  const debtors = balances
    .filter((balance) => toCents(balance.net) < 0)
    .map((balance) => ({ id: balance.participantId, cents: -toCents(balance.net) }))
    .sort((a, b) => b.cents - a.cents);

  const transfers: SettlementTransfer[] = [];
  let debtor = 0;
  let creditor = 0;

  while (debtor < debtors.length && creditor < creditors.length) {
    const from = debtors[debtor];
    const to = creditors[creditor];
    const cents = Math.min(from.cents, to.cents);
    if (cents > 0) transfers.push({ from: from.id, to: to.id, amount: fromCents(cents) });
    from.cents -= cents;
    to.cents -= cents;
    if (from.cents <= 0) debtor += 1;
    if (to.cents <= 0) creditor += 1;
  }

  return transfers;
}
