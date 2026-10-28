import { Router } from 'express';
import { postReport } from '../controllers/reports.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { reportCreateLimiter } from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createReportSchema } from '../schemas/gallery.schema.js';

/**
 * Public-content safety reports (Milestone 8 G6).
 *
 * Reporting requires a personal account so the queue has an accountable
 * reporter, and the daily limiter bounds brigading. The target is re-checked
 * server-side; the client cannot make a private draft reportable.
 */
const router = Router();

router.post('/', protectPersonal, reportCreateLimiter, validate(createReportSchema), postReport);

export default router;
