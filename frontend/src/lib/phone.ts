/**
 * Country-aware phone numbers.
 *
 * The backend stores E.164 (`+<dial><national>`). This table is the frontend
 * mirror of `backend/src/utils/phone.ts` and must be kept in step; a number is
 * accepted only when its national part matches the country's digit length.
 */
export type PhoneCountry = {
  iso: string;
  name: string;
  dial: string;
  lengths: number[];
  example: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'IN', name: 'India', dial: '91', lengths: [10], example: '98765 43210' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', lengths: [9], example: '50 123 4567' },
  { iso: 'AR', name: 'Argentina', dial: '54', lengths: [10], example: '11 2345 6789' },
  { iso: 'AU', name: 'Australia', dial: '61', lengths: [9], example: '412 345 678' },
  { iso: 'BD', name: 'Bangladesh', dial: '880', lengths: [10], example: '1712 345678' },
  { iso: 'BE', name: 'Belgium', dial: '32', lengths: [9], example: '470 12 34 56' },
  { iso: 'BR', name: 'Brazil', dial: '55', lengths: [10, 11], example: '11 91234 5678' },
  { iso: 'CA', name: 'Canada', dial: '1', lengths: [10], example: '416 555 0123' },
  { iso: 'CH', name: 'Switzerland', dial: '41', lengths: [9], example: '78 123 45 67' },
  { iso: 'CL', name: 'Chile', dial: '56', lengths: [9], example: '9 6123 4567' },
  { iso: 'CN', name: 'China', dial: '86', lengths: [11], example: '138 1234 5678' },
  { iso: 'CO', name: 'Colombia', dial: '57', lengths: [10], example: '300 123 4567' },
  { iso: 'CZ', name: 'Czechia', dial: '420', lengths: [9], example: '601 123 456' },
  { iso: 'DE', name: 'Germany', dial: '49', lengths: [10, 11], example: '1512 3456789' },
  { iso: 'DK', name: 'Denmark', dial: '45', lengths: [8], example: '20 12 34 56' },
  { iso: 'EG', name: 'Egypt', dial: '20', lengths: [10], example: '100 123 4567' },
  { iso: 'ES', name: 'Spain', dial: '34', lengths: [9], example: '612 34 56 78' },
  { iso: 'FI', name: 'Finland', dial: '358', lengths: [9, 10], example: '41 2345678' },
  { iso: 'FR', name: 'France', dial: '33', lengths: [9], example: '6 12 34 56 78' },
  { iso: 'GB', name: 'United Kingdom', dial: '44', lengths: [9, 10], example: '7911 123456' },
  { iso: 'GR', name: 'Greece', dial: '30', lengths: [10], example: '691 234 5678' },
  { iso: 'HK', name: 'Hong Kong', dial: '852', lengths: [8], example: '9123 4567' },
  { iso: 'ID', name: 'Indonesia', dial: '62', lengths: [9, 10, 11, 12], example: '812 3456 7890' },
  { iso: 'IE', name: 'Ireland', dial: '353', lengths: [9], example: '85 123 4567' },
  { iso: 'IT', name: 'Italy', dial: '39', lengths: [9, 10, 11], example: '312 345 6789' },
  { iso: 'JP', name: 'Japan', dial: '81', lengths: [10], example: '90 1234 5678' },
  { iso: 'KE', name: 'Kenya', dial: '254', lengths: [9], example: '712 345678' },
  { iso: 'KR', name: 'South Korea', dial: '82', lengths: [9, 10], example: '10 1234 5678' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94', lengths: [9], example: '71 234 5678' },
  { iso: 'MA', name: 'Morocco', dial: '212', lengths: [9], example: '612 345 678' },
  { iso: 'MU', name: 'Mauritius', dial: '230', lengths: [8], example: '5251 2345' },
  { iso: 'MV', name: 'Maldives', dial: '960', lengths: [7], example: '771 2345' },
  { iso: 'MX', name: 'Mexico', dial: '52', lengths: [10], example: '55 1234 5678' },
  { iso: 'MY', name: 'Malaysia', dial: '60', lengths: [9, 10], example: '12 345 6789' },
  { iso: 'NL', name: 'Netherlands', dial: '31', lengths: [9], example: '6 12345678' },
  { iso: 'NO', name: 'Norway', dial: '47', lengths: [8], example: '912 34 567' },
  { iso: 'NP', name: 'Nepal', dial: '977', lengths: [10], example: '98 1234 5678' },
  { iso: 'NZ', name: 'New Zealand', dial: '64', lengths: [8, 9, 10], example: '21 123 4567' },
  { iso: 'PH', name: 'Philippines', dial: '63', lengths: [10], example: '917 123 4567' },
  { iso: 'PK', name: 'Pakistan', dial: '92', lengths: [10], example: '300 1234567' },
  { iso: 'PL', name: 'Poland', dial: '48', lengths: [9], example: '512 345 678' },
  { iso: 'PT', name: 'Portugal', dial: '351', lengths: [9], example: '912 345 678' },
  { iso: 'QA', name: 'Qatar', dial: '974', lengths: [8], example: '3312 3456' },
  { iso: 'RU', name: 'Russia', dial: '7', lengths: [10], example: '912 345 67 89' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', lengths: [9], example: '50 123 4567' },
  { iso: 'SE', name: 'Sweden', dial: '46', lengths: [9], example: '70 123 45 67' },
  { iso: 'SG', name: 'Singapore', dial: '65', lengths: [8], example: '8123 4567' },
  { iso: 'TH', name: 'Thailand', dial: '66', lengths: [9], example: '81 234 5678' },
  { iso: 'TR', name: 'Türkiye', dial: '90', lengths: [10], example: '532 123 4567' },
  { iso: 'US', name: 'United States', dial: '1', lengths: [10], example: '415 555 2671' },
  { iso: 'VN', name: 'Vietnam', dial: '84', lengths: [9, 10], example: '91 234 5678' },
  { iso: 'ZA', name: 'South Africa', dial: '27', lengths: [9], example: '71 123 4567' },
];

export const DEFAULT_PHONE_COUNTRY = 'IN';

export const PHONE_FORMAT_MESSAGE =
  'Enter a valid phone number with its country code, for example +91 98765 43210.';

const BY_LONGEST_DIAL = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dial.length - a.dial.length
);

export function getPhoneCountry(iso: string | null | undefined): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((country) => country.iso === iso) ??
    PHONE_COUNTRIES[0]
  );
}

function matchesLength(country: PhoneCountry, national: string): boolean {
  return country.lengths.includes(national.length);
}

function stripFormatting(value: string): string {
  return value.trim().replace(/[\s().-]/g, '');
}

export type ParsedPhone = {
  country: PhoneCountry;
  national: string;
  e164: string;
};

/** Parses a formatted E.164 number, dropping a national trunk zero. */
export function parsePhoneNumber(value: string | null | undefined): ParsedPhone | null {
  if (!value) return null;
  const compact = stripFormatting(value);
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

/**
 * Best-effort split of a stored number into a country and its national part.
 * Legacy values without a country code are treated as Indian numbers.
 */
export function splitPhone(value: string | null | undefined): {
  countryIso: string;
  national: string;
} {
  const parsed = parsePhoneNumber(value);
  if (parsed) {
    return { countryIso: parsed.country.iso, national: parsed.national };
  }
  const digits = (value ?? '').trim().replace(/[\s().-]/g, '').replace(/^\+/, '');
  return { countryIso: DEFAULT_PHONE_COUNTRY, national: digits };
}

/**
 * Validates the national part typed next to a country selector. A full E.164
 * value is accepted too, so pasting a number from a contact card works.
 */
export function validatePhone(
  countryIso: string,
  value: string,
  options: { required?: boolean } = {}
): string | null {
  const raw = value.trim();
  if (!raw) {
    return options.required === false ? null : 'Enter a phone number.';
  }
  if (raw.startsWith('+')) {
    return parsePhoneNumber(raw) ? null : PHONE_FORMAT_MESSAGE;
  }

  const country = getPhoneCountry(countryIso);
  let national = stripFormatting(raw);
  if (!/^\d+$/.test(national)) {
    return `Use digits only for the ${country.name} phone number.`;
  }
  if (national.startsWith('0')) national = national.replace(/^0+/, '');
  if (!matchesLength(country, national)) {
    const lengths = country.lengths.join(' or ');
    return `Enter a ${lengths}-digit phone number for ${country.name}.`;
  }
  return null;
}

/** Returns the canonical `+<dial><national>` value, or null when invalid. */
export function toE164(countryIso: string, value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const pasted = parsePhoneNumber(raw);
  if (pasted) return pasted.e164;

  const country = getPhoneCountry(countryIso);
  const national = stripFormatting(raw).replace(/^0+/, '');
  if (!/^\d+$/.test(national) || !matchesLength(country, national)) return null;
  return `+${country.dial}${national}`;
}

export function phonePlaceholder(countryIso: string): string {
  return getPhoneCountry(countryIso).example;
}
