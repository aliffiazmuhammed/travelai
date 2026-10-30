import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { GalleryTripSummary } from '@/types/gallery';
import type { PublicEventSummary } from '@/types/events';

export interface LandingDiscovery {
  trips: GalleryTripSummary[];
  events: PublicEventSummary[];
  tripTotal: number;
  eventTotal: number;
  loading: boolean;
}

const PREVIEW_SIZE = 3;

/**
 * What the homepage shows above the fold: a few recent shared trips and the
 * next events, plus their totals. Both listings are public projections, so a
 * signed-out visitor gets the same answer. Each call fails on its own — one
 * empty strip must not take the other down with it.
 */
export function useLandingDiscovery(): LandingDiscovery {
  const [state, setState] = useState<LandingDiscovery>({
    trips: [],
    events: [],
    tripTotal: 0,
    eventTotal: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api
        .getExplore({ limit: PREVIEW_SIZE })
        .then((page) => ({
          trips: page.trips,
          total: Number(page.total ?? 0),
        }))
        .catch(() => ({ trips: [], total: 0 })),
      api
        .getPublicEvents({ limit: PREVIEW_SIZE })
        .then((page) => ({
          events: page.events,
          total: Number(page.total ?? 0),
        }))
        .catch(() => ({ events: [], total: 0 })),
    ]).then(([tripsPage, eventsPage]) => {
      if (cancelled) return;
      setState({
        trips: tripsPage.trips,
        events: eventsPage.events,
        tripTotal: tripsPage.total,
        eventTotal: eventsPage.total,
        loading: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
