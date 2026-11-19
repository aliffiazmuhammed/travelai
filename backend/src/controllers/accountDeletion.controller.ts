import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  getOpenAccountDeletionRequest,
  requestAccountDeletion,
} from '../services/auth/deletionRequests.js';

const RECEIVED =
  "Your request is in. We'll reply by email within two business days. Nothing is removed until we confirm with you.";
const ALREADY_OPEN =
  "You already have an open deletion request. We'll reply by email — you keep full access until then.";

/** POST /api/auth/account-deletion-request — queue a request; delete nothing. */
export const createAccountDeletionRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await requestAccountDeletion(
      String(req.userId),
      req.body?.reason,
      { ip: req.ip, userAgent: req.get('user-agent') ?? undefined }
    );

    res.status(result.alreadyRequested ? 200 : 202).json({
      success: true,
      alreadyRequested: result.alreadyRequested,
      message: result.alreadyRequested ? ALREADY_OPEN : RECEIVED,
      request: result.request,
    });
  }
);

/** GET /api/auth/account-deletion-request — the caller's open request. */
export const getAccountDeletionRequest = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const request = await getOpenAccountDeletionRequest(String(req.userId));
    res.status(200).json({ success: true, request });
  }
);
