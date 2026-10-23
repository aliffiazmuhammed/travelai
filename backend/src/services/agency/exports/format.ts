/**
 * Deterministic formatting for rendered documents. The server's locale must
 * not leak into a customer PDF, so dates use UTC and money picks a fixed
 * locale per currency.
 */

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function exportCurrency(value: unknown): string {
  const currency = String(value ?? '').trim().toUpperCase();
  return CURRENCY_PATTERN.test(currency) ? currency : 'INR';
}

export function formatExportMoney(amount: unknown, currency: unknown): string {
  const parsed = Number(amount);
  const safeAmount = Number.isFinite(parsed) ? parsed : 0;
  const code = exportCurrency(currency);
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function exportDateIso(value: unknown): string | null {
  const date = toValidDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

export function formatExportDate(value: unknown): string {
  const date = toValidDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatExportDateRange(start: unknown, end: unknown): string {
  const from = toValidDate(start);
  const to = toValidDate(end);
  if (!from && !to) return 'Dates flexible';
  if (!from) return `Until ${formatExportDate(to)}`;
  if (!to) return `From ${formatExportDate(from)}`;
  return `${formatExportDate(from)} - ${formatExportDate(to)}`;
}

export function addDaysUtc(value: unknown, days: number): Date | null {
  const date = toValidDate(value);
  if (!date || !Number.isFinite(days)) return null;
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
