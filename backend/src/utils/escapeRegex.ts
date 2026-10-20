/**
 * Escapes regular-expression metacharacters in user input.
 *
 * Dashboard search is a literal title search. Interpolating the raw query into
 * `new RegExp(...)` let a user inject arbitrary patterns (and a pathological
 * one could make MongoDB work far harder than the request suggests). Views are
 * still built with `$regex`, but the pattern can now only match its own text.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
