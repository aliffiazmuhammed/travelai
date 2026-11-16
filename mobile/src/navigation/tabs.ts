import { router } from 'expo-router';

import type { NavTab } from '@/ui';

const TAB_HREF: Record<NavTab, '/' | '/trips' | '/profile'> = {
  explore: '/',
  trips: '/trips',
  profile: '/profile',
};

/** Navigate between shell tabs without stacking a new copy of each screen. */
export function goToTab(tab: NavTab): void {
  router.navigate(TAB_HREF[tab]);
}

export function goToCreate(): void {
  router.navigate('/create');
}
