/**
 * Country-aware phone numbers.
 *
 * Numbers are stored in E.164 (`+<dial><national>`); the national significant
 * number must match the digit length for its country. The table is deliberately
 * a short list of common travel markets rather than every ITU allocation, so an
 * unsupported country is refused instead of being validated by guesswork. The
 * frontend keeps the same table in `frontend/src/lib/phone.ts`; both sides must
 * move together.
 */
export type PhoneCountry = {
  iso: string;
  name: string;
  dial: string;
  lengths: number[];
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'IN', name: 'India', dial: '91', lengths: [10] },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', lengths: [9] },
  { iso: 'AR', name: 'Argentina', dial: '54', lengths: [10] },
  { iso: 'AU', name: 'Australia', dial: '61', lengths: [9] },
  { iso: 'BD', name: 'Bangladesh', dial: '880', lengths: [10] },
  { iso: 'BE', name: 'Belgium', dial: '32', lengths: [9] },
  { iso: 'BR', name: 'Brazil', dial: '55', lengths: [10, 11] },
  { iso: 'CA', name: 'Canada', dial: '1', lengths: [10] },
  { iso: 'CH', name: 'Switzerland', dial: '41', lengths: [9] },
  { iso: 'CL', name: 'Chile', dial: '56', lengths: [9] },
  { iso: 'CN', name: 'China', dial: '86', lengths: [11] },
  { iso: 'CO', name: 'Colombia', dial: '57', lengths: [10] },
  { iso: 'CZ', name: 'Czechia', dial: '420', lengths: [9] },
  { iso: 'DE', name: 'Germany', dial: '49', lengths: [10, 11] },
  { iso: 'DK', name: 'Denmark', dial: '45', lengths: [8] },
  { iso: 'EG', name: 'Egypt', dial: '20', lengths: [10] },
  { iso: 'ES', name: 'Spain', dial: '34', lengths: [9] },
  { iso: 'FI', name: 'Finland', dial: '358', lengths: [9, 10] },
  { iso: 'FR', name: 'France', dial: '33', lengths: [9] },
  { iso: 'GB', name: 'United Kingdom', dial: '44', lengths: [9, 10] },
  { iso: 'GR', name: 'Greece', dial: '30', lengths: [10] },
  { iso: 'HK', name: 'Hong Kong', dial: '852', lengths: [8] },
  { iso: 'ID', name: 'Indonesia', dial: '62', lengths: [9, 10, 11, 12] },
  { iso: 'IE', name: 'Ireland', dial: '353', lengths: [9] },
  { iso: 'IT', name: 'Italy', dial: '39', lengths: [9, 10, 11] },
  { iso: 'JP', name: 'Japan', dial: '81', lengths: [10] },
  { iso: 'KE', name: 'Kenya', dial: '254', lengths: [9] },
  { iso: 'KR', name: 'South Korea', dial: '82', lengths: [9, 10] },
  { iso: 'LK', name: 'Sri Lanka', dial: '94', lengths: [9] },
  { iso: 'MA', name: 'Morocco', dial: '212', lengths: [9] },
  { iso: 'MU', name: 'Mauritius', dial: '230', lengths: [8] },
  { iso: 'MV', name: 'Maldives', dial: '960', lengths: [7] },
  { iso: 'MX', name: 'Mexico', dial: '52', lengths: [10] },
  { iso: 'MY', name: 'Malaysia', dial: '60', lengths: [9, 10] },
  { iso: 'NL', name: 'Netherlands', dial: '31', lengths: [9] },
  { iso: 'NO', name: 'Norway', dial: '47', lengths: [8] },
  { iso: 'NP', name: 'Nepal', dial: '977', lengths: [10] },
  { iso: 'NZ', name: 'New Zealand', dial: '64', lengths: [8, 9, 10] },
  { iso: 'PH', name: 'Philippines', dial: '63', lengths: [10] },
  { iso: 'PK', name: 'Pakistan', dial: '92', lengths: [10] },
  { iso: 'PL', name: 'Poland', dial: '48', lengths: [9] },
  { iso: 'PT', name: 'Portugal', dial: '351', lengths: [9] },
  { iso: 'QA', name: 'Qatar', dial: '974', lengths: [8] },
  { iso: 'RU', name: 'Russia', dial: '7', lengths: [10] },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', lengths: [9] },
  { iso: 'SE', name: 'Sweden', dial: '46', lengths: [9] },
  { iso: 'SG', name: 'Singapore', dial: '65', lengths: [8] },
  { iso: 'TH', name: 'Thailand', dial: '66', lengths: [9] },
  { iso: 'TR', name: 'Türkiye', dial: '90', lengths: [10] },
  { iso: 'US', name: 'United States', dial: '1', lengths: [10] },
  { iso: 'VN', name: 'Vietnam', dial: '84', lengths: [9, 10] },
  { iso: 'ZA', name: 'South Africa', dial: '27', lengths: [9] },
];

export const PHONE_FORMAT_MESSAGE =
  'Enter a valid phone number with its country code, for example +91 98765 43210.';

const BY_LONGEST_DIAL = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dial.length - a.dial.length
);

export type ParsedPhone = {
  country: PhoneCountry;
  national: string;
  e164: string;
};

function matchesLength(country: PhoneCountry, national: string): boolean {
  return country.lengths.includes(national.length);
}

/**
 * Parses a formatted E.164 number. Spaces, brackets, dots and dashes are
 * ignored; a national trunk `0` is dropped when the number is one digit too
 * long, which is how most countries write local numbers.
 */
export function parsePhoneNumber(value: unknown): ParsedPhone | null {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+\d{7,15}$/.test(compact)) return null;

  for (const country of BY_LONGEST_DIAL) {
    const prefix = `+${country.dial}`;
    if (!compact.startsWith(prefix)) continue;
    let national = compact.slice(prefix.length);
    if (!national) continue;
    if (!matchesLength(country, national) && national.startsWith('0')) {
      national = national.replace(/^0+/, '');
    }
    if (!matchesLength(country, national)) continue;
    return { country, national, e164: `${prefix}${national}` };
  }
  return null;
}

export function isPhoneNumber(value: string): boolean {
  return parsePhoneNumber(value) !== null;
}

/** Returns the canonical E.164 value, or null when the number is invalid. */
export function canonicalPhone(value: unknown): string | null {
  return parsePhoneNumber(value)?.e164 ?? null;
}
