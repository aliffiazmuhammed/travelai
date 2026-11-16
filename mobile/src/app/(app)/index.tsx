import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
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
import { tripCoverUrl } from '@/lib/tripCover';
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

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: active ? `${palette.primary}12` : palette.card,
          borderColor: active ? palette.primary : palette.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <AppText variant="label" tone={active ? 'primary' : 'default'}>
        {label}
      </AppText>
      <Ionicons
        name="chevron-down"
        size={13}
        color={active ? palette.primary : palette.mutedForeground}
      />
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
  const [sheet, setSheet] = useState<'duration' | 'group' | null>(null);

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

  const stories = useMemo(() => {
    const seen = new Set<string>();
    return trips
      .flatMap((trip) => {
        const label = (trip.destination || trip.title).split(',')[0].trim();
        const key = label.toLowerCase();
        if (!label || seen.has(key)) return [];
        seen.add(key);
        return [{ label, cover: tripCoverUrl(trip.destination || trip.title, 200) }];
      })
      .slice(0, 8);
  }, [trips]);

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
            <AppText variant="title" tone="primary" style={styles.wordmark}>
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

          <View style={styles.hero}>
            <AppText variant="caption" tone="muted" style={styles.eyebrow}>
              TRAVEL, TOGETHER
            </AppText>
            <AppText variant="display">Find a trip you’d like to join.</AppText>
            <AppText tone="muted">
              Real trips, shared by the people who planned them. Join one that is still ahead, or
              borrow a finished plan and make it yours.
            </AppText>
          </View>

          <View style={styles.controls}>
            <SearchBar value={searchInput} onChangeText={setSearchInput} />
            <PillTabs items={WHEN_TABS} value={when} onChange={setWhen} />
            <View style={styles.filterRow}>
              <FilterChip
                label={DURATION_LABEL_BY_VALUE.get(duration) ?? 'Any length'}
                active={Boolean(duration)}
                onPress={() => setSheet('duration')}
              />
              <FilterChip
                label={groupType || 'Anyone'}
                active={Boolean(groupType)}
                onPress={() => setSheet('group')}
              />
              {hasFilters ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={resetFilters}
                  hitSlop={8}
                  style={({ pressed }) => [styles.reset, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <AppText variant="label" tone="muted">
                    Reset
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </View>

          {stories.length >= 2 ? (
            <View style={styles.stories}>
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                WHERE PEOPLE ARE GOING
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storyRow}
              >
                {stories.map((story) => (
                  <Pressable
                    key={story.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Show trips to ${story.label}`}
                    onPress={() => setSearchInput(story.label)}
                    style={({ pressed }) => [styles.story, { opacity: pressed ? 0.75 : 1 }]}
                  >
                    <View style={[styles.storyRing, { borderColor: palette.card }]}>
                      <Image
                        source={{ uri: story.cover }}
                        style={styles.storyImage}
                        contentFit="cover"
                        transition={200}
                      />
                    </View>
                    <AppText variant="caption" numberOfLines={1} style={styles.storyLabel}>
                      {story.label}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View
            style={styles.results}
            onLayout={(event) => {
              resultsOffset.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.resultsHeader}>
              <AppText variant="title">{isPast ? 'Plans to borrow' : 'Trips to join'}</AppText>
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
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                AGENCIES
              </AppText>
              <AppText variant="title">Let a local expert plan it</AppText>
              <AppText tone="muted">
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
        visible={sheet === 'duration'}
        title="How long?"
        options={DURATION_OPTIONS}
        value={duration}
        onSelect={(next) => setDuration(next as GalleryDuration | '')}
        onClose={() => setSheet(null)}
      />
      <FilterSheet
        visible={sheet === 'group'}
        title="Who's going?"
        options={GROUP_OPTIONS}
        value={groupType}
        onSelect={setGroupType}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { letterSpacing: -0.4 },
  avatarButton: { borderRadius: radius.pill },
  hero: { gap: space.sm },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  controls: { gap: space.md },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filterChip: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  reset: { paddingHorizontal: space.sm, paddingVertical: 6 },
  stories: { gap: space.md },
  storyRow: { gap: space.lg, paddingVertical: 2 },
  story: { width: 72, alignItems: 'center', gap: 6 },
  storyRing: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    borderWidth: 3,
    overflow: 'hidden',
  },
  storyImage: { width: '100%', height: '100%' },
  storyLabel: { maxWidth: 72, textAlign: 'center' },
  results: { gap: space.lg },
  resultsHeader: { gap: 2 },
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
