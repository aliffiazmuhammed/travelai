import type { AgencyRole } from './access.js';
import { getAgencyTripOverview, type AgencyTripOverview } from './trips.js';
import {
  getAgencyEventOverview,
  type AgencyEventOverview,
} from '../events/agencyEvents.js';
import {
  getAgencyEnquirySummary,
  type AgencyEnquirySummaryView,
} from '../directory/enquiries.js';

/**
 * The agency Overview reads three small summaries instead of the whole trip and
 * event libraries (C-26). Counts are computed in the database, so a tenant with
 * 800 trips still answers with three rows and three numbers.
 */
export interface AgencyOverviewSummary {
  enquiries: AgencyEnquirySummaryView;
  trips: AgencyTripOverview;
  events: AgencyEventOverview;
}

export async function getAgencyOverview(input: {
  agencyId: string;
  role: AgencyRole;
}): Promise<AgencyOverviewSummary> {
  const [enquiries, trips, events] = await Promise.all([
    getAgencyEnquirySummary(input.agencyId),
    getAgencyTripOverview(input.agencyId, input.role),
    getAgencyEventOverview(input.agencyId),
  ]);
  return { enquiries, trips, events };
}
