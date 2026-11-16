import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from 'react-native';

import {
  fetchAgencies,
  fetchExplore,
  type ExploreWhen,
  type GalleryDuration,
} from '@/api/explore';
import { useSession } from '@/auth/SessionProvider';
import { AgencyCard } from '@/components/AgencyCard';
import { FilterSheet } from '@/components/FilterSheet';
import { TripCard, TripCardSkeleton } from '@/components/TripCard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { DURATION_LABELS } from '@/lib/galleryFormat';
import { goToCreate, goToTab } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
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

const WHEN_TABS: readonly PillTabItem<ExploreWhen>[] = [
  { key: 'live', label: 'Live trips', icon: 'compass-outline' },
  { key: 'past', label: 'Finished trips', icon: 'time-outline' },
];

const DURATION_OPTIONS = [
  { value: '', label: 'Any length' },
  { value: 'short', label: DURATION_LABELS.short },
  { value: 'week', label: DURATION_LABELS.week },
  { value: 'fortnight', label: DURATION_LABELS.fortnight },
  { value: 'long', label: DURATION_LABELS.long },
] as const;

const GROUP_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'Solo', label: 'Solo' },
  { value: 'Couple', label: 'Couple' },
  { value: 'Friends', label: 'Friends' },
  { value: 'Family', label: 'Family' },
] as const;

const DURATION_LABEL_BY_VALUE = new Map(
  DURATION_OPTIONS.map((option) => [option.value, option.label])
);

function FilterButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? 'Filters, some applied' : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        {
          backgroundColor: palette.card,
          borderColor: active ? palette.primary : palette.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons
        name="options-outline"
        size={20}
        color={active ? palette.primary : palette.foreground}
      />
      {active ? (
        <View style={[styles.filterDot, { backgroundColor: palette.accent }]} />
      ) : null}
    </Pressable>
  );
}

export default function ExploreScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const router = useRouter();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const resultsOffset = useRef(0);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput.trim(), 350);
  const [when, setWhen] = useState<ExploreWhen>('live');
  const [duration, setDuration] = useState<GalleryDuration | ''>('');
  const [groupType, setGroupType] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Page N only means something for the filters that produced it, so any filter
  // change falls back to page one until the user pages again.
  const filtersKey = [when, search, duration, groupType].join('|');
  const [position, setPosition] = useState({ key: filtersKey, page: 1 });
  const page = position.key === filtersKey ? position.page : 1;

  const tripsQuery = useQuery({
    queryKey: ['explore', when, search, duration, groupType, page],
    queryFn: () =>
      fetchExplore({
        q: search || undefined,
        duration: duration || undefined,
        groupType: groupType || undefined,
        when,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const agenciesQuery = useQuery({
    queryKey: ['agencies', 'explore-strip'],
    queryFn: () => fetchAgencies(6),
  });

  const tripsData = tripsQuery.data?.trips;
  const trips = useMemo(() => tripsData ?? [], [tripsData]);
  const total = tripsQuery.data?.total ?? 0;
  const hasMore = tripsQuery.data?.hasMore ?? false;
  const isPast = when === 'past';
  const hasFilters = Boolean(search || duration || groupType);
  const agencies = agenciesQuery.data ?? [];
  const activeFilterLabels = [
    duration ? DURATION_LABEL_BY_VALUE.get(duration) : null,
    groupType || null,
  ].filter((label): label is string => Boolean(label));

  const goToPage = (nextPage: number) => {
    setPosition({ key: filtersKey, page: nextPage });
    scrollRef.current?.scrollTo({ y: Math.max(resultsOffset.current - 12, 0), animated: true });
  };

  const resetFilters = () => {
    setSearchInput('');
    setDuration('');
    setGroupType('');
  };

  const errorMessage = tripsQuery.isError
    ? tripsQuery.error instanceof Error && tripsQuery.error.message
      ? tripsQuery.error.message
      : "We couldn't load shared trips right now."
    : null;

  return (
    <View style={styles.root}>
      <Screen
        scroll
        scrollRef={scrollRef}
        refreshing={tripsQuery.isRefetching && !tripsQuery.isPending}
        onRefresh={() => {
          tripsQuery.refetch();
          agenciesQuery.refetch();
        }}
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
              <Avatar name={user?.name || user?.email || 'You'} size={36} />
            </Pressable>
          </View>

          <View style={styles.intro}>
            <AppText variant="title">Find your next trip.</AppText>
            <AppText variant="caption" tone="muted">
              Real trips, shared by real travellers.
            </AppText>
          </View>

          <View style={styles.controls}>
            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <SearchBar value={searchInput} onChangeText={setSearchInput} />
              </View>
              <FilterButton
                active={activeFilterLabels.length > 0}
                onPress={() => setFiltersOpen(true)}
              />
            </View>
            <PillTabs items={WHEN_TABS} value={when} onChange={setWhen} />
            {activeFilterLabels.length > 0 ? (
              <View style={styles.activeFilters}>
                <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.activeText}>
                  {activeFilterLabels.join(' · ')}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear filters"
                  onPress={() => {
                    setDuration('');
                    setGroupType('');
                  }}
                  hitSlop={8}
                >
                  <AppText variant="caption" tone="primary">
                    Clear
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View
            style={styles.results}
            onLayout={(event) => {
              resultsOffset.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.resultsHeader}>
              <AppText variant="label">{isPast ? 'Plans to borrow' : 'Trips to join'}</AppText>
              {tripsQuery.data ? (
                <AppText variant="caption" tone="muted">
                  {total} shared {total === 1 ? 'trip' : 'trips'}
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

            {tripsQuery.isPending ? (
              <>
                <TripCardSkeleton />
                <TripCardSkeleton />
              </>
            ) : null}

            {!tripsQuery.isPending && !errorMessage && trips.length === 0 ? (
              <Card style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
                  <Ionicons name="compass-outline" size={24} color={palette.primary} />
                </View>
                <AppText variant="heading">Nothing matches that yet</AppText>
                <AppText tone="muted">
                  Try a nearby place or widen the dates — people share new plans every week.
                </AppText>
                {hasFilters ? (
                  <Button
                    label="Reset filters"
                    variant="secondary"
                    size="sm"
                    onPress={resetFilters}
                  />
                ) : null}
              </Card>
            ) : null}

            {!tripsQuery.isPending && !errorMessage
              ? trips.map((trip) => (
                  <TripCard
                    key={trip._id}
                    trip={trip}
                    past={isPast}
                    onPress={() =>
                      router.push({ pathname: '/trip/[id]', params: { id: trip._id } })
                    }
                  />
                ))
              : null}

            {!tripsQuery.isPending && !errorMessage && (page > 1 || hasMore) ? (
              <View style={styles.pager}>
                <Button
                  label="Previous"
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onPress={() => goToPage(page - 1)}
                />
                <AppText variant="caption" tone="muted">
                  Page {page}
                </AppText>
                <Button
                  label="Next"
                  variant="secondary"
                  size="sm"
                  disabled={!hasMore}
                  onPress={() => goToPage(page + 1)}
                />
              </View>
            ) : null}
          </View>

          {agencies.length > 0 ? (
            <View style={styles.agencies}>
              <AppText variant="heading">Let a local expert plan it</AppText>
              <AppText variant="caption" tone="muted">
                Small teams and travel companies with published plans.
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.agencyRow}
              >
                {agencies.map((agency) => (
                  <AgencyCard key={agency.slug} agency={agency} />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Screen>

      <NavShell
        active="explore"
        onSelect={(tab) => {
          if (tab === 'explore') {
            scrollRef.current?.scrollTo({ y: 0, animated: true });
            return;
          }
          goToTab(tab);
        }}
        onCreatePress={goToCreate}
      />

      <FilterSheet
        visible={filtersOpen}
        title="Filters"
        sections={[
          { key: 'duration', label: 'How long?', options: DURATION_OPTIONS, value: duration },
          { key: 'group', label: 'Who’s going?', options: GROUP_OPTIONS, value: groupType },
        ]}
        onChange={(key, value) => {
          if (key === 'duration') setDuration(value as GalleryDuration | '');
          else setGroupType(value);
        }}
        onReset={() => {
          setDuration('');
          setGroupType('');
        }}
        onClose={() => setFiltersOpen(false)}
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  searchField: { flex: 1 },
  filterButton: {
    width: 50,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  activeText: { flex: 1 },
  results: { gap: space.lg },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
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
  agencies: { gap: space.sm },
  agencyRow: { gap: space.md, paddingVertical: 2, paddingRight: space.xs },
});
