import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fetchEnquiryThread,
  sendEnquiryMessage,
  type EnquiryMessage,
  type EnquiryThread,
} from '@/api/enquiries';
import { fetchMyProposals, type ProposalSummary } from '@/api/proposals';
import {
  budgetLabel,
  datesLabel,
  ENQUIRY_STATUS_LABEL,
  formatWhen,
  partyLine,
} from '@/lib/enquiries';
import { formatMoney } from '@/lib/expenses';
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

function Bubble({
  author,
  authorName,
  body,
  at,
  seen,
}: {
  author: 'traveller' | 'agency';
  authorName: string;
  body: string;
  at: string | null;
  seen?: boolean;
}) {
  const { palette } = useTheme();
  const mine = author === 'traveller';

  return (
    <View style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : null]}>
      {!mine ? (
        <AppText variant="caption" tone="muted" style={styles.bubbleAuthor}>
          {authorName}
        </AppText>
      ) : null}
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: palette.primary, borderTopRightRadius: 6 }
            : {
                backgroundColor: palette.card,
                borderColor: palette.border,
                borderWidth: 1,
                borderTopLeftRadius: 6,
              },
        ]}
      >
        <AppText style={{ color: mine ? palette.primaryForeground : palette.foreground }}>
          {body}
        </AppText>
      </View>
      <View style={[styles.bubbleMeta, mine ? styles.bubbleMetaMine : null]}>
        <AppText variant="caption" tone="muted">
          {formatWhen(at)}
        </AppText>
        {mine && seen ? (
          <AppText variant="caption" tone="primary">
            Seen
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** The states a shared proposal can be in, worded for the traveller's thread. */
function proposalBadge(proposal: ProposalSummary): {
  label: string;
  tone: 'waiting' | 'accepted' | 'quiet';
} {
  const status = proposal.quote?.status;
  if (proposal.acceptedAt || status === 'accepted') {
    return { label: 'Accepted', tone: 'accepted' };
  }
  if (proposal.declinedAt) return { label: 'Declined', tone: 'quiet' };
  if (proposal.settledByAcceptedTrip) {
    return { label: 'Another version accepted', tone: 'quiet' };
  }
  if (status === 'expired') return { label: 'Expired', tone: 'quiet' };
  if (status === 'cancelled') return { label: 'Withdrawn', tone: 'quiet' };
  return { label: 'Awaiting you', tone: 'waiting' };
}

/**
 * A proposal the agency shared, kept in the thread where it arrived. Every
 * version stays visible with its own state, so answering one never erases the
 * document it answered.
 */
function ProposalAttachment({
  proposal,
  dates,
  party,
  canReply,
  onOpen,
  onAsk,
}: {
  proposal: ProposalSummary;
  dates: EnquiryThread['enquiry']['dates'];
  party: EnquiryThread['enquiry']['party'];
  canReply: boolean;
  onOpen: () => void;
  onAsk: () => void;
}) {
  const { palette } = useTheme();
  const badge = proposalBadge(proposal);
  const quote = proposal.quote;
  const badgeTone =
    badge.tone === 'accepted'
      ? { backgroundColor: `${palette.primary}14`, color: palette.primary }
      : badge.tone === 'waiting'
        ? { backgroundColor: `${palette.accent}14`, color: palette.accent }
        : { backgroundColor: palette.muted, color: palette.mutedForeground };

  return (
    <View
      style={[
        styles.attachment,
        { backgroundColor: palette.card, borderColor: `${palette.primary}2e` },
      ]}
    >
      <View style={styles.attachmentTop}>
        <View style={[styles.attachmentIcon, { backgroundColor: `${palette.primary}12` }]}>
          <Ionicons name="document-text-outline" size={16} color={palette.primary} />
        </View>
        <View style={styles.attachmentText}>
          <AppText variant="caption" tone="muted" style={styles.attachmentEyebrow}>
            {quote ? `PROPOSAL ${quote.number} · V${quote.version}` : 'PROPOSAL'}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {proposal.trip.title}
          </AppText>
        </View>
        <View style={[styles.attachmentBadge, { backgroundColor: badgeTone.backgroundColor }]}>
          <AppText variant="caption" style={{ color: badgeTone.color, fontWeight: '600' }}>
            {badge.label}
          </AppText>
        </View>
      </View>

      <AppText variant="caption" tone="muted">
        {datesLabel(dates)} · {partyLine(party)}
      </AppText>

      {quote ? (
        <View style={[styles.attachmentTotal, { borderTopColor: palette.border }]}>
          <View>
            <AppText variant="caption" tone="muted">
              Total
            </AppText>
            <AppText variant="title">{formatMoney(quote.total, quote.currency)}</AppText>
          </View>
          {quote.perPerson > 0 ? (
            <AppText variant="caption" tone="muted">
              {formatMoney(quote.perPerson, quote.currency)} per person
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.attachmentActions}>
        <Button label="View proposal" size="sm" variant="secondary" onPress={onOpen} />
        {canReply ? (
          <Button label="Ask about this" size="sm" variant="ghost" onPress={onAsk} />
        ) : null}
      </View>
    </View>
  );
}

export default function EnquiryThreadScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const composerRef = useRef<ComponentRef<typeof TextInput>>(null);
  const markedRead = useRef<string | null>(null);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id)?.trim() ?? '';

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const threadQuery = useQuery({
    queryKey: ['enquiry-thread', id],
    queryFn: () => fetchEnquiryThread(id),
    enabled: Boolean(id),
  });
  const proposalsQuery = useQuery({
    queryKey: ['proposals'],
    queryFn: fetchMyProposals,
    enabled: Boolean(id),
  });

  const thread = threadQuery.data;
  // Every version this enquiry received, newest first; answering one keeps it
  // in the thread instead of making the document disappear.
  const proposals = useMemo(
    () =>
      (proposalsQuery.data ?? [])
        .filter((proposal) => proposal.enquiryId === id)
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
        ),
    [proposalsQuery.data, id]
  );

  useEffect(() => {
    if (!thread || markedRead.current === thread.id) return;
    markedRead.current = thread.id;
    void queryClient.invalidateQueries({ queryKey: ['enquiry-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['enquiries'] });
  }, [thread, queryClient]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/enquiries');
  };

  async function send() {
    const body = draft.trim();
    if (!body || sending || !thread?.canReply) return;
    setSending(true);
    setSendError(null);
    try {
      const next: EnquiryThread = await sendEnquiryMessage(id, body);
      queryClient.setQueryData(['enquiry-thread', id], next);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      void queryClient.invalidateQueries({ queryKey: ['enquiry-summary'] });
    } catch (caught) {
      setSendError(
        caught instanceof Error ? caught.message : 'Your reply could not be sent right now.'
      );
    } finally {
      setSending(false);
    }
  }

  const askAbout = (proposal: ProposalSummary) => {
    const reference = proposal.quote?.number ?? proposal.trip.title;
    setDraft((current) =>
      current.trim() ? current : `A question about ${reference}: `
    );
    composerRef.current?.focus();
  };

  const topRow = (
    <View style={styles.header}>
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
      {thread ? (
        <>
          <View style={[styles.agencyMark, { backgroundColor: palette.secondary }]}>
            <AppText variant="label" style={{ color: palette.secondaryForeground }}>
              {initials(thread.agency.name) || 'A'}
            </AppText>
          </View>
          <View style={styles.headerText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {thread.agency.name}
            </AppText>
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              Enquiry · {ENQUIRY_STATUS_LABEL[thread.status]}
            </AppText>
          </View>
        </>
      ) : (
        <View style={styles.headerText}>
          <Skeleton width={140} height={15} />
          <Skeleton width={90} height={12} />
        </View>
      )}
    </View>
  );

  if (threadQuery.isError) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        {topRow}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons name="chatbubble-outline" size={24} color={palette.destructive} />
            </View>
            <AppText variant="title">This conversation isn’t available</AppText>
            <AppText tone="muted">
              {threadQuery.error instanceof Error
                ? threadQuery.error.message
                : 'It may belong to another account, or the link is out of date.'}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Your enquiries" onPress={() => router.navigate('/enquiries')} />
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => threadQuery.refetch()}
              />
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['top']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerPad}>{topRow}</View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          refreshControl={
            <RefreshControl
              refreshing={threadQuery.isRefetching && !threadQuery.isPending}
              onRefresh={() => {
                void threadQuery.refetch();
              }}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          }
        >
          {threadQuery.isPending ? (
            <>
              <Skeleton height={92} radius={radius.xxl} />
              <Skeleton height={74} radius={radius.xl} />
              <Skeleton height={54} radius={radius.xl} />
            </>
          ) : null}

          {thread ? (
            <>
              <Card style={styles.summary}>
                <View style={styles.summaryTop}>
                  <Ionicons name="map-outline" size={16} color={palette.primary} />
                  <AppText variant="bodyStrong" numberOfLines={2} style={styles.summaryTitle}>
                    {thread.enquiry.packageTitle ?? 'A general enquiry'}
                  </AppText>
                </View>
                <AppText variant="caption" tone="muted">
                  {datesLabel(thread.enquiry.dates)} · {partyLine(thread.enquiry.party)}
                  {thread.enquiry.budgetBand
                    ? ` · ${budgetLabel(thread.enquiry.budgetBand)}`
                    : ''}
                </AppText>
              </Card>

              <Bubble
                author="traveller"
                authorName={thread.traveller.name}
                body={thread.enquiry.message}
                at={thread.enquiry.createdAt}
                seen={thread.unread.agency === 0}
              />

              {thread.messages.length === 0 && proposals.length === 0 ? (
                <View style={styles.waiting}>
                  <Ionicons
                    name="hourglass-outline"
                    size={15}
                    color={palette.mutedForeground}
                  />
                  <AppText variant="caption" tone="muted" style={styles.waitingText}>
                    {thread.agency.name} usually answers within a day or two. You’ll see it here.
                  </AppText>
                </View>
              ) : null}

              {thread.messages.map((message: EnquiryMessage) => (
                <Bubble
                  key={message.id}
                  author={message.author}
                  authorName={message.authorName || thread.agency.name}
                  body={message.body}
                  at={message.createdAt}
                  seen={Boolean(message.readByAgencyAt)}
                />
              ))}

              {proposals.length > 0 ? (
                <View style={styles.attachments}>
                  {proposals.map((proposal) => (
                    <ProposalAttachment
                      key={proposal.id}
                      proposal={proposal}
                      dates={thread.enquiry.dates}
                      party={thread.enquiry.party}
                      canReply={Boolean(thread.canReply)}
                      onOpen={() =>
                        router.push({
                          pathname: '/proposals/[linkId]',
                          params: { linkId: proposal.id, enquiryId: id },
                        })
                      }
                      onAsk={() => askAbout(proposal)}
                    />
                  ))}
                </View>
              ) : null}

              {!thread.canReply ? (
                <View style={[styles.closed, { backgroundColor: palette.muted }]}>
                  <AppText variant="caption" tone="muted">
                    This thread is closed. Write a new enquiry if you’d like to pick it back
                    up.
                  </AppText>
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

        {sendError ? (
          <View style={styles.composerError}>
            <InlineError message={sendError} />
          </View>
        ) : null}

        {thread?.canReply ? (
          <View
            style={[
              styles.composer,
              {
                backgroundColor: palette.background,
                borderTopColor: palette.border,
                paddingBottom: Math.max(insets.bottom, space.md),
              },
            ]}
          >
            <View
              style={[
                styles.composerField,
                { backgroundColor: palette.card, borderColor: palette.border },
              ]}
            >
              <TextInput
                ref={composerRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={`Write to ${thread.agency.name}…`}
                placeholderTextColor={palette.mutedForeground}
                selectionColor={palette.primary}
                accessibilityLabel="Reply"
                multiline
                maxLength={2000}
                style={[styles.composerInput, { color: palette.foreground }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send reply"
                accessibilityState={{ disabled: !draft.trim() || sending, busy: sending }}
                disabled={!draft.trim() || sending}
                onPress={send}
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor: palette.accent,
                    opacity: !draft.trim() || sending ? 0.45 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={palette.accentForeground}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  headerPad: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agencyMark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 1 },
  thread: { flex: 1 },
  threadContent: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    gap: space.md,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  summary: { gap: 4 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  summaryTitle: { flex: 1 },
  attachments: { gap: space.md, paddingTop: space.xs },
  attachment: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space.md,
    gap: space.sm,
  },
  attachmentTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  attachmentIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentText: { flex: 1, gap: 1 },
  attachmentEyebrow: { letterSpacing: 0.4 },
  attachmentBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  attachmentTotal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.sm,
  },
  attachmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  bubbleWrap: { maxWidth: '86%', gap: 3 },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleAuthor: { marginLeft: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginLeft: 4 },
  bubbleMetaMine: { marginLeft: 0, marginRight: 4 },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
  },
  waitingText: { flex: 1 },
  closed: { borderRadius: radius.lg, padding: space.md },
  composerError: { paddingHorizontal: space.xl, paddingBottom: space.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  composerField: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.xxl,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingVertical: 9,
    fontSize: 15,
    lineHeight: 21,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
