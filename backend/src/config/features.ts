/**
 * Feature flags (Agency Workspace A0).
 *
 * Flags fail closed: only an explicit truthy value enables a code path. This
 * matters for the agency namespace, which must remain dark until the tenancy
 * and authorization layer lands in A1.
 */
const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'on']);

export function parseBooleanFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}
