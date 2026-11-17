import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
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

import { ApiError } from '@/api/client';
import {
  fetchGuestConversation,
  fetchGuestProposals,
  guestProposalPdfUrl,
  sendGuestMessage,
} from '@/api/guestConversations';
import type { EnquiryMessage, EnquiryThread } from '@/api/enquiries';
import type { ProposalSummary } from '@/api/proposals';
import {
  budgetLabel,
  datesLabel,
  ENQUIRY_STATUS_LABEL,
  formatDay,
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

/** Same shape as the signed-in thread, but the guest never sees "Seen". */
function Bubble({
  author,
  authorName,
  body,
  at,
}: {
  author: 'traveller' | 'agency';
  authorName: string;
  body: string;
  at: string | null;
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
      <AppText variant="caption" tone="muted" style={styles.bubbleMeta}>
        {formatWhen(at)}
      </AppText>
    </View>
  );
}

function ProposalCard({
  proposal,
  token,
}: {
  proposal: ProposalSummary;
  token: string;
}) {
  const { palette } = useTheme();
  const quote = proposal.quote;

  return (
    <View style={[styles.proposal, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.proposalTop}>
        <View style={[styles.proposalIcon, { backgroundColor: palette.muted }]}>
          <Ionicons name="document-text-outline" size={16} color={palette.primary} />
        </View>
        <View style={styles.proposalText}>
          <AppText variant="caption" tone="muted" style={styles.proposalEyebrow}>
            {quote ? `PROPOSAL ${quote.number} · V${quote.version}` : 'PROPOSAL'}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {proposal.trip.title}
          </AppText>
        </View>
      </View>
      {quote ? (
        <View style={[styles.proposalTotal, { borderTopColor: palette.border }]}>
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
      <Button
        label="Open proposal PDF"
        size="sm"
        variant="secondary"
        onPress={() => Linking.openURL(guestProposalPdfUrl(token, proposal.id)).catch(() => {})}
      />
    </View>
  );
}

export default function GuestConversationScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const composerRef = useRef<ComponentRef<typeof TextInput>>(null);

  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = (Array.isArray(params.token) ? params.token[0] : params.token)?.trim() ?? '';

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);

  const conversationQuery = useQuery({
    queryKey: ['guest-conversation', token],
    queryFn: () => fetchGuestConversation(token),
    enabled: Boolean(token),
    retry: false,
  });
  const proposalsQuery = useQuery({
    queryKey: ['guest-conversation-proposals', token],
    queryFn: () => fetchGuestProposals(token),
    enabled: Boolean(token),
    retry: false,
  });

  const thread = conversationQuery.data;
  const proposals = proposalsQuery.data ?? [];

  const send = useMutation({
    mutationFn: (body: string) => sendGuestMessage(token, body),
    onSuccess: (next: EnquiryThread) => {
      queryClient.setQueryData(['guest-conversation', token], next);
      setDraft('');
      setSendError(null);
    },
    onError: (error) => {
      setSendError(
        error instanceof Error ? error.message : 'Your reply could not be sent right now.'
      );
    },
  });

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending || !thread?.canReply) return;
    send.mutate(body);
  }

  const goHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (conversationQuery.isError) {
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={goHome}
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
        </View>
        <Card style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: `${palette.destructive}14` }]}>
            <Ionicons name="chatbubble-outline" size={24} color={palette.destructive} />
          </View>
          <AppText variant="title" style={styles.center}>
            Conversation not available
          </AppText>
          <AppText variant="caption" tone="muted" style={styles.center}>
            {conversationQuery.error instanceof ApiError
              ? conversationQuery.error.message
              : 'This private link may have expired. Ask the agency to send a fresh one.'}
          </AppText>
          <Button label="Browse agencies" onPress={goHome} style={styles.wide} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['top']} style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.headerPad}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={goHome}
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
                  <View style={styles.secureRow}>
                    <Ionicons name="lock-closed-outline" size={11} color={palette.mutedForeground} />
                    <AppText variant="caption" tone="muted">
                      Secure conversation
                    </AppText>
                  </View>
                </View>
              </>
            ) : (
              <View style={styles.headerText}>
                <Skeleton width={140} height={15} />
                <Skeleton width={90} height={12} />
              </View>
            )}
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          refreshControl={
            <RefreshControl
              refreshing={conversationQuery.isRefetching && !conversationQuery.isPending}
              onRefresh={() => {
                void conversationQuery.refetch();
                void proposalsQuery.refetch();
              }}
              tintColor={palette.primary}
              colors={[palette.primary]}
            />
          }
        >
          {conversationQuery.isPending ? (
            <>
              <Skeleton height={120} radius={radius.xxl} />
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
                    {thread.enquiry.packageTitle ?? 'Your trip enquiry'}
                  </AppText>
                </View>
                <AppText variant="caption" tone="muted">
                  {datesLabel(thread.enquiry.dates)} · {partyLine(thread.enquiry.party)}
                  {thread.enquiry.budgetBand
                    ? ` · ${budgetLabel(thread.enquiry.budgetBand)}`
                    : ''}
                </AppText>
                <View style={[styles.statusRow, { borderTopColor: palette.border }]}>
                  <AppText variant="caption" tone="muted">
                    {ENQUIRY_STATUS_LABEL[thread.status]}
                  </AppText>
                  {thread.enquiry.createdAt ? (
                    <AppText variant="caption" tone="muted">
                      Sent {formatDay(thread.enquiry.createdAt)}
                    </AppText>
                  ) : null}
                </View>
              </Card>

              <Bubble
                author="traveller"
                authorName={thread.traveller.name || 'You'}
                body={thread.enquiry.message}
                at={thread.enquiry.createdAt}
              />

              {thread.messages.length === 0 && proposals.length === 0 ? (
                <View style={styles.waiting}>
                  <Ionicons name="hourglass-outline" size={15} color={palette.mutedForeground} />
                  <AppText variant="caption" tone="muted" style={styles.waitingText}>
                    Your enquiry is with {thread.agency.name}. Replies appear here.
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
                />
              ))}

              {proposals.length > 0 ? (
                <View style={styles.proposals}>
                  <AppText variant="caption" tone="muted" style={styles.proposalsEyebrow}>
                    PROPOSALS FOR THIS ENQUIRY
                  </AppText>
                  {proposals.map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} token={token} />
                  ))}
                </View>
              ) : null}

              <View style={styles.footerNote}>
                <Ionicons name="lock-closed-outline" size={12} color={palette.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.footerText}>
                  Replies are private between you and the agency.
                  {thread.expiresAt ? ` This link works until ${formatDay(thread.expiresAt)}.` : ''}
                </AppText>
              </View>
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
                accessibilityState={{
                  disabled: !draft.trim() || send.isPending,
                  busy: send.isPending,
                }}
                disabled={!draft.trim() || send.isPending}
                onPress={submit}
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor: palette.accent,
                    opacity: !draft.trim() || send.isPending ? 0.45 : pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Ionicons name="arrow-up" size={18} color={palette.accentForeground} />
              </Pressable>
            </View>
          </View>
        ) : thread ? (
          <View style={[styles.closed, { backgroundColor: palette.muted }]}>
            <AppText variant="caption" tone="muted">
              This conversation is closed. Ask the agency for a fresh link if you’d like to pick
              it back up.
            </AppText>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  stateCard: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  wide: { width: '100%' },
  headerPad: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  agencyMark: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 1 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  bubbleWrap: { maxWidth: '86%', gap: 3 },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleAuthor: { marginLeft: 4 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.xl },
  bubbleMeta: { marginHorizontal: 4 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  waitingText: { flex: 1 },
  proposals: { gap: space.sm, paddingTop: space.xs },
  proposalsEyebrow: { letterSpacing: 0.8 },
  proposal: { borderWidth: 1, borderRadius: radius.xl, padding: space.md, gap: space.sm },
  proposalTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  proposalIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposalText: { flex: 1, gap: 1 },
  proposalEyebrow: { letterSpacing: 0.4 },
  proposalTotal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.sm,
    borderTopWidth: 1,
    paddingTop: space.sm,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: space.sm,
  },
  footerText: { flexShrink: 1, textAlign: 'center' },
  composerError: {
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  composer: { borderTopWidth: 1, paddingHorizontal: space.xl, paddingTop: space.sm },
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
  closed: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
});
