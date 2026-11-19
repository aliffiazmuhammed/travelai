import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fetchEnquirySummary, fetchMyEnquiries, type EnquirySummary } from '@/api/enquiries';
import {
  datesLabel,
  ENQUIRY_STATUS_LABEL,
  formatWhen,
  partyLine,
} from '@/lib/enquiries';
import { goToTab } from '@/navigation/tabs';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function AgencyMark({ name }: { name: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.mark, { backgroundColor: palette.secondary }]}>
      <AppText variant="label" style={{ color: palette.secondaryForeground }}>
        {initials(name) || 'A'}
      </AppText>
    </View>
  );
}

function EnquiryRow({ enquiry, onPress }: { enquiry: EnquirySummary; onPress: () => void }) {
  const { palette } = useTheme();
  const agencyName = enquiry.agency?.name ?? 'Agency';
  const unread = enquiry.unread.traveller;
  const proposalCount = enquiry.proposals?.count ?? 0;

  return (
    <Card style={styles.row} onPress={onPress} accessibilityLabel={`Open enquiry with ${agencyName}`}>
      <View style={styles.rowTop}>
        <AgencyMark name={agencyName} />
        <View style={styles.rowTitle}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {agencyName}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {enquiry.package?.title ?? 'A general enquiry'}
          </AppText>
        </View>
        <View style={styles.rowMeta}>
          <AppText variant="caption" tone="muted">
            {formatWhen(enquiry.lastMessageAt ?? enquiry.createdAt)}
          </AppText>
          {unread > 0 ? (
            <View style={[styles.unread, { backgroundColor: palette.accent }]}>
              <AppText variant="caption" style={{ color: palette.accentForeground }}>
                {unread}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>

      <AppText variant="body" numberOfLines={2} style={styles.excerpt}>
        {enquiry.message}
      </AppText>

      <View style={styles.rowFoot}>
        <View style={[styles.statusPill, { backgroundColor: palette.muted }]}>
          <AppText variant="caption" tone="muted">
            {ENQUIRY_STATUS_LABEL[enquiry.status]}
          </AppText>
        </View>
        {proposalCount > 0 ? (
          <View style={[styles.proposalPill, { backgroundColor: `${palette.accent}1f` }]}>
            <Ionicons name="document-text-outline" size={12} color={palette.accent} />
            <AppText variant="caption" tone="accent">
              {proposalCount === 1 ? 'Proposal ready' : `${proposalCount} proposals`}
            </AppText>
          </View>
        ) : null}
        <View style={styles.rowFacts}>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {datesLabel(enquiry.dates)} · {partyLine(enquiry.party)}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function RowSkeleton() {
  return (
    <Card style={styles.row}>
      <View style={styles.rowTop}>
        <Skeleton width={44} height={44} radius={radius.pill} />
        <View style={styles.rowTitle}>
          <Skeleton width="55%" height={15} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <Skeleton height={13} />
      <Skeleton width="70%" height={13} />
    </Card>
  );
}

export default function EnquiriesScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const page = cursorStack.length + 1;

  const enquiriesQuery = useQuery({
    queryKey: ['enquiries', cursor],
    queryFn: () => fetchMyEnquiries(cursor),
  });
  const summaryQuery = useQuery({
    queryKey: ['enquiry-summary'],
    queryFn: fetchEnquirySummary,
  });

  const data = enquiriesQuery.data;
  const summary = summaryQuery.data;
  const rows = data?.enquiries ?? [];

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
      refreshing={enquiriesQuery.isRefetching && !enquiriesQuery.isPending}
      onRefresh={() => {
        void enquiriesQuery.refetch();
        void summaryQuery.refetch();
      }}
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
        <AppText variant="wordmark" tone="primary">
          waytowalk
        </AppText>
      </View>

      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="title">Enquiries</AppText>
            <AppText tone="muted">
              Every conversation with the agencies you’re planning with, in one place.
            </AppText>
          </View>
          {summary && (summary.unread > 0 || summary.liveProposals > 0) ? (
            <View style={styles.headerBadges}>
              {summary.unread > 0 ? (
                <View style={[styles.headerBadge, { backgroundColor: palette.accent }]}>
                  <AppText variant="caption" style={{ color: palette.accentForeground }}>
                    {summary.unread} new
                  </AppText>
                </View>
              ) : null}
              {summary.liveProposals > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open proposals"
                  onPress={() => router.push('/proposals')}
                  style={({ pressed }) => [
                    styles.headerBadge,
                    {
                      backgroundColor: `${palette.primary}14`,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="document-text-outline" size={12} color={palette.primary} />
                  <AppText variant="caption" tone="primary">
                    {summary.liveProposals}{' '}
                    {summary.liveProposals === 1 ? 'proposal' : 'proposals'}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {enquiriesQuery.isError ? (
          <View style={styles.errorBlock}>
            <InlineError
              message={
                enquiriesQuery.error instanceof Error
                  ? enquiriesQuery.error.message
                  : 'Your enquiries could not be loaded right now.'
              }
            />
            <Button label="Try again" variant="secondary" size="sm" onPress={() => enquiriesQuery.refetch()} />
          </View>
        ) : null}

        {enquiriesQuery.isPending ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : null}

        {!enquiriesQuery.isPending && !enquiriesQuery.isError && rows.length === 0 ? (
          <Card style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="chatbubbles-outline" size={24} color={palette.primary} />
            </View>
            <AppText variant="heading">No enquiries yet</AppText>
            <AppText tone="muted">
              Find an agency you like and say hello. Their reply lands right here — no email
              tag.
            </AppText>
            <Button
              label="Find an agency"
              variant="accent"
              size="sm"
              onPress={() => goToTab('explore')}
            />
          </Card>
        ) : null}

        {rows.length > 0 ? (
          <View style={styles.list}>
            {rows.map((enquiry) => (
              <EnquiryRow
                key={enquiry.id}
                enquiry={enquiry}
                onPress={() => router.push(`/enquiries/${enquiry.id}`)}
              />
            ))}
          </View>
        ) : null}

        {data && (page > 1 || data.hasMore) ? (
          <View style={styles.pager}>
            <Button
              label="Previous"
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onPress={() => setCursorStack((stack) => stack.slice(0, -1))}
            />
            <AppText variant="caption" tone="muted">
              Page {page}
            </AppText>
            <Button
              label="Next"
              variant="secondary"
              size="sm"
              disabled={!data.hasMore || !data.nextCursor}
              onPress={() =>
                setCursorStack((stack) =>
                  data.nextCursor ? [...stack, data.nextCursor] : stack
                )
              }
            />
          </View>
        ) : null}
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
  wordmark: { letterSpacing: -0.4 },
  header: { gap: space.sm },
  headerText: { gap: space.xs },
  headerBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  list: { gap: space.md },
  row: { gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { flex: 1, gap: 1 },
  rowMeta: { alignItems: 'flex-end', gap: 4 },
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  excerpt: { lineHeight: 21 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  proposalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  rowFacts: { flexGrow: 1, alignItems: 'flex-end' },
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
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});
