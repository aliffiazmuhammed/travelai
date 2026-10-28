import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import {
  blockUser,
  listBlocks,
  unblockUser,
} from '../services/gallery/joinRequests.js';

/**
 * Personal block list (Milestone 8 G5).
 *
 * Blocks are one-way and account-scoped: nothing here takes a trip id, and the
 * blocked account is never notified. The router keeps every route behind
 * `protectPersonal`, so an agency or platform session cannot read or write a
 * personal block list.
 */

/** GET /api/blocks — everyone the caller has blocked, newest first. */
export const getBlocks = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const blocks = await listBlocks(String(req.userId));
    res.status(200).json({ success: true, blocks });
  }
);

/** POST /api/blocks/:userId — block (idempotent) and clear pending requests. */
export const postBlock = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const block = await blockUser(
      String(req.userId),
      String(req.params.userId),
      req.body?.reason
    );
    res.status(201).json({ success: true, block });
  }
);

/** DELETE /api/blocks/:userId — idempotent unblock. */
export const deleteBlock = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await unblockUser(String(req.userId), String(req.params.userId));
    res.status(200).json({ success: true, ...result });
  }
);
