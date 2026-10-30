import { NextFunction, Request, Response, Router } from 'express';
import { env } from '../config/env.js';
import { submitAgencyApplicationHandler } from '../controllers/agencyApplications.controller.js';
import {
  agencyApplicationEmailLimiter,
  agencyApplicationIpLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { submitAgencyApplicationSchema } from '../schemas/agencyApplications.schema.js';

/**
 * Public agency applications (PA6), mounted at `/api/agency-applications`.
 *
 * Anonymous and write-only: there is no listing, no status lookup and no
 * session — one POST creates a pending row for a platform admin to review.
 *
 * Intake is tied to the console. With `PLATFORM_ADMIN_ENABLED` off there is
 * nobody who can review an application, so the route answers 503 instead of
 * accepting a request that would never be read. The SPA reads the same flag
 * from the public health payload and shows a closed state before the form.
 */
const router = Router();

function applicationsOpen(_req: Request, res: Response, next: NextFunction) {
  if (!env.PLATFORM_ADMIN_ENABLED) {
    return res.status(503).json({
      success: false,
      error: 'Agency applications are closed right now.',
      message: 'Agency applications are closed right now.',
    });
  }
  return next();
}

router.post(
  '/',
  applicationsOpen,
  agencyApplicationIpLimiter,
  agencyApplicationEmailLimiter,
  validate(submitAgencyApplicationSchema),
  submitAgencyApplicationHandler
);

export default router;
