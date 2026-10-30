import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { submitAgencyApplicationSchema } from '../schemas/agencyApplications.schema.js';
import { submitAgencyApplication } from '../services/platform/applications.js';

/**
 * Public "join as an agency" write (PA6).
 *
 * Anonymous by design: no session, no account, no tenant. The applicant gets a
 * single receipt and nothing else — approval happens in the console and the
 * admin reaches out at the email or phone they supplied.
 */
export const submitAgencyApplicationHandler = catchAsync(
  async (req: Request, res: Response) => {
    const body = submitAgencyApplicationSchema.parse(req.body);
    const receipt = await submitAgencyApplication(body);
    res.status(201).json({
      success: true,
      message: 'Application received. A real person reads every one.',
      ...receipt,
    });
  }
);
