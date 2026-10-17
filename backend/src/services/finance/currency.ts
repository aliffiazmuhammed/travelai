/**
 * Currency conversion (Milestone 5 — Budget & Financial).
 *
 * Rate semantics used throughout the app: a rate for currency `X` is the value
 * of **one unit of X expressed in the trip's base currency** (e.g. with base
 * INR, `rates.USD = 85.5`). This matches `ITripExpense.exchangeRate`, so
 * `amountInBase = amount * rate` holds everywhere.
 *
 * Rates come from Frankfurter (ECB reference rates, no API key) with a 12-hour
 * in-memory cache. The pure helpers are unit-tested independently of the network.
 */

export const DEFAULT_BASE_CURRENCY = 'INR';

export interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
}

/** Currencies published by the ECB (the set Frankfurter can quote). */
export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'ILS', name: 'Israeli New Shekel', symbol: '₪' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
];

const CURRENCY_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.has(String(code || '').toUpperCase());
}

export function currencyMeta(code: string): CurrencyMeta | undefined {
  const upper = String(code || '').toUpperCase();
  return SUPPORTED_CURRENCIES.find((c) => c.code === upper);
}

const round6 = (n: number): number => Math.round((Number(n) || 0) * 1e6) / 1e6;

/**
 * Inverts a "1 base = X units of code" map into the app's base-per-unit form
 * ("1 unit of code = X base"). Non-positive or non-finite entries are dropped.
 */
export function invertRates(perBaseRates: Record<string, number>): Record<string, number> {
  const inverted: Record<string, number> = {};
  for (const [code, perBase] of Object.entries(perBaseRates || {})) {
    const value = Number(perBase);
    if (Number.isFinite(value) && value > 0) {
      inverted[code] = round6(1 / value);
    }
  }
  return inverted;
}

/**
 * Converts an amount from `currency` into the base currency.
 * Returns `null` when a required rate is missing or invalid.
 */
export function convertToBase(
  amount: number,
  currency: string,
  baseCurrency: string,
  basePerUnitRates: Record<string, number> | undefined
): number | null {
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;

  const from = String(currency || '').toUpperCase();
  const base = String(baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase();
  if (from === base) return Math.round(value * 100) / 100;

  const rate = Number(basePerUnitRates?.[from]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(value * rate * 100) / 100;
}

export interface RateSnapshot {
  base: string;
  provider: string;
  updatedAt: string;
  /** Base-per-unit rates, excluding the base currency itself. */
  rates: Record<string, number>;
  /** True when the live provider was unavailable and a cached/snapshot value was used. */
  stale?: boolean;
}

const DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const FETCH_TIMEOUT_MS = 6000;

function cacheTtlMs(): number {
  const raw = Number(process.env.CURRENCY_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

function providerName(): string {
  return (process.env.CURRENCY_RATES_PROVIDER || 'frankfurter').trim().toLowerCase();
}

const rateCache = new Map<string, { expiresAt: number; snapshot: RateSnapshot }>();

/** Returns a non-expired cached snapshot for the given base, if any. */
export function getCachedRates(base: string): RateSnapshot | undefined {
  const key = String(base || DEFAULT_BASE_CURRENCY).toUpperCase();
  const entry = rateCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    rateCache.delete(key);
    return undefined;
  }
  return entry.snapshot;
}

/** Clears the in-memory rate cache (used by tests and manual refresh). */
export function clearRatesCache(): void {
  rateCache.clear();
}

/**
 * Fetches base-per-unit rates for `symbols` (defaults to every supported
 * currency except the base). Results are cached for `CURRENCY_CACHE_TTL_MS`.
 */
export async function fetchBasePerUnitRates(
  base: string,
  symbols?: string[]
): Promise<RateSnapshot> {
  const baseCode = String(base || DEFAULT_BASE_CURRENCY).toUpperCase();
  const cached = getCachedRates(baseCode);
  if (cached) return cached;

  const requested = (symbols && symbols.length
    ? symbols
    : SUPPORTED_CURRENCIES.map((c) => c.code)
  )
    .map((code) => String(code).toUpperCase())
    .filter((code) => code && code !== baseCode && CURRENCY_CODES.has(code));

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(
    baseCode
  )}&to=${encodeURIComponent(requested.join(','))}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Rate provider responded with ${response.status}`);
    }
    const data: any = await response.json();
    const snapshot: RateSnapshot = {
      base: baseCode,
      provider: providerName(),
      updatedAt: new Date().toISOString(),
      rates: invertRates(data?.rates || {}),
    };
    rateCache.set(baseCode, { expiresAt: Date.now() + cacheTtlMs(), snapshot });
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}
