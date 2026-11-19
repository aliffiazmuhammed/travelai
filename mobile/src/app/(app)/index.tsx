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
  fetchAgencyDirectory,
  fetchAgencyFacets,
  fetchExplore,
  type AgencyFacet,
  type ExploreWhen,
  type GalleryDuration,
} from '@/api/explore';
import { fetchPublicEvents } from '@/api/events';
import { useSession } from '@/auth/SessionProvider';
import { AgencyRowCard, AgencyRowSkeleton } from '@/components/AgencyCard';
import { EventCard, EventCardSkeleton } from '@/components/EventCard';
import { FilterSheet } from '@/components/FilterSheet';
import { TripRowCard, TripRowSkeleton } from '@/components/TripCard';
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
  SectionHeader,
  Segmented,
  type PillTabItem,
  type SegmentItem,
} from '@/ui';

const PAGE_SIZE = 8;
const AGENCY_PAGE_SIZE = 12;

type ExploreMode = 'trips' | 'agencies';

const MODE_TABS: readonly SegmentItem<ExploreMode>[] = [
  { key: 'trips', label: 'Trips' },
  { key: 'agencies', label: 'Agencies' },
];

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

function FilterPill({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const active = Boolean(value);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}: ${value}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        {
          backgroundColor: palette.card,
          borderColor: active ? palette.primary : palette.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <AppText
        variant="label"
        numberOfLines={1}
        style={[styles.filterPillText, { color: active ? palette.primary : palette.foreground }]}
      >
        {value || label}
      </AppText>
      <Ionicons
        name="chevron-down"
        size={14}
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [mode, setMode] = useState<ExploreMode>('trips');
  const [agencySearchInput, setAgencySearchInput] = useState('');
  const agencySearch = useDebouncedValue(agencySearchInput.trim(), 350);
  const [agencyCity, setAgencyCity] = useState('');
  const [agencySpecialty, setAgencySpecialty] = useState('');
  const [agencyLanguage, setAgencyLanguage] = useState('');
  const [agencyFiltersOpen, setAgencyFiltersOpen] = useState(false);
  const agencyResultsOffset = useRef(0);

  // Page N only means something for the filters that produced it, so any filter
  // change falls back to page one until the user pages again.
  const filtersKey = [when, search, duration, groupType].join('|');
  const [position, setPosition] = useState({ key: filtersKey, page: 1 });
  const page = position.key === filtersKey ? position.page : 1;

  const agencyFiltersKey = [agencySearch, agencyCity, agencySpecialty, agencyLanguage].join('|');
  const [agencyPosition, setAgencyPosition] = useState({
    key: agencyFiltersKey,
    index: 0,
    cursors: [undefined] as (string | undefined)[],
  });
  const agencyPos =
    agencyPosition.key === agencyFiltersKey
      ? agencyPosition
      : { key: agencyFiltersKey, index: 0, cursors: [undefined] as (string | undefined)[] };
  const agencyPage = agencyPos.index + 1;
  const agencyCursor = agencyPos.cursors[agencyPos.index];

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
    queryKey: [
      'agencies',
      'directory',
      agencySearch,
      agencyCity,
      agencySpecialty,
      agencyLanguage,
      agencyCursor ?? '',
    ],
    queryFn: () =>
      fetchAgencyDirectory({
        q: agencySearch || undefined,
        city: agencyCity || undefined,
        specialty: agencySpecialty || undefined,
        language: agencyLanguage || undefined,
        cursor: agencyCursor,
        limit: AGENCY_PAGE_SIZE,
      }),
    enabled: mode === 'agencies',
  });

  const facetsQuery = useQuery({
    queryKey: ['agencies', 'facets'],
    queryFn: fetchAgencyFacets,
    enabled: mode === 'agencies',
    staleTime: 5 * 60 * 1000,
  });

  const eventsQuery = useQuery({
    queryKey: ['events', 'upcoming'],
    queryFn: () => fetchPublicEvents(6),
    staleTime: 5 * 60 * 1000,
  });

  const tripsData = tripsQuery.data?.trips;
  const trips = useMemo(() => tripsData ?? [], [tripsData]);
  const total = tripsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasMore = tripsQuery.data?.hasMore ?? false;
  const isPast = when === 'past';
  const hasFilters = Boolean(search || duration || groupType);
  const events = eventsQuery.data?.events ?? [];
  const showEvents = mode === 'trips' && when === 'live' && !hasFilters && events.length > 0;
  const activeFilterLabels = [
    duration ? DURATION_LABEL_BY_VALUE.get(duration) : null,
    groupType || null,
  ].filter((label): label is string => Boolean(label));

  const agencies = agenciesQuery.data?.agencies ?? [];
  const agencyTotal = agenciesQuery.data?.total ?? 0;
  const agencyHasMore = agenciesQuery.data?.hasMore ?? false;
  const agencyTotalPages = Math.max(
    agencyPage,
    Math.ceil(agencyTotal / AGENCY_PAGE_SIZE)
  );
  const agencyFacetLabel = (list: AgencyFacet[] | undefined, value: string) =>
    list?.find((facet) => facet.value === value)?.label ?? value;
  const agencyActiveLabels = [
    agencyCity ? agencyFacetLabel(facetsQuery.data?.cities, agencyCity) : null,
    agencySpecialty ? agencyFacetLabel(facetsQuery.data?.specialties, agencySpecialty) : null,
    agencyLanguage ? agencyFacetLabel(facetsQuery.data?.languages, agencyLanguage) : null,
  ].filter((label): label is string => Boolean(label));
  const hasAgencyFilters = Boolean(
    agencySearch || agencyCity || agencySpecialty || agencyLanguage
  );
  const agencyOptions = (list: AgencyFacet[] | undefined, anyLabel: string) => [
    { value: '', label: anyLabel },
    ...(list ?? []).map((facet) => ({ value: facet.value, label: facet.label })),
  ];

  const goToPage = (nextPage: number) => {
    setPosition({ key: filtersKey, page: nextPage });
    scrollRef.current?.scrollTo({ y: Math.max(resultsOffset.current - 12, 0), animated: true });
  };

  const resetFilters = () => {
    setSearchInput('');
    setDuration('');
    setGroupType('');
  };

  const goToAgencyPage = (delta: number) => {
    if (delta > 0) {
      const next = agenciesQuery.data?.nextCursor;
      if (!next || !agencyHasMore) return;
      setAgencyPosition({
        key: agencyFiltersKey,
        index: agencyPos.index + 1,
        cursors: [...agencyPos.cursors.slice(0, agencyPos.index + 1), next],
      });
    } else {
      if (agencyPos.index === 0) return;
      setAgencyPosition({ ...agencyPos, index: agencyPos.index - 1 });
    }
    scrollRef.current?.scrollTo({
      y: Math.max(agencyResultsOffset.current - 12, 0),
      animated: true,
    });
  };

  const resetAgencyFilters = () => {
    setAgencySearchInput('');
    setAgencyCity('');
    setAgencySpecialty('');
    setAgencyLanguage('');
  };

  const errorMessage = tripsQuery.isError
    ? tripsQuery.error instanceof Error && tripsQuery.error.message
      ? tripsQuery.error.message
      : "We couldn't load shared trips right now."
    : null;

  const agencyErrorMessage = agenciesQuery.isError
    ? agenciesQuery.error instanceof Error && agenciesQuery.error.message
      ? agenciesQuery.error.message
      : "We couldn't load the agency directory right now."
    : null;

  const refreshing =
    mode === 'trips'
      ? tripsQuery.isRefetching && !tripsQuery.isPending
      : agenciesQuery.isRefetching && !agenciesQuery.isPending;

  return (
    <View style={styles.root}>
      <Screen
        scroll
        scrollRef={scrollRef}
        refreshing={refreshing}
        onRefresh={() => {
          if (mode === 'trips') {
            tripsQuery.refetch();
            eventsQuery.refetch();
          } else {
            agenciesQuery.refetch();
          }
        }}
        contentContainerStyle={{ paddingTop: space.sm, paddingBottom: NAV_BOTTOM_SPACE + space.xl }}
      >
        <View style={styles.page}>
          <View style={styles.topRow}>
            <AppText variant="wordmark" tone="primary">
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
            <AppText variant="display">Find your next trip.</AppText>
            <AppText variant="caption" tone="muted">
              Real trips, shared by real travellers.
            </AppText>
          </View>

          <Segmented
            accessibilityLabel="Browse trips or agencies"
            items={MODE_TABS}
            value={mode}
            onChange={setMode}
          />

          {mode === 'trips' ? (
            <>
              <View style={styles.controls}>
                <SearchBar value={searchInput} onChangeText={setSearchInput} />
                <PillTabs items={WHEN_TABS} value={when} onChange={setWhen} />
                <View style={styles.filterRow}>
                  <FilterPill
                    label="Duration"
                    value={duration ? DURATION_LABEL_BY_VALUE.get(duration) : undefined}
                    onPress={() => setFiltersOpen(true)}
                  />
                  <FilterPill
                    label="Group"
                    value={groupType || undefined}
                    onPress={() => setFiltersOpen(true)}
                  />
                </View>
                {activeFilterLabels.length > 0 ? (
                  <View style={styles.activeFilters}>
                    <AppText
                      variant="caption"
                      tone="muted"
                      numberOfLines={1}
                      style={styles.activeText}
                    >
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

              {when === 'live' && !hasFilters && eventsQuery.isPending ? (
                <View style={styles.events}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.eventRail}
                    scrollEnabled={false}
                  >
                    <EventCardSkeleton />
                    <EventCardSkeleton />
                  </ScrollView>
                </View>
              ) : showEvents ? (
                <View style={styles.events}>
                  <SectionHeader
                    title="On the calendar"
                    caption="Camps, retreats and group trips agencies are running."
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.eventRail}
                  >
                    {events.map((event) => (
                      <EventCard
                        key={event._id}
                        event={event}
                        onPress={() =>
                          router.push({ pathname: '/events/[id]', params: { id: event._id } })
                        }
                      />
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
                <SectionHeader
                  title={isPast ? 'Plans to borrow' : 'Trips to join'}
                  caption={
                    tripsQuery.data
                      ? `${total} shared ${total === 1 ? 'trip' : 'trips'}`
                      : undefined
                  }
                />

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
                      Page {page} of {totalPages}
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
                    <TripRowSkeleton />
                    <TripRowSkeleton />
                    <TripRowSkeleton />
                    <TripRowSkeleton />
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

                {!tripsQuery.isPending && !errorMessage && trips.length > 0 ? (
                  <View style={styles.list}>
                    {trips.map((trip) => (
                      <TripRowCard
                        key={trip._id}
                        trip={trip}
                        past={isPast}
                        onPress={() =>
                          router.push({ pathname: '/trip/[id]', params: { id: trip._id } })
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.controls}>
                <SearchBar
                  value={agencySearchInput}
                  onChangeText={setAgencySearchInput}
                  placeholder="Search local experts"
                  accessibilityLabel="Search travel agencies"
                />
                <View style={styles.filterRow}>
                  <FilterPill
                    label="City"
                    value={
                      agencyCity
                        ? agencyFacetLabel(facetsQuery.data?.cities, agencyCity)
                        : undefined
                    }
                    onPress={() => setAgencyFiltersOpen(true)}
                  />
                  <FilterPill
                    label="Speciality"
                    value={
                      agencySpecialty
                        ? agencyFacetLabel(facetsQuery.data?.specialties, agencySpecialty)
                        : undefined
                    }
                    onPress={() => setAgencyFiltersOpen(true)}
                  />
                  <FilterPill
                    label="Language"
                    value={
                      agencyLanguage
                        ? agencyFacetLabel(facetsQuery.data?.languages, agencyLanguage)
                        : undefined
                    }
                    onPress={() => setAgencyFiltersOpen(true)}
                  />
                </View>
                {agencyActiveLabels.length > 0 ? (
                  <View style={styles.activeFilters}>
                    <AppText
                      variant="caption"
                      tone="muted"
                      numberOfLines={1}
                      style={styles.activeText}
                    >
                      {agencyActiveLabels.join(' · ')}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear agency filters"
                      onPress={() => {
                        setAgencyCity('');
                        setAgencySpecialty('');
                        setAgencyLanguage('');
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
                  agencyResultsOffset.current = event.nativeEvent.layout.y;
                }}
              >
                <SectionHeader
                  title="Local experts"
                  caption={
                    agenciesQuery.data
                      ? `${agencyTotal} ${agencyTotal === 1 ? 'agency' : 'agencies'}`
                      : undefined
                  }
                />

                {!agenciesQuery.isPending &&
                !agencyErrorMessage &&
                (agencyPage > 1 || agencyHasMore) ? (
                  <View style={styles.pager}>
                    <Button
                      label="Previous"
                      variant="ghost"
                      size="sm"
                      disabled={agencyPage <= 1}
                      onPress={() => goToAgencyPage(-1)}
                    />
                    <AppText variant="caption" tone="muted">
                      Page {agencyPage} of {agencyTotalPages}
                    </AppText>
                    <Button
                      label="Next"
                      variant="secondary"
                      size="sm"
                      disabled={!agencyHasMore}
                      onPress={() => goToAgencyPage(1)}
                    />
                  </View>
                ) : null}

                {agencyErrorMessage ? (
                  <View style={styles.errorBlock}>
                    <InlineError message={agencyErrorMessage} />
                    <Button
                      label="Try again"
                      variant="secondary"
                      size="sm"
                      onPress={() => agenciesQuery.refetch()}
                    />
                  </View>
                ) : null}

                {agenciesQuery.isPending ? (
                  <>
                    <AgencyRowSkeleton />
                    <AgencyRowSkeleton />
                    <AgencyRowSkeleton />
                    <AgencyRowSkeleton />
                  </>
                ) : null}

                {!agenciesQuery.isPending &&
                !agencyErrorMessage &&
                agencies.length === 0 ? (
                  <Card style={styles.empty}>
                    <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
                      <Ionicons name="briefcase-outline" size={24} color={palette.primary} />
                    </View>
                    <AppText variant="heading">No experts match that yet</AppText>
                    <AppText tone="muted">
                      Try another city or clear a filter — the directory grows every week.
                    </AppText>
                    {hasAgencyFilters ? (
                      <Button
                        label="Reset filters"
                        variant="secondary"
                        size="sm"
                        onPress={resetAgencyFilters}
                      />
                    ) : null}
                  </Card>
                ) : null}

                {!agenciesQuery.isPending &&
                !agencyErrorMessage &&
                agencies.length > 0 ? (
                  <View style={styles.list}>
                    {agencies.map((agency) => (
                      <AgencyRowCard
                        key={agency.slug}
                        agency={agency}
                        onPress={() =>
                          router.push({
                            pathname: '/agency/[slug]',
                            params: { slug: agency.slug },
                          })
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </>
          )}
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
        title="Trip filters"
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

      <FilterSheet
        visible={agencyFiltersOpen}
        title="Agency filters"
        confirmLabel="Show agencies"
        sections={[
          {
            key: 'city',
            label: 'Where are they based?',
            options: agencyOptions(facetsQuery.data?.cities, 'Anywhere in India'),
            value: agencyCity,
          },
          {
            key: 'specialty',
            label: 'What are they good at?',
            options: agencyOptions(facetsQuery.data?.specialties, 'Any speciality'),
            value: agencySpecialty,
          },
          {
            key: 'language',
            label: 'Which language?',
            options: agencyOptions(facetsQuery.data?.languages, 'Any language'),
            value: agencyLanguage,
          },
        ]}
        onChange={(key, value) => {
          if (key === 'city') setAgencyCity(value);
          else if (key === 'specialty') setAgencySpecialty(value);
          else setAgencyLanguage(value);
        }}
        onReset={() => {
          setAgencyCity('');
          setAgencySpecialty('');
          setAgencyLanguage('');
        }}
        onClose={() => setAgencyFiltersOpen(false)}
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
  events: { gap: space.sm },
  eventRail: { gap: space.md, paddingRight: space.md },
  filterRow: { flexDirection: 'row', gap: space.sm },
  filterPill: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  filterPillText: { flexShrink: 1 },
  activeFilters: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  activeText: { flex: 1 },
  results: { gap: space.md },
  list: { gap: space.md },
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
