import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AppError } from '../utils/AppError.js';
import { parseQuery } from '../utils/parseQuery.js';
import { moderationQuerySchema } from '../schemas/platformModeration.schema.js';
import type { ReportTargetType } from '../models/TripReport.js';
import {
  listReportedContent,
  resolveReportedContent,
} from '../services/platform/moderation.js';

/**
 * Platform moderation console (Milestone 8 G6), mounted at `/api/admin`.
 *
 * Every handler runs behind the platform kill switch, `protectPlatform` and the
 * super-admin guard from the router. The listing is reported content only, so
 * this is not a back door into the personal trip directory.
 */

function clientContext(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  };
}

function targetTypeOf(value: unknown): ReportTargetType {
  if (value === 'trip' || value === 'profile') return value;
  throw new AppError('Unknown moderation target.', 400);
}

/** GET /api/admin/reports?status=open|hidden|dismissed&limit=50 */
export const listReports = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(moderationQuerySchema, req.query);
    const result = await listReportedContent(query);
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/admin/reports/:targetType/:targetId/hide — de-list and close. */
export const hideReportedContent = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await resolveReportedContent({
      actorId: String(req.userId),
      targetType: targetTypeOf(req.params.targetType),
      targetId: String(req.params.targetId),
      action: 'hide',
      client: clientContext(req),
    });
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/admin/reports/:targetType/:targetId/dismiss — close and restore. */
export const dismissReportedContent = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await resolveReportedContent({
      actorId: String(req.userId),
      targetType: targetTypeOf(req.params.targetType),
      targetId: String(req.params.targetId),
      action: 'dismiss',
      client: clientContext(req),
    });
    res.status(200).json({ success: true, ...result });
  }
);
