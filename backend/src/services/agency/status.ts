import Agency from '../../models/Agency.js';

/** Tenant kill-switch check shared by realm guards and trip access. */
export async function isAgencyActive(agencyId: unknown): Promise<boolean> {
  if (!agencyId) return false;
  const agency = await Agency.findById(String(agencyId)).select('status').lean();
  return Boolean(agency && agency.status === 'active');
}
