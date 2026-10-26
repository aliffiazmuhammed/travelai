import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Platform admin feature gate (PA1).
 *
 * `/api/admin/*` is dark by default. While `PLATFORM_ADMIN_ENABLED` is false the
 * whole namespace answers 404 exactly like an unknown path, so the internal
 * surface cannot be enumerated before rollout. The SPA learns the same state
 * from the public health payload and never renders the admin shell.
 *
 * Every admin router must register this guard first. The exported tag lets a
 * coverage test assert that a newly mounted admin route cannot silently skip it.
 */
export const PLATFORM_ADMIN_GUARD_TAG = Symbol.for('travelai.requirePlatformAdmin');

export function createPlatformAdminGuard(isEnabled: boolean) {
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
    [PLATFORM_ADMIN_GUARD_TAG]: true,
  });
}

export const requirePlatformAdmin = createPlatformAdminGuard(
  env.PLATFORM_ADMIN_ENABLED
);
