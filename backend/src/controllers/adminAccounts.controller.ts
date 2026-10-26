import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';
import { parseQuery } from '../utils/parseQuery.js';
import {
  accountListQuerySchema,
  createPlatformAccountSchema,
  updatePlatformAccountSchema,
} from '../schemas/platformAccounts.schema.js';
import * as accounts from '../services/platform/accounts.js';

/**
 * Platform account directory (PA2), mounted at `/api/admin`.
 *
 * Every handler runs behind `PLATFORM_ADMIN_ENABLED`, `protectPlatform` and the
 * forced-password gate. Responses contain identity metadata and platform audit
 * only — never tenant trips, clients, quotes or exports.
 */

function clientContext(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
  };
}

/** GET /api/admin/overview — realm and agency counts plus latest audit. */
export const overview = catchAsync(
  async (_req: AuthenticatedRequest, res: Response) => {
    const result = await accounts.getAdminOverview();
    res.status(200).json({ success: true, ...result });
  }
);

/** GET /api/admin/accounts?q=&realm=&status=&page=&limit= */
export const listAccounts = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(accountListQuerySchema, req.query);
    const result = await accounts.listAccounts(query);
    res.status(200).json({ success: true, ...result });
  }
);

/** GET /api/admin/accounts/:id — identity, memberships and recent audit. */
export const accountDetail = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const account = await accounts.getAccountDetail(String(req.params.id));
    res.status(200).json({ success: true, account });
  }
);

/** PATCH /api/admin/accounts/:id/status — disable or enable one account. */
export const updateAccountStatus = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await accounts.setAccountStatus({
      actorId: String(req.userId),
      accountId: String(req.params.id),
      status: req.body.status,
      client: clientContext(req),
    });
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/admin/accounts/:id/reset-password — agency temporary password. */
export const resetAccountPassword = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await accounts.resetAgencyPassword({
      actorId: String(req.userId),
      accountId: String(req.params.id),
      client: clientContext(req),
    });
    res.status(200).json({
      success: true,
      message:
        'Temporary workspace password issued. Share it securely; it can only be shown once.',
      ...result,
    });
  }
);

/** GET /api/admin/platform-accounts?q=&status=&page=&limit= */
export const listPlatformAccounts = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const query = parseQuery(accountListQuerySchema, req.query);
    const result = await accounts.listPlatformAccounts(query);
    res.status(200).json({ success: true, ...result });
  }
);

/** POST /api/admin/platform-accounts — create another super-admin. */
export const createPlatformAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = createPlatformAccountSchema.parse(req.body);
    const result = await accounts.createPlatformAccount({
      actorId: String(req.userId),
      email: body.email,
      name: body.name,
      client: clientContext(req),
    });
    res.status(201).json({
      success: true,
      message:
        'Platform super-admin created. The temporary password is shown once; share it securely.',
      ...result,
    });
  }
);

/** PATCH /api/admin/platform-accounts/:id — enable/disable or rename. */
export const updatePlatformAccount = catchAsync(
  async (req: AuthenticatedRequest, res: Response) => {
    const body = updatePlatformAccountSchema.parse(req.body);
    const result = await accounts.updatePlatformAccount({
      actorId: String(req.userId),
      accountId: String(req.params.id),
      status: body.status,
      name: body.name,
      client: clientContext(req),
    });
    res.status(200).json({ success: true, ...result });
  }
);
