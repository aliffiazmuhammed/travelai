import PlatformAudit from '../../models/PlatformAudit.js';

/**
 * Platform audit foundation (PA1).
 *
 * Writes are best effort: an audit failure must never turn a successful admin
 * action into an error for the operator, but it is surfaced in server logs so
 * the gap is visible. Metadata is sanitized here rather than at the call site,
 * because every future admin action will reuse this writer.
 */

/** Case-insensitive key fragments that must never reach the audit collection. */
const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|hash|authorization|cookie|api[-_]?key|otp|salt|credential/i;

const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

export type AuditMetadata = Record<string, unknown>;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'bigint') return value.toString();

  // Never serialise a function, symbol or class instance by accident.
  if (typeof value !== 'object') return undefined;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  const source = value as Record<string, unknown>;
  const result: AuditMetadata = {};
  for (const [key, entry] of Object.entries(source).slice(0, MAX_KEYS)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeValue(entry, depth + 1);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

/**
 * Returns a plain, JSON-safe copy of admin audit metadata with secret-shaped
 * keys removed, strings capped and nesting bounded. Unknown top-level shapes
 * are ignored instead of stored.
 */
export function sanitizeAuditMetadata(value: unknown): AuditMetadata | undefined {
  const sanitized = sanitizeValue(value, 0);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return undefined;
  }
  return Object.keys(sanitized).length > 0 ? (sanitized as AuditMetadata) : undefined;
}

export interface RecordPlatformAuditInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: unknown;
  ip?: string;
  userAgent?: string;
}

/** Best-effort append-only write; failures are logged, never thrown. */
export async function recordPlatformAudit(
  input: RecordPlatformAuditInput
): Promise<void> {
  try {
    await PlatformAudit.create({
      actorId: input.actorId,
      action: input.action.slice(0, 80),
      targetType: input.targetType.slice(0, 40),
      targetId: input.targetId?.slice(0, 120),
      metadata: sanitizeAuditMetadata(input.metadata),
      ip: input.ip?.slice(0, 64),
      userAgent: input.userAgent?.slice(0, 300),
    });
  } catch (error) {
    console.warn('Could not write platform audit event:', error);
  }
}
