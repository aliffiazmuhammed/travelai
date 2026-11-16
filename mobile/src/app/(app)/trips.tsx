import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { fetchMyTrips, type MyTripSummary } from '@/api/trips';
import { useSession } from '@/auth/SessionProvider';
import { TripLibraryCard, TripLibraryCardSkeleton } from '@/components/TripLibraryCard';
import {
  matchesTripTab,
  sortMyTrips,
  tripSearchText,
  type TripTab,
} from '@/lib/personalTrip';
import { goToCreate, goToTab } from '@/navigation/tabs';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  InlineError,
  NAV_BOTTOM_SPACE,
  NavShell,
  PillTabs,
  Screen,
  SearchBar,
  type PillTabItem,
} from '@/ui';

const PAGE_SIZE = 8;

const TABS: readonly PillTabItem<TripTab>[] = [
  { key: 'upcoming', label: 'Coming up', icon: 'calendar-outline' },
  { key: 'drafts', label: 'Drafts', icon: 'create-outline' },
  { key: 'past', label: 'Past', icon: 'time-outline' },
];

const RESULT_LABEL: Record<TripTab, string> = {
  upcoming: 'On the horizon',
  drafts: 'Still taking shape',
  past: 'Trips behind you',
};

const EMPTY_COPY: Record<TripTab, { title: string; body: string }> = {
  upcoming: {
    title: 'Nothing coming up just yet',
    body: 'Plan a trip or ask to join one, and it will land here with its dates in view.',
  },
  drafts: {
    title: 'No drafts waiting',
    body: 'A trip you start but are not ready to schedule will wait here until you are.',
  },
  past: {
    title: 'No past trips yet',
    body: 'Once a trip wraps up and is marked completed, it moves here so the road ahead stays clear.',
  },
};

type Row = { trip: MyTripSummary; shared: boolean };

export default function TripsScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const resultsOffset = useRef(0);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TripTab>('upcoming');

  const tripsQuery = useQuery({
    queryKey: ['my-trips'],
    queryFn: fetchMyTrips,
  });

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = (tripsQuery.data ?? [])
      .filter((trip) => matchesTripTab(trip.status, tab))
      .filter((trip) => (query ? tripSearchText(trip).includes(query) : true));

    const owned = sortMyTrips(
      matching.filter((trip) => !trip.role || trip.role === 'owner'),
      tab
    );
    const shared = sortMyTrips(
      matching.filter((trip) => trip.role && trip.role !== 'owner'),
      tab
    );

    return {
      owned,
      shared,
      all: [...owned, ...shared],
    };
  }, [tripsQuery.data, tab, search]);

  const listKey = (nextTab: TripTab, nextSearch: string) => `${nextTab}|${nextSearch}`;
  const [position, setPosition] = useState({ key: listKey('upcoming', ''), page: 1 });
  const activeKey = listKey(tab, search);
  const pageCount = Math.max(1, Math.ceil(groups.all.length / PAGE_SIZE));
  const page = Math.min(position.key === activeKey ? position.page : 1, pageCount);

  // Browsers and lists both behave this way: a new filter starts from the top.
  const changeTab = (next: TripTab) => {
    setTab(next);
    setPosition({ key: listKey(next, search), page: 1 });
  };
  const changeSearch = (next: string) => {
    setSearch(next);
    setPosition({ key: listKey(tab, next), page: 1 });
  };

  const pageRows: Row[] = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return groups.all.slice(start, start + PAGE_SIZE).map((trip) => ({
      trip,
      shared: Boolean(trip.role && trip.role !== 'owner'),
    }));
  }, [groups.all, page]);

  const visibleOwned = pageRows.filter((row) => !row.shared);
  const visibleShared = pageRows.filter((row) => row.shared);
  const hasShared = groups.shared.length > 0;
  const hasQuery = search.trim().length > 0;
  const pending = tripsQuery.isPending;
  const errorMessage = tripsQuery.isError
    ? tripsQuery.error instanceof Error
      ? tripsQuery.error.message
      : "We couldn't load your trips right now."
    : null;

  const goToPage = (next: number) => {
    setPosition({ key: activeKey, page: next });
    scrollRef.current?.scrollTo({ y: Math.max(resultsOffset.current - 12, 0), animated: true });
  };

  const renderRow = (row: Row) => (
    <TripLibraryCard
      key={row.trip._id}
      trip={row.trip}
      shared={row.shared}
      onPress={() =>
        router.push({ pathname: '/my-trip/[id]', params: { id: row.trip._id } })
      }
    />
  );

  return (
    <View style={styles.root}>
      <Screen
        scroll
        scrollRef={scrollRef}
        refreshing={tripsQuery.isRefetching && !tripsQuery.isPending}
        onRefresh={() => tripsQuery.refetch()}
        contentContainerStyle={{ paddingTop: space.sm, paddingBottom: NAV_BOTTOM_SPACE + space.xl }}
      >
        <View style={styles.page}>
          <View style={styles.topRow}>
            <AppText variant="heading" tone="primary" style={styles.wordmark}>
              waytowalk
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              onPress={() => goToTab('profile')}
              style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Avatar name={user?.name || user?.email || 'You'} size={36} uri={user?.avatarUrl} />
            </Pressable>
          </View>

          <View style={styles.intro}>
            <AppText variant="title">The plans you’re part of.</AppText>
            <AppText variant="caption" tone="muted">
              Shaping, going, or already behind you.
            </AppText>
          </View>

          <View style={styles.controls}>
            <SearchBar
              value={search}
              onChangeText={changeSearch}
              placeholder="Search your trips"
              accessibilityLabel="Search your trips"
            />
            <PillTabs items={TABS} value={tab} onChange={changeTab} />
          </View>

          <View
            style={styles.results}
            onLayout={(event) => {
              resultsOffset.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.resultsHeader}>
              <AppText variant="label">{RESULT_LABEL[tab]}</AppText>
              {tripsQuery.data ? (
                <AppText variant="caption" tone="muted">
                  {groups.all.length} {groups.all.length === 1 ? 'trip' : 'trips'}
                </AppText>
              ) : null}
            </View>

            {errorMessage ? (
              <View style={styles.errorBlock}>
                <InlineError message={errorMessage} />
                <Button
                  label="Try again"
                  variant="secondary"
                  size="sm"
                  onPress={() => tripsQuery.refetch()}
                />
              </View>
            ) : null}

            {pending ? (
              <>
                <TripLibraryCardSkeleton />
                <TripLibraryCardSkeleton />
                <TripLibraryCardSkeleton />
              </>
            ) : null}

            {!pending && !errorMessage && groups.all.length === 0 ? (
              <Card style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
                  <Ionicons
                    name={tab === 'past' ? 'time-outline' : 'map-outline'}
                    size={24}
                    color={palette.primary}
                  />
                </View>
                <AppText variant="heading">
                  {hasQuery ? 'No trips match that' : EMPTY_COPY[tab].title}
                </AppText>
                <AppText tone="muted">
                  {hasQuery
                    ? 'Try a different name, place or month.'
                    : EMPTY_COPY[tab].body}
                </AppText>
                {hasQuery ? (
                  <Button
                    label="Clear search"
                    variant="secondary"
                    size="sm"
                    onPress={() => changeSearch('')}
                  />
                ) : (
                  <Button
                    label="Plan a trip"
                    variant="secondary"
                    size="sm"
                    onPress={goToCreate}
                  />
                )}
              </Card>
            ) : null}

            {!pending && !errorMessage && visibleOwned.length > 0 ? (
              <View style={styles.group}>
                {hasShared ? (
                  <AppText variant="caption" tone="muted" style={styles.groupLabel}>
                    YOURS
                  </AppText>
                ) : null}
                {visibleOwned.map(renderRow)}
              </View>
            ) : null}

            {!pending && !errorMessage && visibleShared.length > 0 ? (
              <View style={styles.group}>
                <AppText variant="caption" tone="muted" style={styles.groupLabel}>
                  SHARED WITH YOU
                </AppText>
                {visibleShared.map(renderRow)}
              </View>
            ) : null}

            {!pending && !errorMessage && pageCount > 1 ? (
              <View style={styles.pager}>
                <Button
                  label="Previous"
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onPress={() => goToPage(page - 1)}
                />
                <AppText variant="caption" tone="muted">
                  Page {page} of {pageCount}
                </AppText>
                <Button
                  label="Next"
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount}
                  onPress={() => goToPage(page + 1)}
                />
              </View>
            ) : null}
          </View>
        </View>
      </Screen>

      <NavShell
        active="trips"
        onSelect={(next) => {
          if (next === 'trips') {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            return;
          }
          goToTab(next);
        }}
        onCreatePress={goToCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { letterSpacing: -0.4 },
  avatarButton: { borderRadius: radius.pill },
  intro: { gap: 2 },
  controls: { gap: space.md },
  results: { gap: space.lg },
  resultsHeader: { gap: 2 },
  group: { gap: space.md },
  groupLabel: { fontFamily: fontFamily.semibold, letterSpacing: 1.2, fontSize: 10 },
  errorBlock: { gap: space.md, alignItems: 'flex-start' },
  empty: { alignItems: 'flex-start', gap: space.sm },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
