import { Router } from 'express';
import {
  getDirectoryFacets,
  getPublicAgencyLogo,
  getPublicAgencyProfile,
  getPublicPackageCover,
  listPublicAgencies,
} from '../controllers/directory.controller.js';
import { createAgencyEnquiryHandler } from '../controllers/enquiries.controller.js';
import { attachPersonalIfPresent } from '../middleware/auth.middleware.js';
import {
  enquiryAgencyLimiter,
  enquiryEmailLimiter,
  enquiryIpLimiter,
  publicDirectoryLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createAgencyEnquirySchema } from '../schemas/agencyEnquiry.schema.js';

/**
 * Public agency directory (Milestone 9 D1/D3/D4/D5).
 *
 * Deliberately outside both realm guards: there is no session to resolve and
 * no tenant role to check. Every payload is the directory projection, which
 * withholds tenant internals and any contact detail the agency did not opt
 * into. `/facets` is registered before `/:slug` so it is never read as a page
 * slug, and package covers sit beside the logo as slug-addressed bytes.
 *
 * D5 adds the one anonymous write. It is guarded by three daily buckets (IP,
 * email, agency) and an *optional* personal identity — never a required one.
 */
const router = Router();

router.get('/', publicDirectoryLimiter, listPublicAgencies);
router.get('/facets', publicDirectoryLimiter, getDirectoryFacets);
router.get('/:slug/logo', publicDirectoryLimiter, getPublicAgencyLogo);
router.get(
  '/:slug/packages/:packageId/cover',
  publicDirectoryLimiter,
  getPublicPackageCover
);
router.post(
  '/:slug/enquiries',
  enquiryIpLimiter,
  enquiryEmailLimiter,
  enquiryAgencyLimiter,
  validate(createAgencyEnquirySchema),
  attachPersonalIfPresent,
  createAgencyEnquiryHandler
);
router.get('/:slug', publicDirectoryLimiter, getPublicAgencyProfile);

export default router;
