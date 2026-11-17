import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchMyProposals, type ProposalSummary } from '@/api/proposals';
import { formatDay, formatWhen } from '@/lib/enquiries';
import { formatMoney } from '@/lib/expenses';
import {
  PROPOSAL_FILTERS,
  proposalState,
  type ProposalFilter,
} from '@/lib/proposals';
import { goToTab } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Button,
  Card,
  InlineError,
  Screen,
  Segmented,
  Skeleton,
} from '@/ui';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function StateChip({ proposal }: { proposal: ProposalSummary }) {
  const { palette } = useTheme();
  const state = proposalState(proposal);

  if (state === 'accepted') {
    return (
      <View style={[styles.chip, { backgroundColor: palette.primary }]}>
        <AppText variant="caption" style={{ color: palette.primaryForeground }}>
          Accepted
        </AppText>
      </View>
    );
  }
  if (state === 'declined') {
    return (
      <View style={[styles.chip, { backgroundColor: palette.muted }]}>
        <AppText variant="caption" tone="muted">
          Declined
        </AppText>
      </View>
    );
  }
  return (
    <View style={[styles.chip, { backgroundColor: `${palette.accent}1f` }]}>
      <AppText variant="caption" tone="accent">
        Awaiting you
      </AppText>
    </View>
  );
}

function ProposalCard({
  proposal,
  onPress,
}: {
  proposal: ProposalSummary;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const quote = proposal.quote;
  const price = quote
    ? formatMoney(quote.perPerson || quote.total, quote.currency)
    : 'Price on request';
  const facts = [
    quote ? `Proposal ${quote.number}` : 'Proposal document',
    quote?.validUntil ? `held until ${formatDay(quote.validUntil)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card style={styles.card} onPress={onPress} accessibilityLabel={`Open ${proposal.agency.name} proposal`}>
      <View style={styles.cardTop}>
        <View style={[styles.mark, { backgroundColor: palette.secondary }]}>
          <AppText variant="heading" style={{ color: palette.secondaryForeground }}>
            {initials(proposal.agency.name) || 'A'}
          </AppText>
        </View>
        <View style={styles.cardTitle}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {proposal.agency.name}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {proposal.trip.title}
          </AppText>
        </View>
        <StateChip proposal={proposal} />
      </View>

      <View style={styles.priceRow}>
        <AppText variant="title">{price}</AppText>
        {quote ? (
          <AppText variant="caption" tone="muted">
            per person
          </AppText>
        ) : null}
      </View>

      <View style={[styles.divider, { backgroundColor: palette.border }]} />

      <View style={styles.factsRow}>
        <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.facts}>
          {facts}
        </AppText>
        <AppText variant="caption" tone="muted">
          {formatWhen(proposal.createdAt)}
        </AppText>
      </View>
    </Card>
  );
}

export default function ProposalsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<ProposalFilter>('all');

  const proposalsQuery = useQuery({
    queryKey: ['proposals'],
    queryFn: fetchMyProposals,
  });

  const proposals = useMemo(() => proposalsQuery.data ?? [], [proposalsQuery.data]);
  const counts = useMemo(() => {
    const tally = { all: proposals.length, live: 0, accepted: 0, declined: 0 };
    for (const proposal of proposals) tally[proposalState(proposal)] += 1;
    return tally;
  }, [proposals]);

  const visible = useMemo(
    () =>
      filter === 'all'
        ? proposals
        : proposals.filter((proposal) => proposalState(proposal) === filter),
    [proposals, filter]
  );
  const liveCount = counts.live;

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/profile');
  };

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
      refreshing={proposalsQuery.isRefetching && !proposalsQuery.isPending}
      onRefresh={() => proposalsQuery.refetch()}
    >
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          style={({ pressed }) => [
            styles.back,
            { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.foreground} />
        </Pressable>
        <AppText variant="heading" tone="primary" style={styles.wordmark}>
          waytowalk
        </AppText>
        {liveCount > 0 ? (
          <View style={[styles.newChip, { backgroundColor: palette.accent }]}>
            <AppText variant="caption" style={{ color: palette.accentForeground }}>
              {liveCount} new
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.page}>
        <View style={styles.intro}>
          <AppText variant="title">Proposals</AppText>
          <AppText tone="muted">
            What agencies sent back, side by side. Read one, ask a question, or accept when it
            feels right.
          </AppText>
        </View>

        {counts.all > 0 ? (
          <Segmented
            accessibilityLabel="Proposal filter"
            items={PROPOSAL_FILTERS}
            value={filter}
            onChange={setFilter}
          />
        ) : null}

        {proposalsQuery.isError ? (
          <View style={styles.errorBlock}>
            <InlineError
              message={
                proposalsQuery.error instanceof Error
                  ? proposalsQuery.error.message
                  : 'Your proposals could not be loaded right now.'
              }
            />
            <Button
              label="Try again"
              variant="secondary"
              size="sm"
              onPress={() => proposalsQuery.refetch()}
            />
          </View>
        ) : null}

        {proposalsQuery.isPending ? (
          <>
            <Skeleton height={168} radius={radius.xxl} />
            <Skeleton height={168} radius={radius.xxl} />
          </>
        ) : null}

        {!proposalsQuery.isPending && !proposalsQuery.isError && counts.all === 0 ? (
          <Card style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="document-text-outline" size={24} color={palette.primary} />
            </View>
            <AppText variant="heading">No proposals yet</AppText>
            <AppText tone="muted">
              Send an enquiry to an agency and the plan they send back will appear here.
            </AppText>
            <Button
              label="Find an agency"
              variant="accent"
              size="sm"
              onPress={() => goToTab('explore')}
            />
          </Card>
        ) : null}

        {visible.length > 0 ? (
          <View style={styles.list}>
            {visible.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onPress={() =>
                  router.push({
                    pathname: '/proposals/[linkId]',
                    params: {
                      linkId: proposal.id,
                      ...(proposal.enquiryId ? { enquiryId: proposal.enquiryId } : {}),
                    },
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {!proposalsQuery.isPending && counts.all > 0 && visible.length === 0 ? (
          <AppText variant="caption" tone="muted" style={styles.filterEmpty}>
            Nothing in this list right now — try another filter.
          </AppText>
        ) : null}

        <View style={styles.footer}>
          <Button
            label="Message agencies"
            variant="ghost"
            icon={<Ionicons name="chatbubbles-outline" size={16} color={palette.foreground} />}
            onPress={() => router.navigate('/enquiries')}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4, flex: 1 },
  newChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  intro: { gap: space.xs },
  list: { gap: space.md },
  card: { gap: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, gap: 1 },
  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  divider: { height: 1 },
  factsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  facts: { flex: 1 },
  errorBlock: { gap: space.sm },
  empty: { alignItems: 'flex-start', gap: space.sm },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  filterEmpty: { textAlign: 'center' },
  footer: { gap: space.sm },
});
