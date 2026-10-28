import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { createReport } from '../services/gallery/reports.js';

/**
 * Safety reports (Milestone 8 G6).
 *
 * Personal realm only: reporting is an account action, so an agency or
 * platform session cannot write here, and no route reveals a reporter identity.
 * The response says whether the threshold hid the content, but never who else
 * reported it.
 */

/** POST /api/reports — flag a published trip or traveler profile. */
export const postReport = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await createReport({
      reporterId: String(req.userId),
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      reason: req.body.reason,
      note: req.body.note,
    });
    res.status(201).json({ success: true, ...result });
  }
);
