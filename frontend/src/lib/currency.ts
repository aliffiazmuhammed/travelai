/**
 * Client-side currency helpers (mirror of `backend/src/services/finance/currency.ts`).
 *
 * A rate for currency `X` is the value of **one unit of X in the trip's base
 * currency**, matching `TripExpense.exchangeRate` so `amountInBase = amount * rate`.
 */

import type { CurrencyMeta } from "@/types/trip";

export const DEFAULT_BASE_CURRENCY = "INR";

/** Currencies the ECB (and therefore Frankfurter) can quote. */
export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$" },
];

export function currencyMeta(code: string | undefined): CurrencyMeta {
  const upper = String(code || DEFAULT_BASE_CURRENCY).toUpperCase();
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === upper) ?? {
      code: upper,
      name: upper,
      symbol: upper,
    }
  );
}

/**
 * Converts an amount into the base currency. Returns `null` when the required
 * rate is unavailable.
 */
export function convertToBase(
  amount: number,
  currency: string,
  baseCurrency: string,
  basePerUnitRates?: Record<string, number>
): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;

  const from = String(currency || "").toUpperCase();
  const base = String(baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();
  if (from === base) return Math.round(value * 100) / 100;

  const rate = Number(basePerUnitRates?.[from]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(value * rate * 100) / 100;
}

/** Formats an amount with the currency's symbol (falls back to a plain string). */
export function formatMoney(amount: number, currency = DEFAULT_BASE_CURRENCY): string {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currencyMeta(currency).symbol}${Math.round(value).toLocaleString("en-IN")}`;
  }
}
