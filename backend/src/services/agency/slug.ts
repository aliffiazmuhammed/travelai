/**
 * Agency workspace slug (PA0).
 *
 * The slug is the tenant's public login handle (`/agency/login?workspace=...`).
 * It is generated once at provisioning and never changes; these helpers are
 * shared by the migration script and the PA3 provisioning service.
 */

export const AGENCY_SLUG_MIN = 3;
export const AGENCY_SLUG_MAX = 40;

/** Lowercases, strips accents and collapses everything else to dashes. */
export function slugifyAgencyName(name: unknown): string {
  const normalized = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, AGENCY_SLUG_MAX)
    .replace(/-+$/g, '');

  return normalized.length >= AGENCY_SLUG_MIN ? normalized : '';
}

/**
 * Allocates a unique slug from a name. Collisions get a numeric suffix
 * (`acme`, `acme-2`, `acme-3`, ...). The suffix is counted inside the 40-char
 * limit so the result is always schema-valid.
 */
export function allocateAgencySlug(
  name: unknown,
  taken: Iterable<string> = []
): string {
  const used = new Set(Array.from(taken, (slug) => String(slug).toLowerCase()));
  const base = slugifyAgencyName(name) || 'agency';

  if (!used.has(base)) return base;

  for (let suffixNumber = 2; ; suffixNumber += 1) {
    const suffix = `-${suffixNumber}`;
    const trimmed = base
      .slice(0, AGENCY_SLUG_MAX - suffix.length)
      .replace(/-+$/g, '');
    const candidate = `${trimmed}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
