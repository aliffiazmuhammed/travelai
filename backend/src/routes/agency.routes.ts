import { Router } from 'express';
import { requireAgencyWorkspace } from '../middleware/agencyWorkspace.middleware.js';

/**
 * Agency Workspace API namespace (A0).
 *
 * This router is intentionally read-only. A1 adds the Agency/AgencyMember
 * models and the tenancy guards; until then there is no endpoint that can
 * create, mutate or delete an agency trip.
 *
 * The feature gate is checked per request, so disabling the flag is an
 * immediate kill switch: the whole namespace answers 404.
 */
const router = Router();

router.get('/status', requireAgencyWorkspace, (_req, res) => {
  res.json({
    success: true,
    workspace: 'agency',
    milestone: 'A0',
    writesEnabled: false,
  });
});

export default router;
