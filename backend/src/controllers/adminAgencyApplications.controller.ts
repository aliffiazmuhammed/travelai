import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { parseQuery } from '../utils/parseQuery.js';
import {
  agencyApplicationListQuerySchema,
  rejectAgencyApplicationSchema,
} from '../schemas/agencyApplications.schema.js';
import * as applications from '../services/platform/applications.js';

/**
 * Platform review of public agency applications (PA6), mounted at `/api/admin`.
 *
 * Approval reuses the provisioning primitive, so it returns the same one-time
 * password contract: the value is in the response once and must be handed to
 * the agency by the admin. Rejection keeps the row and an internal note; the
 * applicant is never contacted by the server.
 */

function clientContext(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  };
}

/** GET /api/admin/applications?status=&q=&page=&limit= */
export const listApplications = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(agencyApplicationListQuerySchema, req.query);
    const result = await applications.listAgencyApplications(query);
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/admin/applications/:id/approve — provision the tenant. */
export const approveApplication = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await applications.approveAgencyApplication(
      req.params.id,
      String(req.userId),
      clientContext(req)
    );
    res.status(200).json({
      success: true,
      message: result.provision.temporaryPassword
        ? 'Approved and provisioned. The owner temporary password is shown once; share it securely.'
        : 'Approved. The existing workspace account was attached as owner.',
      ...result,
    });
  }
);

/** POST /api/admin/applications/:id/reject — keep the row, record the reason. */
export const rejectApplication = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = rejectAgencyApplicationSchema.parse(req.body ?? {});
    const application = await applications.rejectAgencyApplication(
      req.params.id,
      String(req.userId),
      body,
      clientContext(req)
    );
    res.status(200).json({ success: true, application });
  }
);
