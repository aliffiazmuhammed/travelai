import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Agency Workspace feature gate (A0).
 *
 * The agency API namespace is dark by default. While
 * `AGENCY_WORKSPACE_ENABLED` is false, every route under `/api/agency`
 * answers 404 exactly like an unknown path, so the half-built B2B surface is
 * not advertised and cannot be probed for future endpoints.
 *
 * The tag is asserted by `src/routes/agency.routes.test.ts`: a new agency route
 * that forgets this guard fails CI.
 */
export const AGENCY_WORKSPACE_GUARD_TAG = Symbol.for('travelai.requireAgencyWorkspace');

export function createAgencyWorkspaceGuard(isEnabled: boolean) {
  const guard = (_req: Request, res: Response, next: NextFunction) => {
    if (!isEnabled) {
      return res.status(404).json({
        success: false,
        error: 'Not found',
        message: 'Not found',
      });
    }
    return next();
  };

  return Object.assign(guard, {
    [AGENCY_WORKSPACE_GUARD_TAG]: true,
  });
}

export const requireAgencyWorkspace = createAgencyWorkspaceGuard(
  env.AGENCY_WORKSPACE_ENABLED
);
