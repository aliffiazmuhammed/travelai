import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import {
  closePoll,
  createPoll,
  deletePoll,
  editComment,
  fetchComments,
  fetchDecisions,
  fetchPolls,
  markDiscussionRead,
  postComment,
  promoteDecision,
  removeComment,
  removeDecision,
  votePoll,
  type DiscussionComment,
  type TripDecision,
  type TripPoll,
} from '@/api/discussion';
import { fetchMyTrip } from '@/api/trips';
import { useSession } from '@/auth/SessionProvider';
import {
  ChoiceSheet,
  CommentActionsSheet,
  CommentEditSheet,
  PollActionsSheet,
  PollSheet,
  type ChoiceOption,
} from '@/components/discussion/DiscussionSheets';
import { useDecodedPolls, type DecodedPoll } from '@/hooks/useDecodedPolls';
import { useDiscussionCrypto, type DiscussionCrypto } from '@/hooks/useDiscussionCrypto';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Avatar, Button, Card, InlineError, Screen, Skeleton } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

const DECISION_PAGE = 4;
const POLL_PAGE = 3;
const COMMENTS_PER_REQUEST = 50;
const MAX_FETCH_PAGES = 12;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

/** Short, human time — the conversation only needs to answer "when-ish". */
function momentLabel(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diff = Date.now() - then.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  const day = `${then.getDate()} ${MONTHS[then.getMonth()]}`;
  return then.getFullYear() === new Date().getFullYear()
    ? day
    : `${day} ${then.getFullYear()}`;
}

/**
 * The backend pages the stream and caps a trip at 200 active comments, so a
 * bounded sweep is cheaper (and simpler) than paginating the screen from the
 * server: one client-side list can then be day-filtered and paged exactly.
 */
async function fetchEveryComment(tripId: string): Promise<DiscussionComment[]> {
  const seen = new Set<string>();
  const all: DiscussionComment[] = [];
  let before: string | null = null;

  for (let page = 0; page < MAX_FETCH_PAGES; page += 1) {
    const result = await fetchComments(tripId, { before, limit: COMMENTS_PER_REQUEST });
    for (const comment of result.comments) {
      if (seen.has(comment._id)) continue;
      seen.add(comment._id);
      all.push(comment);
    }
    if (!result.nextCursor) break;
    before = result.nextCursor;
  }
  return all;
}

function CardHead({
  icon,
  title,
  count,
  right,
}: {
  icon: IconName;
  title: string;
  count?: number;
  right?: ReactNode;
}) {
  const { palette } = useTheme();

  return (
    <View style={styles.cardHead}>
      <Ionicons name={icon} size={16} color={palette.primary} />
      <AppText variant="heading" style={styles.cardTitle} numberOfLines={1}>
        {title}
      </AppText>
      {typeof count === 'number' ? (
        <View style={[styles.countPill, { backgroundColor: palette.muted }]}>
          <AppText variant="caption" tone="muted">
            {count}
          </AppText>
        </View>
      ) : null}
      {right ?? null}
    </View>
  );
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (next: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <View style={styles.pager}>
      <Button
        label="Previous"
        variant="ghost"
        size="sm"
        disabled={page <= 1}
        onPress={() => onChange(page - 1)}
      />
      <AppText variant="caption" tone="muted">
        Page {page} of {pageCount}
      </AppText>
      <Button
        label="Next"
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onPress={() => onChange(page + 1)}
      />
    </View>
  );
}

/* Sealing status ---------------------------------------------------------- */

function SealStrip({ crypto }: { crypto: DiscussionCrypto }) {
  const { palette } = useTheme();
  const { status, keylessReason, error, retry } = crypto;

  if (status === 'off') return null;

  const pending = status === 'starting' || status === 'bootstrap';
  const tone =
    status === 'ready'
      ? palette.primary
      : status === 'error'
        ? palette.destructive
        : palette.accent;

  const title =
    status === 'ready'
      ? 'Sealed end to end'
      : status === 'error'
        ? 'Sealing hit a snag'
        : status === 'keyless'
          ? 'This phone is waiting for the key'
          : 'Setting up sealed messages';

  const body =
    status === 'ready'
      ? 'Every message is locked on this phone before it leaves, and only people on this trip can open it.'
      : status === 'error'
        ? error || 'The conversation key could not be loaded. Nothing you write will be sealed yet.'
        : status === 'keyless'
          ? keylessReason === 'mismatch'
            ? 'This phone hasn’t been recognised by the conversation key yet. When another member opens the trip, they can share it here. Until then, anything you send is visible to the server.'
            : 'The key hasn’t reached this phone yet. When another member opens the trip, it will be shared here. Until then, anything you send is visible to the server.'
          : status === 'bootstrap'
            ? 'This phone is creating the conversation key and handing it to everyone on the trip.'
            : 'Getting this phone’s key ready for the conversation.';

  return (
    <Card style={styles.sealCard}>
      <View style={styles.sealHead}>
        <View style={[styles.sealIcon, { backgroundColor: `${tone}18` }]}>
          <Ionicons
            name={
              status === 'ready'
                ? 'lock-closed-outline'
                : status === 'error'
                  ? 'alert-circle-outline'
                  : 'lock-open-outline'
            }
            size={15}
            color={tone}
          />
        </View>
        <AppText variant="bodyStrong" style={styles.sealTitle}>
          {title}
        </AppText>
        {pending ? <ActivityIndicator size="small" color={palette.primary} /> : null}
        {status === 'keyless' || status === 'error' ? (
          <Button label="Check again" variant="secondary" size="sm" onPress={retry} />
        ) : null}
      </View>
      <AppText variant="caption" tone="muted">
        {body}
      </AppText>
    </Card>
  );
}

/* Decisions ---------------------------------------------------------------- */

function DecisionItem({
  decision,
  body,
  ready,
  canRemove,
  busy,
  onUnmark,
}: {
  decision: TripDecision;
  body: string;
  ready: boolean;
  canRemove: boolean;
  busy: boolean;
  onUnmark: () => void;
}) {
  const { palette } = useTheme();

  return (
    <View style={[styles.decision, { borderColor: palette.border, backgroundColor: palette.muted }]}>
      {body ? (
        <AppText numberOfLines={5}>{body}</AppText>
      ) : (
        <View style={styles.sealedRow}>
          <Ionicons name="lock-closed-outline" size={13} color={palette.mutedForeground} />
          <AppText variant="body" tone="muted" style={styles.sealedText}>
            {ready
              ? 'This decision can’t be opened on this phone.'
              : 'Sealed — this phone needs the trip key to read it.'}
          </AppText>
        </View>
      )}
      <View style={styles.decisionMeta}>
        <Ionicons name="bookmark-outline" size={12} color={palette.primary} />
        <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.decisionMetaText}>
          {decision.label}
          {typeof decision.day === 'number' ? ` · Day ${decision.day}` : ''} ·{' '}
          {momentLabel(decision.createdAt)}
        </AppText>
        {busy ? (
          <ActivityIndicator size="small" color={palette.primary} />
        ) : canRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unmark this decision"
            hitSlop={8}
            onPress={onUnmark}
          >
            <AppText variant="caption" tone="muted" style={styles.unmark}>
              Unmark
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* Polls -------------------------------------------------------------------- */

function PollItem({
  poll,
  decoded,
  memberCount,
  ready,
  canVote,
  canManage,
  busy,
  onVote,
  onManage,
}: {
  poll: TripPoll;
  decoded?: DecodedPoll;
  memberCount: number;
  ready: boolean;
  canVote: boolean;
  canManage: boolean;
  busy: boolean;
  onVote: (index: number) => void;
  onManage: () => void;
}) {
  const { palette } = useTheme();
  const closed = Boolean(poll.closedAt);
  const votable = canVote && ready && !closed && !busy;
  const mine = decoded?.myChoice ?? null;
  // Participation is public even when the choices are not: the server counts
  // ballots, so a phone without the key still shows the right turnout.
  const voted = Math.max(decoded?.total ?? 0, poll.votes?.length ?? 0);
  const readable = Boolean(decoded && (decoded.question || decoded.options.length > 0));
  const creatorLine = poll.isYou
    ? `You started this · ${momentLabel(poll.createdAt)}`
    : `${poll.createdByLabel} started this · ${momentLabel(poll.createdAt)}`;

  return (
    <View style={[styles.poll, { borderColor: palette.border }]}>
      <View style={styles.pollHead}>
        <View style={styles.pollHeadText}>
          <AppText variant="bodyStrong">
            {readable ? decoded?.question || 'Untitled poll' : 'A sealed poll'}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {creatorLine}
          </AppText>
        </View>
        {canManage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Poll options"
            hitSlop={6}
            onPress={onManage}
            style={[styles.ellipsis, { backgroundColor: palette.muted }]}
          >
            <Ionicons name="ellipsis-horizontal" size={14} color={palette.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      {decoded && decoded.options.length > 0 ? (
        <View style={styles.pollOptions}>
          {decoded.options.map((option, index) => {
            const count = decoded.counts[index] ?? 0;
            const share = decoded.total > 0 ? count / decoded.total : 0;
            const selected = mine === index;

            return (
              <Pressable
                key={`${poll._id}-option-${index}`}
                accessibilityRole="button"
                accessibilityLabel={`Vote for ${option}`}
                accessibilityState={{ selected, disabled: !votable }}
                disabled={!votable}
                onPress={() => onVote(index)}
                style={({ pressed }) => [
                  styles.pollOption,
                  {
                    borderColor: selected ? palette.primary : palette.border,
                    backgroundColor: selected ? palette.muted : 'transparent',
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <View style={styles.pollOptionTop}>
                  <AppText variant={selected ? 'bodyStrong' : 'body'} numberOfLines={2} style={styles.pollOptionLabel}>
                    {option}
                  </AppText>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={15} color={palette.primary} />
                  ) : null}
                  <AppText variant="caption" tone="muted">
                    {count}
                  </AppText>
                </View>
                <View style={[styles.tallyTrack, { backgroundColor: palette.muted }]}>
                  <View
                    style={[
                      styles.tallyFill,
                      {
                        width: `${Math.round(share * 100)}%`,
                        backgroundColor: selected ? palette.primary : palette.secondary,
                      },
                    ]}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.sealedRow}>
          <Ionicons name="lock-closed-outline" size={13} color={palette.mutedForeground} />
          <AppText variant="caption" tone="muted" style={styles.sealedText}>
            {ready
              ? 'The question and choices can’t be opened on this phone.'
              : 'The question arrives sealed. This phone needs the trip key to show it.'}
          </AppText>
        </View>
      )}

      <View style={styles.pollFoot}>
        <AppText variant="caption" tone="muted">
          {closed
            ? `Voting closed · ${voted} ${voted === 1 ? 'vote' : 'votes'}`
            : voted === 0
              ? 'No votes yet'
              : `${voted} of ${Math.max(memberCount, voted)} voted`}
        </AppText>
        <AppText variant="caption" tone={closed ? 'muted' : 'primary'}>
          {closed
            ? 'The tally stays here'
            : !canVote
              ? 'Only commenters can vote'
              : !ready
                ? 'Waiting for the key'
                : 'Tap a choice to vote'}
        </AppText>
      </View>
    </View>
  );
}

/* One conversation row ------------------------------------------------------ */

function CommentBubble({
  comment,
  body,
  ready,
  canDecide,
  canEdit,
  canRemove,
  onActions,
}: {
  comment: DiscussionComment;
  body: string;
  ready: boolean;
  canDecide: boolean;
  canEdit: boolean;
  canRemove: boolean;
  onActions: () => void;
}) {
  const { palette } = useTheme();

  if (comment.deletedAt) {
    return (
      <View style={styles.tombstone}>
        <AppText variant="caption" tone="muted" style={styles.tombstoneText}>
          {comment.isYou ? 'Your message was removed' : 'A message was removed'}
        </AppText>
      </View>
    );
  }

  const bot = Boolean(comment.bot);
  const mine = comment.isYou && !bot;
  const actionable = canDecide || canEdit || canRemove;
  const metaTone = mine ? palette.primaryForeground : palette.mutedForeground;
  const sealed = comment.e2ee === true && !body;

  return (
    <View style={[styles.messageRow, mine ? styles.messageRowMine : styles.messageRowTheirs]}>
      {!mine ? (
        bot ? (
          <View style={[styles.botAvatar, { backgroundColor: `${palette.accent}22` }]}>
            <Ionicons name="sparkles" size={14} color={palette.accent} />
          </View>
        ) : (
          <Avatar name={comment.label} uri={comment.avatarUrl} size={30} />
        )
      ) : null}

      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: palette.primary, borderBottomRightRadius: radius.sm }
            : bot
              ? { backgroundColor: `${palette.accent}16`, borderColor: `${palette.accent}40`, borderBottomLeftRadius: radius.sm }
              : {
                  backgroundColor: palette.card,
                  borderColor: palette.border,
                  borderBottomLeftRadius: radius.sm,
                },
        ]}
      >
        {!mine ? (
          <View style={styles.bubbleNameRow}>
            <AppText
              variant="caption"
              tone={bot ? 'accent' : 'primary'}
              style={styles.bubbleName}
              numberOfLines={1}
            >
              {bot ? 'waytowalk' : comment.label}
            </AppText>
            {bot ? (
              <View style={[styles.aiChip, { borderColor: `${palette.accent}66` }]}>
                <Ionicons name="sparkles" size={9} color={palette.accent} />
                <AppText variant="caption" tone="accent" style={styles.aiChipText}>
                  AI
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {sealed ? (
          <View style={styles.sealedRow}>
            <Ionicons name="lock-closed-outline" size={13} color={metaTone} />
            <AppText
              variant="body"
              style={[styles.sealedText, { color: mine ? palette.primaryForeground : palette.mutedForeground }]}
            >
              {ready
                ? 'This message can’t be opened on this phone.'
                : 'Sealed — this phone needs the trip key to read it.'}
            </AppText>
          </View>
        ) : (
          <AppText
            style={mine ? { color: palette.primaryForeground } : undefined}
          >
            {body}
          </AppText>
        )}

        <View style={styles.bubbleMeta}>
          {typeof comment.day === 'number' ? (
            <View
              style={[
                styles.dayChip,
                {
                  borderColor: mine ? `${palette.primaryForeground}55` : palette.border,
                },
              ]}
            >
              <AppText variant="caption" style={{ color: metaTone }}>
                Day {comment.day}
              </AppText>
            </View>
          ) : null}
          <AppText variant="caption" style={{ color: metaTone }}>
            {momentLabel(comment.createdAt)}
          </AppText>
          {comment.editedAt ? (
            <AppText variant="caption" style={{ color: metaTone }}>
              · edited
            </AppText>
          ) : null}
          {actionable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Message options"
              hitSlop={8}
              onPress={onActions}
              style={styles.messageActions}
            >
              <Ionicons name="ellipsis-horizontal" size={14} color={metaTone} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/* Screen -------------------------------------------------------------------- */

export default function DiscussionScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const rawId = params.id;
  const tripId = Array.isArray(rawId) ? rawId[0] : rawId;
  const id = tripId ?? '';

  const [draft, setDraft] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<'all' | number>('all');
  const [dayFilterOpen, setDayFilterOpen] = useState(false);
  const [anchorDay, setAnchorDay] = useState<number | null>(null);
  const [anchorOpen, setAnchorOpen] = useState(false);
  const [decisionPage, setDecisionPage] = useState(1);
  const [pollPage, setPollPage] = useState(1);
  const [actionsComment, setActionsComment] = useState<DiscussionComment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<DiscussionComment | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [pollSheetError, setPollSheetError] = useState<string | null>(null);
  const [actionsPoll, setActionsPoll] = useState<TripPoll | null>(null);
  const [pollActionError, setPollActionError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [unmarkingId, setUnmarkingId] = useState<string | null>(null);
  const lastMarkedRef = useRef<string | null>(null);

  const tripQuery = useQuery({
    queryKey: ['my-trip', tripId],
    queryFn: () => (tripId ? fetchMyTrip(tripId) : Promise.reject(new Error('No trip requested.'))),
    enabled: Boolean(tripId),
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1,
  });

  const retryPolicy = (failureCount: number, error: unknown) =>
    !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 1;

  const commentsQuery = useQuery({
    queryKey: ['discussion-comments', tripId],
    queryFn: () => (tripId ? fetchEveryComment(tripId) : Promise.reject(new Error('No trip.'))),
    enabled: Boolean(tripId),
    retry: retryPolicy,
    refetchInterval: 20_000,
  });

  const decisionsQuery = useQuery({
    queryKey: ['discussion-decisions', tripId],
    queryFn: () => fetchDecisions(id),
    enabled: Boolean(tripId),
    retry: retryPolicy,
    refetchInterval: 30_000,
  });

  const pollsQuery = useQuery({
    queryKey: ['discussion-polls', tripId],
    queryFn: () => fetchPolls(id),
    enabled: Boolean(tripId),
    retry: retryPolicy,
    refetchInterval: 20_000,
  });

  const crypto = useDiscussionCrypto(tripId, user?._id, Boolean(tripId && user?._id));
  const { plaintextOf, syncRows, encryptOutgoing, sealJson, rememberPlaintext } = crypto;
  const ready = crypto.status === 'ready';

  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);
  const decisions = useMemo(() => decisionsQuery.data ?? [], [decisionsQuery.data]);
  const polls = useMemo(() => pollsQuery.data ?? [], [pollsQuery.data]);
  const decodedPolls = useDecodedPolls(polls, crypto, user?._id);

  const trip = tripQuery.data;
  const role = trip?.role ?? 'owner';
  const isOwner = role === 'owner';
  const canPost = role !== 'viewer';
  const memberCount = Math.max(trip?.members?.length ?? 0, 1);
  const tripDays = useMemo(
    () => trip?.tripDetails?.day_by_day_itinerary ?? [],
    [trip?.tripDetails?.day_by_day_itinerary]
  );

  // New rows (and the first page) are readable whether or not the key arrived
  // late: decryption is cached by ciphertext, so repeat sweeps cost nothing.
  useEffect(() => {
    syncRows([...comments, ...decisions]);
  }, [syncRows, comments, decisions]);

  // Opening the conversation is reading it. Marking is throttled by the newest
  // row's timestamp, so the 20s refresh doesn't hammer the read marker.
  const newestStamp = comments[0]?.createdAt ?? null;
  useEffect(() => {
    if (!tripId || !newestStamp || newestStamp === lastMarkedRef.current) return;
    lastMarkedRef.current = newestStamp;
    void markDiscussionRead(tripId)
      .then((state) => {
        queryClient.setQueryData(['discussion-read', tripId], state);
      })
      .catch(() => {
        lastMarkedRef.current = null;
      });
  }, [tripId, newestStamp, queryClient]);

  const invalidateComments = () =>
    queryClient.invalidateQueries({ queryKey: ['discussion-comments', tripId] });
  const invalidateDecisions = () =>
    queryClient.invalidateQueries({ queryKey: ['discussion-decisions', tripId] });
  const invalidatePolls = () =>
    queryClient.invalidateQueries({ queryKey: ['discussion-polls', tripId] });

  const sendComment = useMutation({
    mutationFn: async (text: string) => {
      const sealed = await encryptOutgoing(text);
      const saved = await postComment(id, {
        body: sealed.body,
        e2ee: sealed.e2ee,
        day: anchorDay ?? undefined,
      });
      rememberPlaintext(saved, text);
      return saved;
    },
    onSuccess: () => {
      setDraft('');
      setComposeError(null);
      void invalidateComments();
    },
    onError: (error) => setComposeError(messageOf(error)),
  });

  const saveEdit = useMutation({
    mutationFn: async (text: string) => {
      if (!editingComment) throw new Error('That message is no longer being edited.');
      const sealed = await encryptOutgoing(text);
      const saved = await editComment(id, editingComment._id, {
        body: sealed.body,
        e2ee: sealed.e2ee,
      });
      rememberPlaintext(saved, text);
      return saved;
    },
    onSuccess: () => {
      setEditingComment(null);
      setEditError(null);
      void invalidateComments();
    },
    onError: (error) => setEditError(messageOf(error)),
  });

  const removeMessage = useMutation({
    mutationFn: (commentId: string) => removeComment(id, commentId),
    onSuccess: () => {
      setActionsComment(null);
      setActionError(null);
      void invalidateComments();
    },
    onError: (error) => setActionError(messageOf(error)),
  });

  const markDecision = useMutation({
    mutationFn: (commentId: string) => promoteDecision(id, commentId),
    onSuccess: () => {
      setActionsComment(null);
      setActionError(null);
      void invalidateDecisions();
    },
    onError: (error) => setActionError(messageOf(error)),
  });

  const unmarkDecision = useMutation({
    mutationFn: (decisionId: string) => {
      setUnmarkingId(decisionId);
      return removeDecision(id, decisionId);
    },
    onSuccess: () => {
      setUnmarkingId(null);
      void invalidateDecisions();
    },
    onError: () => {
      setUnmarkingId(null);
      void invalidateDecisions();
    },
  });

  const startPoll = useMutation({
    mutationFn: async ({
      question,
      options,
    }: {
      question: string;
      options: string[];
    }) => {
      const sealed = await sealJson({ q: question, o: options });
      if (!sealed) {
        throw new Error('Polls can only start once this phone holds the trip key.');
      }
      return createPoll(id, sealed);
    },
    onSuccess: () => {
      setPollSheetOpen(false);
      setPollSheetError(null);
      setPollError(null);
      setPollPage(1);
      void invalidatePolls();
    },
    onError: (error) => setPollSheetError(messageOf(error)),
  });

  const castVote = useMutation({
    mutationFn: async ({ pollId, choice }: { pollId: string; choice: number }) => {
      const sealed = await sealJson(choice);
      if (!sealed) {
        throw new Error('This phone can’t seal a vote until it holds the trip key.');
      }
      setVotingPollId(pollId);
      return votePoll(id, pollId, sealed);
    },
    onSuccess: () => {
      setVotingPollId(null);
      setPollError(null);
      void invalidatePolls();
    },
    onError: (error) => {
      setVotingPollId(null);
      setPollError(messageOf(error));
    },
  });

  const shutPoll = useMutation({
    mutationFn: (pollId: string) => closePoll(id, pollId),
    onSuccess: () => {
      setActionsPoll(null);
      setPollActionError(null);
      void invalidatePolls();
    },
    onError: (error) => setPollActionError(messageOf(error)),
  });

  const dropPoll = useMutation({
    mutationFn: (pollId: string) => deletePoll(id, pollId),
    onSuccess: () => {
      setActionsPoll(null);
      setPollActionError(null);
      void invalidatePolls();
    },
    onError: (error) => setPollActionError(messageOf(error)),
  });

  const dayNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const day of tripDays) {
      if (typeof day.day === 'number') set.add(day.day);
    }
    for (const comment of comments) {
      if (typeof comment.day === 'number') set.add(comment.day);
    }
    return [...set].sort((a, b) => a - b);
  }, [tripDays, comments]);

  const titleOfDay = useMemo(() => {
    const titles = new Map<number, string>();
    for (const row of tripDays) {
      if (typeof row.day === 'number') titles.set(row.day, row.title?.trim() || '');
    }
    return titles;
  }, [tripDays]);

  const dayCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const comment of comments) {
      if (typeof comment.day !== 'number' || comment.deletedAt) continue;
      counts.set(comment.day, (counts.get(comment.day) ?? 0) + 1);
    }
    return counts;
  }, [comments]);

  const filterOptions: ChoiceOption[] = useMemo(
    () => [
      {
        key: 'all',
        title: 'Every day',
        subtitle:
          comments.length === 0
            ? 'The whole conversation'
            : `${comments.length} ${comments.length === 1 ? 'message' : 'messages'}`,
        icon: 'chatbubbles-outline',
      },
      ...dayNumbers.map((day) => ({
        key: String(day),
        title: `Day ${day}`,
        subtitle: [
          titleOfDay.get(day),
          `${dayCounts.get(day) ?? 0} ${dayCounts.get(day) === 1 ? 'message' : 'messages'}`,
        ]
          .filter(Boolean)
          .join(' · '),
        icon: 'calendar-outline' as IconName,
      })),
    ],
    [comments.length, dayNumbers, dayCounts, titleOfDay]
  );

  const anchorOptions: ChoiceOption[] = useMemo(
    () => [
      {
        key: 'none',
        title: 'No particular day',
        subtitle: 'The conversation as a whole.',
        icon: 'chatbubbles-outline',
      },
      ...dayNumbers.map((day) => ({
        key: String(day),
        title: `Day ${day}`,
        subtitle: titleOfDay.get(day) || 'Anchor this message to that day',
        icon: 'calendar-outline' as IconName,
      })),
    ],
    [dayNumbers, titleOfDay]
  );

  const visibleComments = useMemo(
    () =>
      dayFilter === 'all'
        ? comments
        : comments.filter((comment) => comment.day === dayFilter),
    [comments, dayFilter]
  );

  const decisionPageCount = Math.max(1, Math.ceil(decisions.length / DECISION_PAGE));
  const safeDecisionPage = Math.min(decisionPage, decisionPageCount);
  const pageDecisions = decisions.slice(
    (safeDecisionPage - 1) * DECISION_PAGE,
    safeDecisionPage * DECISION_PAGE
  );

  const pollPageCount = Math.max(1, Math.ceil(polls.length / POLL_PAGE));
  const safePollPage = Math.min(pollPage, pollPageCount);
  const pagePolls = polls.slice((safePollPage - 1) * POLL_PAGE, safePollPage * POLL_PAGE);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate('/trips');
  };

  const refreshAll = () => {
    void tripQuery.refetch();
    void commentsQuery.refetch();
    void decisionsQuery.refetch();
    void pollsQuery.refetch();
  };

  const refreshing =
    tripQuery.isRefetching ||
    commentsQuery.isRefetching ||
    decisionsQuery.isRefetching ||
    pollsQuery.isRefetching;

  const topRow = () => (
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
      <View
        style={[
          styles.sealChip,
          {
            backgroundColor:
              crypto.status === 'ready'
                ? palette.muted
                : crypto.status === 'error'
                  ? `${palette.destructive}14`
                  : `${palette.accent}18`,
          },
        ]}
      >
        <Ionicons
          name={
            crypto.status === 'ready'
              ? 'lock-closed-outline'
              : crypto.status === 'error'
                ? 'alert-circle-outline'
                : 'lock-open-outline'
          }
          size={12}
          color={
            crypto.status === 'ready'
              ? palette.primary
              : crypto.status === 'error'
                ? palette.destructive
                : palette.accent
          }
        />
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {crypto.status === 'ready'
            ? 'Sealed'
            : crypto.status === 'error'
              ? 'Sealing error'
              : crypto.status === 'keyless'
                ? 'Key pending'
                : 'Sealing…'}
        </AppText>
      </View>
    </View>
  );

  if (tripQuery.isPending) {
    return (
      <Screen scroll edges={['top']} contentContainerStyle={styles.content}>
        {topRow()}
        <View style={styles.page}>
          <View style={styles.titleBlock}>
            <Skeleton width="32%" height={12} />
            <Skeleton width="70%" height={34} />
            <Skeleton width="62%" height={14} />
          </View>
          <Card style={styles.skeletonCard}>
            <Skeleton height={13} />
            <Skeleton width="70%" height={13} />
          </Card>
          <Card style={styles.skeletonCard}>
            <Skeleton width="45%" height={22} />
            <Skeleton height={72} radius={radius.lg} />
            <Skeleton height={72} radius={radius.lg} />
          </Card>
        </View>
      </Screen>
    );
  }

  if (!trip || tripQuery.isError) {
    const status = tripQuery.error instanceof ApiError ? tripQuery.error.status : 0;
    const forbidden = status === 403;
    const notFound = status === 404;

    return (
      <Screen scroll edges={['top']} contentContainerStyle={styles.content}>
        {topRow()}
        <View style={styles.page}>
          <Card style={styles.errorCard}>
            <View style={[styles.errorIcon, { backgroundColor: `${palette.destructive}14` }]}>
              <Ionicons
                name={forbidden ? 'lock-closed-outline' : notFound ? 'map-outline' : 'alert-circle-outline'}
                size={26}
                color={palette.destructive}
              />
            </View>
            <AppText variant="title">
              {forbidden
                ? 'This conversation is for its members'
                : notFound
                  ? 'This trip has moved on'
                  : 'Something went wrong'}
            </AppText>
            <AppText tone="muted">
              {forbidden
                ? 'Your account doesn’t have access. If someone shared this trip with you, ask them for a fresh invite.'
                : notFound
                  ? 'It may have been deleted, or the link is out of date.'
                  : messageOf(tripQuery.error)}
            </AppText>
            <View style={styles.errorActions}>
              <Button label="Back to your trips" onPress={() => router.navigate('/trips')} />
              {!forbidden && !notFound ? (
                <Button label="Try again" variant="secondary" onPress={() => tripQuery.refetch()} />
              ) : null}
            </View>
          </Card>
        </View>
      </Screen>
    );
  }

  const filterLabel = dayFilter === 'all' ? 'Every day' : `Day ${dayFilter}`;
  const actionsText = actionsComment ? plaintextOf(actionsComment) : '';
  const canEditComment = Boolean(
    actionsComment && actionsComment.isYou && !actionsComment.deletedAt &&
      (!actionsComment.e2ee || Boolean(actionsText))
  );
  const canRemoveComment = Boolean(
    actionsComment && !actionsComment.deletedAt && (actionsComment.isYou || isOwner)
  );
  const canDecideComment = Boolean(
    actionsComment && !actionsComment.deletedAt && (actionsComment.isYou || isOwner)
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        scroll
        edges={['top']}
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={refreshAll}
      >
        {topRow()}

        <View style={styles.page}>
          <View style={styles.titleBlock}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
              <AppText variant="caption" tone="muted" style={styles.eyebrow}>
                THE CONVERSATION
              </AppText>
            </View>
            <AppText variant="display">Talk it through</AppText>
            <AppText variant="caption" tone="muted">
              Questions, quick calls and what you all settled — in one place, between the people
              who are actually going.
            </AppText>
            {!canPost ? (
              <View style={[styles.readOnly, { backgroundColor: palette.muted }]}>
                <Ionicons name="eye-outline" size={13} color={palette.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.readOnlyText}>
                  You’re reading along. Ask the owner for commenter access to join in.
                </AppText>
              </View>
            ) : null}
          </View>

          <SealStrip crypto={crypto} />

          {pollsQuery.isError ? (
            <Card style={styles.errorCard}>
              <AppText variant="bodyStrong">The polls didn’t load</AppText>
              <AppText variant="caption" tone="muted">
                {messageOf(pollsQuery.error)}
              </AppText>
              <Button label="Try again" variant="secondary" size="sm" onPress={() => pollsQuery.refetch()} />
            </Card>
          ) : polls.length > 0 || canPost ? (
            <Card style={styles.card}>
              <CardHead
                icon="stats-chart-outline"
                title="Group polls"
                count={polls.length}
                right={
                  canPost ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Start a poll"
                      disabled={!ready || startPoll.isPending}
                      onPress={() => {
                        setPollSheetError(null);
                        setPollSheetOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.smallAction,
                        {
                          backgroundColor: palette.muted,
                          opacity: !ready || startPoll.isPending ? 0.45 : pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Ionicons name="add" size={13} color={palette.primary} />
                      <AppText variant="caption" tone="primary">
                        New poll
                      </AppText>
                    </Pressable>
                  ) : undefined
                }
              />
              <AppText variant="caption" tone="muted">
                The question and every vote are sealed. The tally is worked out on each phone, not
                on our servers.
              </AppText>
              {canPost && !ready ? (
                <AppText variant="caption" tone="accent">
                  Polls unlock once this phone holds the trip key.
                </AppText>
              ) : null}
              <InlineError message={pollError} />

              {polls.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="stats-chart-outline" size={22} color={palette.mutedForeground} />
                  <AppText variant="bodyStrong">Nothing to decide yet</AppText>
                  <AppText variant="caption" tone="muted">
                    When a choice is split, start a poll and let the group settle it here.
                  </AppText>
                </View>
              ) : (
                <View style={styles.list}>
                  {pagePolls.map((poll) => (
                    <PollItem
                      key={poll._id}
                      poll={poll}
                      decoded={decodedPolls.get(poll._id)}
                      memberCount={memberCount}
                      ready={ready}
                      canVote={canPost}
                      canManage={poll.isYou || isOwner}
                      busy={votingPollId === poll._id}
                      onVote={(choice) => castVote.mutate({ pollId: poll._id, choice })}
                      onManage={() => {
                        setPollActionError(null);
                        setActionsPoll(poll);
                      }}
                    />
                  ))}
                </View>
              )}
              <Pager page={safePollPage} pageCount={pollPageCount} onChange={setPollPage} />
            </Card>
          ) : null}

          {decisionsQuery.isError ? (
            <Card style={styles.errorCard}>
              <AppText variant="bodyStrong">The decisions didn’t load</AppText>
              <AppText variant="caption" tone="muted">
                {messageOf(decisionsQuery.error)}
              </AppText>
              <Button label="Try again" variant="secondary" size="sm" onPress={() => decisionsQuery.refetch()} />
            </Card>
          ) : (
            <Card style={styles.card}>
              <CardHead icon="bookmark-outline" title="What we agreed" count={decisions.length} />
              <AppText variant="caption" tone="muted">
                Mark a message to keep the decision on record, even as the chat moves on.
              </AppText>

              {decisions.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="bookmark-outline" size={22} color={palette.mutedForeground} />
                  <AppText variant="bodyStrong">No decisions marked yet</AppText>
                  <AppText variant="caption" tone="muted">
                    When the group lands on something, keep it here so nobody has to scroll back.
                  </AppText>
                </View>
              ) : (
                <View style={styles.list}>
                  {pageDecisions.map((decision) => (
                    <DecisionItem
                      key={decision._id}
                      decision={decision}
                      body={plaintextOf(decision)}
                      ready={ready}
                      canRemove={decision.isYou || isOwner}
                      busy={unmarkingId === decision._id}
                      onUnmark={() => unmarkDecision.mutate(decision._id)}
                    />
                  ))}
                </View>
              )}
              <Pager
                page={safeDecisionPage}
                pageCount={decisionPageCount}
                onChange={setDecisionPage}
              />
            </Card>
          )}

          <Card style={styles.card}>
            <CardHead
              icon="chatbubbles-outline"
              title="Back-and-forth"
              count={visibleComments.length}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by day, currently ${filterLabel}`}
                  onPress={() => setDayFilterOpen(true)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    {
                      backgroundColor: palette.muted,
                      borderColor: dayFilter === 'all' ? palette.border : palette.primary,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Ionicons name="funnel-outline" size={12} color={palette.primary} />
                  <AppText variant="caption" tone="primary">
                    {filterLabel}
                  </AppText>
                  <Ionicons name="chevron-down" size={11} color={palette.mutedForeground} />
                </Pressable>
              }
            />
            <AppText variant="caption" tone="muted">
              {dayFilter === 'all'
                ? 'Newest first — the whole conversation.'
                : `Newest first — only what was said about Day ${dayFilter}.`}
            </AppText>

            {commentsQuery.isError ? (
              <View style={styles.inlineErrorBlock}>
                <AppText variant="bodyStrong">The conversation didn’t load</AppText>
                <AppText variant="caption" tone="muted">
                  {messageOf(commentsQuery.error)}
                </AppText>
                <Button
                  label="Try again"
                  variant="secondary"
                  size="sm"
                  onPress={() => commentsQuery.refetch()}
                />
              </View>
            ) : commentsQuery.isPending ? (
              <View style={styles.skeletonCard}>
                <Skeleton height={54} radius={radius.lg} />
                <Skeleton height={72} radius={radius.lg} />
                <Skeleton height={54} radius={radius.lg} />
              </View>
            ) : visibleComments.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={22} color={palette.mutedForeground} />
                <AppText variant="bodyStrong">
                  {dayFilter === 'all' ? 'Nothing said yet' : `Nothing about Day ${dayFilter} yet`}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {canPost
                    ? 'Start with the smallest useful thing: a question, a time, a place.'
                    : 'When the group starts talking, it will show up here.'}
                </AppText>
              </View>
            ) : (
              <View style={styles.thread}>
                {visibleComments.map((comment) => {
                  const text = plaintextOf(comment);
                  const owns = comment.isYou && !comment.bot;
                  const canDecide =
                    !comment.deletedAt && (comment.isYou || isOwner);
                  const canEdit =
                    owns &&
                    !comment.deletedAt &&
                    (!comment.e2ee || Boolean(text));
                  const canRemove =
                    !comment.deletedAt && (comment.isYou || isOwner);

                  return (
                    <CommentBubble
                      key={comment._id}
                      comment={comment}
                      body={text}
                      ready={ready}
                      canDecide={canDecide}
                      canEdit={canEdit}
                      canRemove={canRemove}
                      onActions={() => {
                        setActionError(null);
                        setActionsComment(comment);
                      }}
                    />
                  );
                })}
              </View>
            )}
          </Card>
        </View>
      </Screen>

      <View
        style={[
          styles.composerDock,
          {
            borderTopColor: palette.border,
            backgroundColor: palette.background,
            paddingBottom: insets.bottom + space.sm,
          },
        ]}
      >
        {canPost ? (
          <>
            {!ready ? (
              <View style={[styles.composerNotice, { backgroundColor: palette.muted }]}>
                <Ionicons name="lock-open-outline" size={12} color={palette.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.composerNoticeText}>
                  Sealing isn’t ready on this phone, so anything you send now is visible to the
                  server.
                </AppText>
              </View>
            ) : null}
            <InlineError message={composeError} />
            <View style={styles.composerRow}>
              <View
                style={[styles.composerField, { backgroundColor: palette.card, borderColor: palette.border }]}
              >
                <TextInput
                  accessibilityLabel="Message the group"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Message the group…"
                  placeholderTextColor={palette.mutedForeground}
                  selectionColor={palette.primary}
                  multiline
                  maxLength={2000}
                  style={[styles.composerInput, { color: palette.foreground }]}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !draft.trim() || sendComment.isPending }}
                disabled={!draft.trim() || sendComment.isPending}
                onPress={() => {
                  const text = draft.trim();
                  if (!text) return;
                  setComposeError(null);
                  sendComment.mutate(text);
                }}
                style={({ pressed }) => [
                  styles.sendButton,
                  {
                    backgroundColor: palette.primary,
                    opacity: !draft.trim() || sendComment.isPending ? 0.4 : pressed ? 0.8 : 1,
                  },
                ]}
              >
                {sendComment.isPending ? (
                  <ActivityIndicator size="small" color={palette.primaryForeground} />
                ) : (
                  <Ionicons name="arrow-up" size={18} color={palette.primaryForeground} />
                )}
              </Pressable>
            </View>
            <View style={styles.composerMeta}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  anchorDay === null ? 'Attach this message to a day' : `Attached to Day ${anchorDay}`
                }
                onPress={() => setAnchorOpen(true)}
                style={({ pressed }) => [
                  styles.anchorChip,
                  {
                    backgroundColor: palette.muted,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <Ionicons name="calendar-outline" size={11} color={palette.primary} />
                <AppText variant="caption" tone="primary">
                  {anchorDay === null ? 'Any day' : `Day ${anchorDay}`}
                </AppText>
                <Ionicons name="chevron-down" size={10} color={palette.mutedForeground} />
              </Pressable>
              {ready ? (
                <View style={styles.sealedHint}>
                  <Ionicons name="lock-closed-outline" size={10} color={palette.mutedForeground} />
                  <AppText variant="caption" tone="muted">
                    Sealed before it leaves
                  </AppText>
                </View>
              ) : null}
            </View>
          </>
        ) : (
          <View style={styles.viewerNotice}>
            <Ionicons name="eye-outline" size={15} color={palette.mutedForeground} />
            <AppText variant="caption" tone="muted" style={styles.viewerNoticeText}>
              You’re reading along. The owner can give you commenter access so you can join in.
            </AppText>
          </View>
        )}
      </View>

      {dayFilterOpen ? (
        <ChoiceSheet
          title="Which day?"
          subtitle="Follow one part of the plan, or read the whole conversation."
          options={filterOptions}
          selectedKey={dayFilter === 'all' ? 'all' : String(dayFilter)}
          onSelect={(key) => {
            setDayFilter(key === 'all' ? 'all' : Number(key));
            setDayFilterOpen(false);
          }}
          onClose={() => setDayFilterOpen(false)}
        />
      ) : null}

      {anchorOpen ? (
        <ChoiceSheet
          title="Anchor to a day"
          subtitle="Optional — it helps the message sit beside the right part of the plan."
          options={anchorOptions}
          selectedKey={anchorDay === null ? 'none' : String(anchorDay)}
          onSelect={(key) => {
            setAnchorDay(key === 'none' ? null : Number(key));
            setAnchorOpen(false);
          }}
          onClose={() => setAnchorOpen(false)}
        />
      ) : null}

      {actionsComment ? (
        <CommentActionsSheet
          authorLabel={actionsComment.label}
          canEdit={canEditComment}
          canRemove={canRemoveComment}
          canDecide={canDecideComment}
          busy={removeMessage.isPending || markDecision.isPending}
          error={actionError}
          onEdit={() => {
            setActionError(null);
            setEditingComment(actionsComment);
            setActionsComment(null);
          }}
          onDecide={() => markDecision.mutate(actionsComment._id)}
          onRemove={() => removeMessage.mutate(actionsComment._id)}
          onClose={() => {
            setActionsComment(null);
            setActionError(null);
          }}
        />
      ) : null}

      {editingComment ? (
        <CommentEditSheet
          initialText={plaintextOf(editingComment)}
          busy={saveEdit.isPending}
          error={editError}
          onSave={(text) => saveEdit.mutate(text)}
          onClose={() => {
            setEditingComment(null);
            setEditError(null);
          }}
        />
      ) : null}

      {pollSheetOpen ? (
        <PollSheet
          busy={startPoll.isPending}
          error={pollSheetError}
          onClose={() => {
            setPollSheetOpen(false);
            setPollSheetError(null);
          }}
          onSubmit={(question, options) => startPoll.mutate({ question, options })}
        />
      ) : null}

      {actionsPoll ? (
        <PollActionsSheet
          closed={Boolean(actionsPoll.closedAt)}
          busy={shutPoll.isPending || dropPoll.isPending}
          error={pollActionError}
          onClosePoll={() => shutPoll.mutate(actionsPoll._id)}
          onRemove={() => dropPoll.mutate(actionsPoll._id)}
          onClose={() => {
            setActionsPoll(null);
            setPollActionError(null);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: space.sm, paddingBottom: space.xl, gap: space.lg },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4, flex: 1 },
  sealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.pill,
    maxWidth: 150,
  },
  titleBlock: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.2 },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  readOnlyText: { flexShrink: 1 },
  sealCard: { gap: space.sm },
  sealHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sealIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealTitle: { flex: 1 },
  card: { gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1 },
  countPill: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  list: { gap: space.md },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.sm,
  },
  empty: { alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  inlineErrorBlock: { alignItems: 'flex-start', gap: space.sm, paddingVertical: space.sm },
  skeletonCard: { gap: space.sm },
  errorCard: { alignItems: 'flex-start', gap: space.sm },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  decision: {
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  decisionMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  decisionMetaText: { flex: 1 },
  unmark: { textDecorationLine: 'underline' },
  poll: {
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  pollHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  pollHeadText: { flex: 1, gap: 2 },
  ellipsis: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pollOptions: { gap: space.sm },
  pollOption: {
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pollOptionTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pollOptionLabel: { flex: 1 },
  tallyTrack: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  tallyFill: { height: '100%', borderRadius: radius.pill },
  pollFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  sealedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  sealedText: { flexShrink: 1 },
  thread: { gap: space.md },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  botAvatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%',
    gap: 4,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bubbleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  bubbleName: { fontWeight: '600' },
  aiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  aiChipText: { fontSize: 9, lineHeight: 12 },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
    marginTop: 1,
    opacity: 0.85,
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 0,
  },
  messageActions: { marginLeft: 2, paddingHorizontal: 2 },
  tombstone: { alignItems: 'center', paddingVertical: 2 },
  tombstoneText: { fontStyle: 'italic' },
  composerDock: {
    gap: space.sm,
    borderTopWidth: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
  },
  composerNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  composerNoticeText: { flex: 1 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  composerField: {
    flex: 1,
    minHeight: 46,
    maxHeight: 132,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  composerInput: {
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 4,
    maxHeight: 118,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  anchorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  sealedHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  viewerNoticeText: { flex: 1 },
});
