import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import {
  acceptProposal,
  declineProposal,
  fetchProposal,
  type ProposalDetail,
} from '@/api/proposals';
import { assetUrl } from '@/config';
import { formatDay } from '@/lib/enquiries';
import { formatMoney } from '@/lib/expenses';
import { quoteFacts, stayCount, totalTravellers } from '@/lib/proposals';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

const DEEP = '#12382f';
const CREAM = '#f7f3ea';
const CREAM_MUTED = 'rgba(247,243,234,0.72)';
const CREAM_LINE = 'rgba(247,243,234,0.18)';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function imageUri(url: string | null): string | null {
  if (!url) return null;
  return /^https?:/i.test(url) ? url : assetUrl(url);
}

export default function ProposalDetailScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    linkId?: string | string[];
    enquiryId?: string | string[];
  }>();
  const first = (value?: string | string[]) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  const linkId = first(params.linkId);
  const enquiryId = first(params.enquiryId);

  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const proposalQuery = useQuery({
    queryKey: ['proposal', linkId],
    queryFn: () => fetchProposal(linkId),
    enabled: Boolean(linkId),
  });

  const detail = proposalQuery.data;
  const itinerary = detail?.itinerary ?? null;
  const quote = detail?.quote ?? null;
  const snapshotQuote = itinerary?.quote ?? null;
  const inclusions = quote?.inclusions?.length ? quote.inclusions : snapshotQuote?.inclusions ?? [];
  const exclusions = quote?.exclusions?.length ? quote.exclusions : snapshotQuote?.exclusions ?? [];
  const terms = quote?.terms?.length ? quote.terms : snapshotQuote?.terms ?? [];
  const total = quote?.total ?? snapshotQuote?.total ?? 0;
  const currency = quote?.currency ?? snapshotQuote?.currency ?? 'INR';
  const perPerson = quote?.perPerson ?? snapshotQuote?.perPerson ?? 0;
  const validUntil = quote?.validUntil ?? snapshotQuote?.validUntil ?? null;
  const travellers = totalTravellers(itinerary);
  const stays = stayCount(itinerary);
  const stops = itinerary
    ? itinerary.trip.days.reduce((count, day) => count + day.activities.length, 0)
    : 0;
  const days = itinerary?.trip.durationDays ?? 0;
  const facts = quoteFacts(itinerary, quote);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/proposals');
  };

  function patchDetail(next: Partial<ProposalDetail>) {
    queryClient.setQueryData<ProposalDetail>(['proposal', linkId], (current) =>
      current ? { ...current, ...next } : current
    );
    void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    void queryClient.invalidateQueries({ queryKey: ['enquiry-summary'] });
  }

  async function accept() {
    if (!detail || accepting) return;
    if (!confirmingAccept) {
      setConfirmingAccept(true);
      return;
    }
    setAccepting(true);
    setActionError(null);
    try {
      const result = await acceptProposal(linkId);
      patchDetail({
        accepted: true,
        canAccept: false,
        acceptedAt: result.acceptedAt,
        quote: result.quote,
      });
      setConfirmingAccept(false);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The proposal could not be accepted right now.'
      );
    } finally {
      setAccepting(false);
    }
  }

  async function decline() {
    if (!detail || declining) return;
    if (!confirmingDecline) {
      setConfirmingDecline(true);
      return;
    }
    setDeclining(true);
    setActionError(null);
    try {
      const result = await declineProposal(linkId);
      patchDetail({ declined: true, canAccept: false, declinedAt: result.declinedAt });
      setConfirmingDecline(false);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'The proposal could not be declined right now.'
      );
    } finally {
      setDeclining(false);
    }
  }

  async function share() {
    const title = itinerary?.trip.title || detail?.trip.title || 'Our trip proposal';
    const agency = itinerary?.agency.name || detail?.agency.name || 'our agency';
    const moneyLine = total > 0 ? ` — ${formatMoney(total, currency)}` : '';
    const groupLine =
      travellers > 0
        ? ` for ${travellers} ${travellers === 1 ? 'traveller' : 'travellers'}`
        : '';
    const message = `${title}${moneyLine}${groupLine}, proposed by ${agency}.`;
    try {
      await Share.share({ message });
    } catch {
      // The system share sheet is the only target; a dismissed sheet is fine.
    }
  }

  const topRow = (
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
      <AppText variant="title" style={styles.heading}>
        Proposal
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share this proposal"
        onPress={share}
        style={({ pressed }) => [
          styles.share,
          { backgroundColor: `${palette.primary}14`, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="share-social-outline" size={18} color={palette.primary} />
      </Pressable>
    </View>
  );

  if (proposalQuery.isError) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons name="document-text-outline" size={24} color={palette.destructive} />
            </View>
            <AppText variant="title">This proposal isn’t available</AppText>
            <AppText tone="muted">
              {proposalQuery.error instanceof Error
                ? proposalQuery.error.message
                : 'The link may have expired or been withdrawn.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Your proposals" onPress={() => router.navigate('/proposals')} />
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => proposalQuery.refetch()}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const agencyName = itinerary?.agency.name || detail?.agency.name || 'Your agency';
  const tripTitle = itinerary?.trip.title || detail?.trip.title || 'Your trip';
  const expired = quote?.status === 'expired' || snapshotQuote?.status === 'expired';

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      contentContainerStyle={styles.content}
      refreshing={proposalQuery.isRefetching && !proposalQuery.isPending}
      onRefresh={() => proposalQuery.refetch()}
    >
      {topRow}

      <View style={styles.page}>
        {proposalQuery.isPending ? (
          <>
            <Skeleton height={220} radius={radius.xxl} />
            <Skeleton height={130} radius={radius.xxl} />
            <Skeleton height={200} radius={radius.xxl} />
          </>
        ) : null}

        {detail ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryHead}>
                <View style={styles.agencyMark}>
                  <AppText variant="heading" style={{ color: DEEP }}>
                    {initials(agencyName) || 'A'}
                  </AppText>
                </View>
                <View style={styles.summaryAgency}>
                  <AppText variant="heading" style={{ color: CREAM }} numberOfLines={1}>
                    {agencyName}
                  </AppText>
                  <AppText variant="caption" style={{ color: CREAM_MUTED }}>
                    Travel agency
                  </AppText>
                </View>
              </View>

              {total > 0 ? (
                <>
                  <AppText variant="display" style={{ color: CREAM }}>
                    {formatMoney(total, currency)}
                  </AppText>
                  <AppText variant="body" style={{ color: CREAM_MUTED }}>
                    {travellers > 0
                      ? `total for ${travellers} ${
                          travellers === 1 ? 'traveller' : 'travellers'
                        }`
                      : 'total for your group'}
                    {perPerson > 0 ? ` · ${formatMoney(perPerson, currency)} each` : ''}
                  </AppText>
                </>
              ) : null}

              <View style={[styles.summaryLine, { backgroundColor: CREAM_LINE }]} />

              <View style={styles.summaryFacts}>
                <View style={styles.summaryFact}>
                  <Ionicons name="calendar-outline" size={16} color={CREAM} />
                  <AppText variant="label" style={{ color: CREAM }}>
                    {days > 0
                      ? `${days} ${days === 1 ? 'day' : 'days'}`
                      : detail.documentMode === 'live'
                        ? 'Day by day'
                        : 'Document'}
                  </AppText>
                </View>
                <View style={styles.summaryFact}>
                  <Ionicons name="bed-outline" size={16} color={CREAM} />
                  <AppText variant="label" style={{ color: CREAM }}>
                    {stays > 0 ? `${stays} ${stays === 1 ? 'stay' : 'stays'}` : 'Stays inside'}
                  </AppText>
                </View>
                <View style={styles.summaryFact}>
                  <Ionicons name="map-outline" size={16} color={CREAM} />
                  <AppText variant="label" style={{ color: CREAM }}>
                    {stops > 0 ? `${stops} ${stops === 1 ? 'stop' : 'stops'}` : 'A full plan'}
                  </AppText>
                </View>
              </View>
            </View>

            <View style={styles.titleBlock}>
              <AppText variant="title">{tripTitle}</AppText>
              <AppText variant="caption" tone="muted">
                {quote ? `Proposal ${quote.number} · version ${quote.version}` : 'Proposal'}
                {facts.length > 0 ? ` · ${facts.join(' · ')}` : ''}
              </AppText>
            </View>

            {detail.accepted ? (
              <View style={[styles.stateCard, { backgroundColor: `${palette.primary}12` }]}>
                <Ionicons name="checkmark-circle" size={20} color={palette.primary} />
                <View style={styles.stateText}>
                  <AppText variant="label" tone="primary">
                    You have accepted this proposal
                  </AppText>
                  {detail.acceptedAt ? (
                    <AppText variant="caption" tone="muted">
                      Accepted on {formatDay(detail.acceptedAt)}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}

            {detail.declined ? (
              <View style={[styles.stateCard, { backgroundColor: palette.muted }]}>
                <Ionicons name="close-circle" size={20} color={palette.mutedForeground} />
                <View style={styles.stateText}>
                  <AppText variant="label">You declined this proposal</AppText>
                  <AppText variant="caption" tone="muted">
                    The conversation stays open — ask {agencyName} for an updated version if
                    you change your mind.
                  </AppText>
                </View>
              </View>
            ) : null}

            {inclusions.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="heading">What’s included</AppText>
                <Card style={styles.included}>
                  {inclusions.map((line) => (
                    <View key={line} style={styles.includedRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={17}
                        color={palette.primary}
                      />
                      <AppText style={styles.includedText}>{line}</AppText>
                    </View>
                  ))}
                  {total > 0 ? (
                    <>
                      <View style={[styles.includedLine, { backgroundColor: palette.border }]} />
                      <View style={styles.totalRow}>
                        <AppText variant="label">Total</AppText>
                        <View style={styles.totalFigures}>
                          <AppText variant="heading">
                            {formatMoney(total, currency)}
                          </AppText>
                          {perPerson > 0 ? (
                            <AppText variant="caption" tone="muted">
                              {formatMoney(perPerson, currency)} per person
                            </AppText>
                          ) : null}
                        </View>
                      </View>
                    </>
                  ) : null}
                </Card>
              </View>
            ) : null}

            {itinerary && itinerary.trip.days.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="heading">Day by day</AppText>
                <Card padded={false} style={styles.daysCard}>
                  {itinerary.trip.days.map((day, index) => {
                    const uri = imageUri(day.imageUrl);
                    const stay = day.stay[0]?.name ?? null;
                    return (
                      <View
                        key={day.day}
                        style={[
                          styles.dayRow,
                          index > 0 && {
                            borderTopWidth: 1,
                            borderTopColor: palette.border,
                          },
                        ]}
                      >
                        {uri ? (
                          <Image
                            source={{ uri }}
                            style={styles.dayPhoto}
                            contentFit="cover"
                            transition={180}
                          />
                        ) : (
                          <View style={[styles.dayPhoto, { backgroundColor: palette.muted }]}>
                            <Ionicons
                              name="map-outline"
                              size={18}
                              color={palette.primary}
                            />
                          </View>
                        )}
                        <View style={styles.dayText}>
                          <AppText variant="caption" tone="primary">
                            DAY {day.day}
                          </AppText>
                          <AppText variant="bodyStrong" numberOfLines={2}>
                            {day.title}
                          </AppText>
                          <AppText variant="caption" tone="muted" numberOfLines={1}>
                            {stay ? `Stay · ${stay}` : day.activities[0]?.title ?? day.summary ?? 'A day on the road'}
                          </AppText>
                        </View>
                      </View>
                    );
                  })}
                </Card>
              </View>
            ) : detail.documentMode !== 'live' ? (
              <View style={styles.section}>
                <AppText variant="heading">The document</AppText>
                <Card style={styles.documentCard}>
                  <Ionicons name="document-text-outline" size={20} color={palette.primary} />
                  <View style={styles.documentText}>
                    <AppText variant="bodyStrong">{agencyName}</AppText>
                    <AppText variant="caption" tone="muted">
                      {detail.pageCount > 0
                        ? `This proposal arrived as a ${detail.pageCount}-page document. `
                        : 'This proposal arrived as a document. '}
                      Ask them in your conversation if you’d like it in another shape.
                    </AppText>
                  </View>
                </Card>
              </View>
            ) : null}

            {exclusions.length > 0 || terms.length > 0 ? (
              <Card style={styles.smallPrint}>
                {exclusions.length > 0 ? (
                  <View style={styles.smallPrintBlock}>
                    <AppText variant="caption" tone="muted">
                      NOT INCLUDED
                    </AppText>
                    {exclusions.map((line) => (
                      <View key={line} style={styles.smallPrintRow}>
                        <Ionicons name="remove" size={13} color={palette.mutedForeground} />
                        <AppText variant="caption" tone="muted" style={styles.smallPrintText}>
                          {line}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
                {terms.length > 0 ? (
                  <View style={styles.smallPrintBlock}>
                    <AppText variant="caption" tone="muted">
                      TERMS
                    </AppText>
                    {terms.map((line) => (
                      <View key={line} style={styles.smallPrintRow}>
                        <AppText variant="caption" tone="muted">
                          ·
                        </AppText>
                        <AppText variant="caption" tone="muted" style={styles.smallPrintText}>
                          {line}
                        </AppText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
            ) : null}

            {validUntil ? (
              <View
                style={[
                  styles.validity,
                  {
                    backgroundColor: expired ? palette.muted : `${palette.accent}14`,
                  },
                ]}
              >
                <AppText variant="label" tone={expired ? 'default' : 'accent'}>
                  {expired ? 'This price has expired' : `Price held until ${formatDay(validUntil)}`}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {expired
                    ? 'Ask the agency for an updated proposal.'
                    : 'Prices may change after this date.'}
                </AppText>
              </View>
            ) : null}

            {actionError ? <InlineError message={actionError} /> : null}

            {detail.canAccept && !detail.accepted && !detail.declined ? (
              <View style={styles.acceptBlock}>
                <Button
                  label={confirmingAccept ? 'Confirm acceptance' : 'Accept proposal'}
                  variant="accent"
                  size="lg"
                  loading={accepting}
                  icon={
                    <Ionicons name="checkmark" size={18} color={palette.accentForeground} />
                  }
                  onPress={accept}
                />
                <AppText variant="caption" tone="muted" style={styles.acceptNote}>
                  {confirmingAccept
                    ? 'Acceptance is final — it confirms the trip and locks this quote.'
                    : 'Acceptance is final — it confirms the trip with the agency.'}
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decline this proposal"
                  accessibilityState={{ busy: declining }}
                  disabled={declining}
                  onPress={decline}
                  style={({ pressed }) => [styles.declineLink, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <AppText variant="caption" tone="muted">
                    {confirmingDecline
                      ? 'Tap again to decline this version'
                      : 'Not the right fit? Decline'}
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            {!detail.accepted && !detail.declined && expired ? (
              <View style={[styles.stateCard, { backgroundColor: palette.muted }]}>
                <Ionicons name="time-outline" size={20} color={palette.mutedForeground} />
                <View style={styles.stateText}>
                  <AppText variant="label">This proposal can no longer be accepted</AppText>
                  <AppText variant="caption" tone="muted">
                    Ask {agencyName} for an updated one in your conversation.
                  </AppText>
                </View>
              </View>
            ) : null}

            <View style={styles.secondaryActions}>
              {enquiryId ? (
                <Button
                  label="Ask a question"
                  variant="ghost"
                  style={styles.secondary}
                  icon={
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={16}
                      color={palette.foreground}
                    />
                  }
                  onPress={() => router.push(`/enquiries/${enquiryId}`)}
                />
              ) : null}
              <Button
                label="Share with group"
                variant="ghost"
                style={styles.secondary}
                icon={
                  <Ionicons
                    name="share-social-outline"
                    size={16}
                    color={palette.foreground}
                  />
                }
                onPress={share}
              />
            </View>

            <AppText variant="caption" tone="muted" style={styles.footnote}>
              This page shows only what {agencyName} prepared for you — no internal costs, no
              one else’s details.
            </AppText>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { flex: 1 },
  share: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: DEEP,
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: 'rgba(247,243,234,0.12)',
    padding: space.xl,
    gap: space.sm,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  agencyMark: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: '#9dbcb4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryAgency: { flex: 1, gap: 1 },
  summaryLine: { height: 1, marginVertical: space.sm },
  summaryFacts: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  summaryFact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleBlock: { gap: space.xs, marginTop: -space.sm },
  stateCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    borderRadius: radius.xl,
    padding: space.md,
  },
  stateText: { flex: 1, gap: 2 },
  section: { gap: space.md },
  included: { gap: space.sm },
  includedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  includedText: { flex: 1, lineHeight: 22 },
  includedLine: { height: 1, marginTop: space.xs },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  totalFigures: { alignItems: 'flex-end', gap: 1 },
  daysCard: { overflow: 'hidden' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  dayPhoto: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e4eae7',
    overflow: 'hidden',
  },
  dayText: { flex: 1, gap: 1 },
  documentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  documentText: { flex: 1, gap: 2 },
  smallPrint: { gap: space.md },
  smallPrintBlock: { gap: space.xs },
  smallPrintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  smallPrintText: { flex: 1 },
  validity: { borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 },
  acceptBlock: { gap: space.sm },
  acceptNote: { textAlign: 'center' },
  declineLink: { alignSelf: 'center', paddingVertical: space.xs },
  secondaryActions: { flexDirection: 'row', gap: space.sm },
  secondary: { flex: 1 },
  footnote: { lineHeight: 18, textAlign: 'center' },
  errorCard: { gap: space.sm, alignItems: 'flex-start' },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
});
