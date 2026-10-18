import { QueryClient } from '@tanstack/react-query';

/**
 * App-wide React Query client, exported so the auth context can clear the
 * cache when the identity changes (Milestone 6 flaw F21): without this, a
 * logout→login as a different user keeps the previous user's trips/tokens in
 * memory. Trip queries opt into focus-refetch in E4 (flaw F10).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});
