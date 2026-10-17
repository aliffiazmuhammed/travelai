import { z } from 'zod';
import { AppError } from './AppError.js';

/**
 * Validates and coerces query-string parameters.
 *
 * The shared `validate` middleware only inspects `req.body`, and Express keeps
 * `req.query` read-only, so GET endpoints parse their parameters explicitly
 * here and receive a typed, coerced object. Throws a friendly 400 on failure.
 */
export function parseQuery<S extends z.ZodTypeAny>(schema: S, query: unknown): z.infer<S> {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    const first = result.error.issues[0];
    throw new AppError(first?.message || 'Please check the request parameters.', 400);
  }
  return result.data;
}
