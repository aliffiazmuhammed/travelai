import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  BarChart3,
  Bot,
  ChevronDown,
  Loader2,
  MessageCircle,
  Pencil,
  Pin,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/relativeTime";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import type { TripComment, TripDecision, TripPoll, TripRole } from "@/types/trip";
import type {
  AssistantProposal,
  BotBubblePayload,
} from "@/types/trip";
import type { UseTripComments } from "@/hooks/useTripComments";
import type { ChatCryptoApi } from "@/hooks/useTripChatCrypto";
import { useDecodedPolls } from "@/hooks/useDecodedPolls";
import { PollCard, PollComposer, PollsBand } from "@/components/dashboard/Polls";
import { isRevConflict } from "@/lib/conflicts";

/**
 * The 9th tab (Milestone 6 §19.7 / §20, sprint F6b) — day-anchored discussion
 * beside the itinerary.
 *
 * Rank-aware in three states (the server enforces the real rules — this is UX
 * honesty, not authorization): the composer is open for `commenter`+, shown
 * WITH a "watch-only" message for viewers, and this tab itself is only mounted
 * for real trips with a role at all (anonymous share pages never see it).
 *
 * Rendering is deliberately dull: plain-text bodies as React text nodes, no
 * markdown, no rich text — XSS-safe by construction (§19.9).
 */

interface CommentsTabProps {
  tripId: string;
  /** The caller's own role on this trip. */
  myRole: TripRole;
  /** Number of itinerary days available as anchors (bounds the day picker). */
  days?: number;
  /** The shared comment state owned by ItineraryDisplay / useTripComments. */
  controller: UseTripComments;
  /** The E2EE layer (F10) — thoughtfully optional for a plain-text fallback. */
  crypto?: ChatCryptoApi;
  /** Other members currently "typing…" (F8b) — auto-expired upstream. */
  typingLabels?: string[];
  /** Composer keystroke hook for the throttled "I'm composing" ping (F8b). */
  onTyping?: () => void;
  /**
   * Surface shape (F8b §11): **'feed'** — the Discuss tab, newest-first with
   * day filters; **'chat'** — the drawer, a real chat: chronological order
   * with the newest message at the BOTTOM, composer pinned to the bottom
   * edge, auto-scroll, no inner card/header (the drawer owns the header).
   * One logic core, two shapes — the same controller drives both.
   */
  variant?: "feed" | "chat";
  /**
   * F12b: composes a TravelAI proposal into the open ItineraryData snapshot
   * and saves it through the SAME path manual editing uses (required baseRev,
   * versioned). Absent for read-only viewers — their cards render the
   * suggestion without the Apply controls.
   */
  onApplyProposal?: (proposal: AssistantProposal) => Promise<void> | void;
  /**
   * F13a: the caller's own user id. Polls are voted on by comparing the stable
   * id on each vote (broadcast frames cannot carry a per-recipient `isYou`),
   * so without it a member would not see which option is theirs.
   */
  currentUserId?: string;
}

const COMMENT_MAX_LEN = 2000; // mirrors COMMENT_MAX_LEN (server default)

/** F12a: the mention token that turns a message into a TravelAI ask. */
const BOT_MENTION_RE = /@travelai/i;

/**
 * F12c: mirrors the server's task detector — a summary ask feeds the bot the
 * pinned decision cards as well as recent messages, so the answer leads with
 * what the group DECIDED. Staying roughly aligned with `assistantTaskFrom`
 * is deliberate; the server re-infers authoritatively from the question.
 */
const BOT_SUMMARY_RE =
  /(summari[sz]e|recap|catch (me|us) up|what (did|have) we (decide[ds]?|agree[ds]?|settle[ds]?)|bring (me|us) up to speed)/i;

/** F15: the literal the Ask chip and the mention menu insert. */
const BOT_MENTION_TOKEN = "@TravelAI";

/** F15: the one-time composer tip is dismissed per browser, never per trip. */
const AI_HINT_KEY = "travelai.aiHintDismissed";

/**
 * F15: the active "@partial" token ending at the caret, if (and only if) the
 * partial is still a prefix of "travelai". Offering it only while the mention
 * is being spelled keeps normal prose alone — an email address or an "@" plus
 * someone's name never opens the menu — and the full token hides it again so
 * Enter still means "send".
 */
function mentionTokenAt(
  value: string,
  caret: number
): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([a-zA-Z]{0,12})$/.exec(before);
  if (!match) return null;
  const query = match[2].toLowerCase();
  if (query.length >= "travelai".length) return null;
  if (!"travelai".startsWith(query)) return null;
  return { start: caret - query.length - 1, query };
}

/**
 * F12b/F12d: parse a TravelAI proposal envelope out of a decrypted bot row. The
 * envelope is written by our own ask flow; this parses defensively because a
 * malicious client can flag any of its own rows `bot: true` — anything that
 * does not validate renders as plain text and stays harmless.
 */
function parseBotCard(
  plain: string
): { text: string; proposal: AssistantProposal } | null {
  const body = plain.trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(body) as BotBubblePayload | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.text !== "string") return null;
    const proposal = parsed.proposal;
    return looksLikeProposal(proposal) ? { text: parsed.text, proposal } : null;
  } catch {
    return null;
  }
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPosition = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const isDayNumber = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1;

/**
 * Client-side backstop mirroring the server's zod union. Structural kinds
 * additionally carry `expect` (the drift guard `lib/proposalApply` checks
 * against the live itinerary before saving) and 0-based positions.
 */
function looksLikeProposal(proposal: unknown): proposal is AssistantProposal {
  if (!proposal || typeof proposal !== "object") return false;
  const p = proposal as Record<string, unknown>;
  switch (p.kind) {
    case "title":
      return isText(p.value);
    case "budget":
      return typeof p.value === "number" && p.value > 0;
    case "day_title":
    case "day_tip":
      return isDayNumber(p.day) && isText(p.value);
    case "swap_days":
      return isDayNumber(p.from_day) && isDayNumber(p.to_day) && p.from_day !== p.to_day;
    case "move_activity":
      return (
        isDayNumber(p.day) &&
        isPosition(p.index) &&
        isDayNumber(p.to_day) &&
        isPosition(p.to_index) &&
        isText(p.expect)
      );
    case "update_activity":
      return isDayNumber(p.day) && isPosition(p.index) && isText(p.value) && isText(p.expect);
    default:
      return false;
  }
}

/** Human label for the card header (what the change touches). */
function proposalLabel(proposal: AssistantProposal): string {
  switch (proposal.kind) {
    case "title":
      return "Rename the trip";
    case "budget":
      return "Budget per person";
    case "day_title":
      return `Day ${proposal.day} — title`;
    case "day_tip":
      return `Day ${proposal.day} — add a tip`;
    case "swap_days":
      return `Day ${proposal.from_day} ↔ Day ${proposal.to_day}`;
    case "move_activity":
      return `Day ${proposal.day} → Day ${proposal.to_day} — move an activity`;
    default:
      return `Day ${proposal.day} — rename an activity`;
  }
}

/** The proposal's value side of the diff, shown after the "→". */
function formatProposalValue(proposal: AssistantProposal): string {
  switch (proposal.kind) {
    case "budget":
      return proposal.value.toLocaleString();
    case "swap_days":
      return "Exchange these two days' plans";
    case "move_activity":
      return `“${proposal.expect}” moves to Day ${proposal.to_day}`;
    case "update_activity":
      return `“${proposal.value}”`;
    default:
      return proposal.value;
  }
}

/**
 * The plaintext fallback layer (F10): when no crypto hook is wired (or the
 * browser lacks WebCrypto), chat runs honestly unencrypted. Never pretends.
 */
const OFFLINE_CRYPTO: ChatCryptoApi = {
  status: "off",
  isEncrypted: () => false,
  plaintextOf: (row) => row?.body ?? "",
  syncRows: () => undefined,
  rememberPlaintext: () => undefined,
  encryptOutgoing: async (plaintext) => ({ body: plaintext, e2ee: false }),
  sealJson: async () => null,
  openJson: async () => null,
  retry: () => undefined,
  resetChat: async () => {
    throw new Error("Chat is unavailable in this browser.");
  },
};

/**
 * Chat-style timestamp (WhatsApp convention) — lives in `lib/relativeTime` so
 * the chat, the decisions strip and the poll cards share one implementation.
 */

export const CommentsTab: React.FC<CommentsTabProps> = ({
  tripId,
  myRole,
  days,
  controller,
  crypto,
  typingLabels = [],
  onTyping,
  variant = "feed",
  onApplyProposal,
  currentUserId,
}) => {
  const { state } = controller;
  const { comments, dayCounts } = state;
  const canWrite = myRole !== "viewer";
  const isChat = variant === "chat";
  const cryptoApi = crypto ?? OFFLINE_CRYPTO;

  /**
   * Render text for one row. Rows this device cannot read yet get the
   * WhatsApp-style waiting line — no "encrypted/decrypted" jargon in the chat.
   */
  const bodyOf = (row: { _id: string; body: string; e2ee?: boolean }) => {
    if (!cryptoApi.isEncrypted(row)) return row.body;
    const plain = cryptoApi.plaintextOf(row);
    return plain || "Waiting for this message…";
  };

  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [anchorDay, setAnchorDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TripComment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Context actions (edit/pin/delete) open on right-click or long-press —
  // Telegram style — so bubbles stay clean. Which one is open, if any.
  const [actionsForId, setActionsForId] = useState<string | null>(null);
  // Guards against the click that mobile fires right after a long-press
  // instantly closing the menu it just opened.
  const actionsOpenedAtRef = useRef(0);
  // F9: which decision card is mid-unmark (one at a time, like row removals).
  const [busyDecisionId, setBusyDecisionId] = useState<string | null>(null);
  // F12a: a @TravelAI ask is in flight — "TravelAI is typing…" placeholder.
  const [botThinking, setBotThinking] = useState(false);
  // F12b: per-row local decision state for proposal cards (the row itself is
  // immutable ciphertext — "applied"/"dismissed" survive only this visit).
  const [appliedProposals, setAppliedProposals] = useState<Set<string>>(new Set());
  const [dismissedProposals, setDismissedProposals] = useState<Set<string>>(new Set());
  // F13a: poll composer + the one poll whose vote/close/remove is in flight.
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollCreating, setPollCreating] = useState(false);
  const [pollBusyId, setPollBusyId] = useState<string | null>(null);
  // F10 recovery: this device cannot open any existing key, so the only way
  // forward is a new chat key. Confirm first — older messages stay locked.
  const [resetChatOpen, setResetChatOpen] = useState(false);
  const [resettingChat, setResettingChat] = useState(false);
  // F15: the mention menu is driven by the caret, and the "it reads this chat"
  // tip is a one-time coach mark — dismissed per browser, so it never nags.
  const [mentionOpen, setMentionOpen] = useState(false);
  const [aiHintDismissed, setAiHintDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(AI_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  /** Compose the proposal through the parent save path, then mark the card. */
  const applyProposal = async (row: TripComment) => {
    const proposal = parseBotCard(bodyOf(row))?.proposal;
    if (!proposal || !onApplyProposal) return;
    try {
      setBusyId(row._id);
      await onApplyProposal(proposal);
      setAppliedProposals((prev) => new Set(prev).add(row._id));
    } catch (err: any) {
      // A 409 already showed its own conflict medicine upstream — no duet.
      if (!isRevConflict(err)) {
        toast.error(err?.message || "Could not apply this proposal. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  };
  const { decidedCommentIds } = controller;
  const decisions = state.decisions;

  // Load the first page when the tab is opened (TabsContent mounts lazily).
  useEffect(() => {
    controller.ensureLoaded();
  }, [controller]);

  // F10: run the decrypt pass whenever rows change (initial page, frames,
  // edits, earlier pages) and the decisions strip too. syncRows is empty
  // unless the crypto layer is ready — a no-op otherwise.
  useEffect(() => {
    cryptoApi.syncRows(comments);
  }, [comments, cryptoApi]);
  useEffect(() => {
    cryptoApi.syncRows(decisions);
  }, [decisions, cryptoApi]);

  // Dismiss the context actions on anything but the bubble that opened them:
  // a click elsewhere, Escape, or any scroll (capture — the chat surface is a
  // scroll container). The openedAt guard swallows the phantom click that
  // touchend produces right after a long-press opens the menu.
  useEffect(() => {
    if (!actionsForId) return;
    const dismiss = (event?: Event) => {
      if (event?.type === "click" && Date.now() - actionsOpenedAtRef.current < 350) return;
      setActionsForId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsForId(null);
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [actionsForId]);

  const openActionsFor = (id: string) => {
    actionsOpenedAtRef.current = Date.now();
    setActionsForId(id);
  };

  const dayChips = useMemo(
    () =>
      Object.keys(dayCounts)
        .map(Number)
        .filter((day) => day > 0 && dayCounts[String(day)] > 0)
        .sort((a, b) => a - b),
    [dayCounts]
  );

  const visible = useMemo(
    () =>
      dayFilter === null
        ? comments
        : comments.filter((row) => row.day === dayFilter),
    [comments, dayFilter]
  );

  const anchoredDays = useMemo(() => {
    const max = Math.max(days || 0, ...dayChips, 0);
    return Array.from({ length: Math.max(0, max) }, (_, index) => index + 1);
  }, [days, dayChips]);

  /* --- Chat shape (variant='chat') -------------------------------------- */

  // The chat reads CREATION order — the reverse of the newest-first stream —
  // with fresh messages at the bottom and "load earlier" at the top.
  const chronological = useMemo(
    () => (isChat ? [...visible].reverse() : visible),
    [isChat, visible]
  );

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  // True while the reader hugs the newest message; scrolling up releases the
  // pin so reading history is not yanked back down by a live arrival.
  const nearBottomRef = useRef(true);

  const handleChatScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  // Follow the tail: on mount (drawer opens with history), on every new row,
  // and on decisions/strip changes — but only while the pin holds.
  useEffect(() => {
    if (!isChat) return;
    const el = chatScrollRef.current;
    if (!el || !nearBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [isChat, chronological.length, state.status, decisions.length]);

  /**
   * F12a: a @TravelAI ask is live while the draft mentions the bot (any
   * casing — the server re-checks the gate authoritatively).
   */
  const botAskActive = canWrite && BOT_MENTION_RE.test(draft);

  /**
   * The client-fed grounding (user-confirmed: ask + last 8). Counts the last
   * 8 messages readable through the crypto layer — which transparently covers
   * e2ee rows AND legacy plaintext. Undecryptable rows (no key yet) are
   * skipped honestly rather than shipped, tombstones never.
   */
  const botContextCount = useMemo(() => {
    let count = 0;
    for (let i = chronological.length - 1; i >= 0 && count < 8; i -= 1) {
      const row = chronological[i];
      if (row.deletedAt) continue;
      if (cryptoApi.isEncrypted(row) && !cryptoApi.plaintextOf(row)) continue;
      if (!row.body) continue;
      count += 1;
    }
    return count;
  }, [chronological, cryptoApi]);

  /**
   * Ships the grounding: the last 8 readable rows, most recent first. F12c: a
   * summary ask leads with the pinned DECISION cards (decrypted snapshots —
   * the durable conclusions), then messages fill the remaining lines. Labels
   * clamp to 32 chars — the zod wall rejects longer ones outright.
   */
  const buildBotContext = (includeDecisions = false): Array<{ label: string; text: string }> => {
    const lines: Array<{ label: string; text: string }> = [];
    if (includeDecisions) {
      for (const decision of decisions.slice(0, 4)) {
        if (decision.deletedAt) continue;
        if (cryptoApi.isEncrypted(decision) && !cryptoApi.plaintextOf(decision)) continue;
        const text = decision.body ? bodyOf(decision) : "";
        if (!text) continue;
        lines.push({ label: "Decision", text: text.slice(0, 500) });
      }
    }
    for (let i = chronological.length - 1; i >= 0 && lines.length < 8; i -= 1) {
      const row = chronological[i];
      if (row.deletedAt) continue;
      if (!row.body && !cryptoApi.isEncrypted(row)) continue;
      if (cryptoApi.isEncrypted(row) && !cryptoApi.plaintextOf(row)) continue;
      lines.push({
        label: (row.isYou ? "You" : row.label).slice(0, 32),
        text: bodyOf(row).slice(0, 500),
      });
    }
    return lines; // most recent first — the server flips it into the prompt
  };

  const submit = async () => {
    const plain = draft.trim();
    if (!plain || state.submitting) return;
    // Capture BEFORE the draft clears — the mention decides the F12a branch.
    const botAsk = BOT_MENTION_RE.test(plain);
    // F15: the Ask chip makes a bare mention one tap away — never post it.
    // The server would reject the ask anyway; catch it before a stray message.
    if (botAsk && !plain.replace(BOT_MENTION_RE, "").trim()) {
      toast.error("Add your question after @TravelAI.");
      composerRef.current?.focus();
      return;
    }
    try {
      // F10: encrypt before it leaves the browser (falls back to plaintext,
      // flagged honestly, when encryption is unavailable).
      const payload = await cryptoApi.encryptOutgoing(plain);
      const row = await controller.addComment(
        payload.body,
        anchorDay ?? undefined,
        payload.e2ee,
        plain // optimistic bubble shows the words, never the base64
      );
      if (row && payload.e2ee) cryptoApi.rememberPlaintext(row._id, plain);
      setDraft("");
      setMentionOpen(false);
      autosizeComposer();
      toast.success("Message sent");

      if (!botAsk) return;
      // F12c: a summary ask feeds the pinned decision cards into the grounding
      // as well (the durable conclusions), and the asker's day anchor rides
      // along so the assistant knows which day the question is about.
      const summarize = BOT_SUMMARY_RE.test(plain);
      const context = buildBotContext(summarize);
      setBotThinking(true);
      try {
        const answer = await api.askTravelAI(tripId, {
          prompt: plain,
          context,
          day: anchorDay ?? undefined,
        });
        // F12b: a proposal rides INSIDE the bubble as a visible JSON envelope
        // — other members decrypt the same bytes and render the same card.
        const bubble = answer.proposal
          ? JSON.stringify({
              v: 1,
              text: answer.reply,
              proposal: answer.proposal,
            } satisfies BotBubblePayload)
          : answer.reply;
        const replyPayload = await cryptoApi.encryptOutgoing(bubble);
        const replyRow = await controller.addComment(
          replyPayload.body,
          anchorDay ?? undefined,
          replyPayload.e2ee,
          bubble, // optimistic bubble carries the envelope too — no card flash
          true // bot flag → renders as the TravelAI participant
        );
        if (replyRow && replyPayload.e2ee) {
          cryptoApi.rememberPlaintext(replyRow._id, bubble);
        }
      } catch (err: any) {
        toast.error(
          err?.message || "TravelAI could not answer right now — try again in a moment."
        );
      } finally {
        setBotThinking(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not send your message. Please try again.");
    }
  };

  const startEdit = (row: TripComment) => {
    // Never seed the edit box from a row this device cannot read yet: saving
    // would overwrite the real message with the waiting line.
    if (cryptoApi.isEncrypted(row) && !cryptoApi.plaintextOf(row)) {
      toast.error("This message isn't ready on this device yet.");
      return;
    }
    setEditingId(row._id);
    setEditDraft(bodyOf(row)); // never open a base64 blob in the edit box
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const plain = editDraft.trim();
    if (!plain) return;
    setBusyId(editingId);
    try {
      const payload = await cryptoApi.encryptOutgoing(plain);
      await controller.editComment(editingId, payload.body, payload.e2ee);
      if (payload.e2ee) cryptoApi.rememberPlaintext(editingId, plain);
      setEditingId(null);
      setEditDraft("");
    } catch (err: any) {
      toast.error(err?.message || "Could not save the change.");
    } finally {
      setBusyId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  /** F9: promotes a remark into the pinned decisions strip. */
  const markDecision = async (row: TripComment) => {
    setBusyId(row._id);
    try {
      await controller.promoteComment(row._id);
      toast.success("Marked as a decision");
    } catch (err: any) {
      toast.error(err?.message || "Could not mark this as a decision.");
    } finally {
      setBusyId(null);
    }
  };

  /** F9: unmarks a decision card (promoter-or-owner; re-promotable). */
  const unmarkDecision = async (row: TripDecision) => {
    setBusyDecisionId(row._id);
    try {
      await controller.removeDecision(row._id);
      toast.success("Decision unmarked");
    } catch (err: any) {
      toast.error(err?.message || "Could not unmark this decision.");
    } finally {
      setBusyDecisionId(null);
    }
  };

  /* ----------------------------------------------------------------------- */
  /*  Polls (F13a) — open polls are always in sight; the tally is local       */
  /* ----------------------------------------------------------------------- */

  const polls = state.polls;
  const decodedPolls = useDecodedPolls(polls, cryptoApi, currentUserId);
  /**
   * Ownership is derived from the stable creator id, never from `poll.isYou`:
   * a live frame is one payload for everyone and carries the actor's view, so
   * trusting the flag would label someone else's poll "You" and offer them
   * close/remove on it (the server would 403, but the UI must not lie).
   */
  const isMine = (poll: TripPoll) =>
    currentUserId ? poll.createdBy === currentUserId : poll.isYou;
  // The band carries only polls that still take votes; closed ones stay in the
  // transcript as the record of what the group settled.
  const openPolls = useMemo(() => polls.filter((poll) => !poll.closedAt), [polls]);

  /** Sealing is the chat surface's job — it is the only holder of the key. */
  const sealForPoll = async (value: unknown): Promise<string> => {
    const sealed = await cryptoApi.sealJson(value);
    if (!sealed) {
      throw new Error("Chat is still unlocking on this device — try again in a moment.");
    }
    return sealed;
  };

  const voteOnPoll = async (poll: TripPoll, index: number) => {
    if (pollBusyId || poll.closedAt || !canWrite) return;
    setPollBusyId(poll._id);
    try {
      await controller.votePoll(poll._id, await sealForPoll(index));
    } catch (err: any) {
      toast.error(err?.message || "Your vote could not be recorded.");
    } finally {
      setPollBusyId(null);
    }
  };

  const closePoll = async (poll: TripPoll) => {
    if (pollBusyId) return;
    setPollBusyId(poll._id);
    try {
      await controller.closePoll(poll._id);
      toast.success("Poll closed");
    } catch (err: any) {
      toast.error(err?.message || "Could not close this poll.");
    } finally {
      setPollBusyId(null);
    }
  };

  const removePoll = async (poll: TripPoll) => {
    if (pollBusyId) return;
    setPollBusyId(poll._id);
    try {
      await controller.removePoll(poll._id);
      toast.success("Poll removed");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove this poll.");
    } finally {
      setPollBusyId(null);
    }
  };

  /** Creates the poll from the dialog — sealed before it leaves the browser. */
  const createPoll = async (question: string, options: string[]) => {
    if (pollCreating) return;
    setPollCreating(true);
    try {
      await controller.createPoll(await sealForPoll({ q: question, o: options }));
      setPollComposerOpen(false);
      toast.success("Poll started");
    } catch (err: any) {
      toast.error(err?.message || "Could not start the poll.");
    } finally {
      setPollCreating(false);
    }
  };

  const canCreatePoll = canWrite && cryptoApi.status === "ready";

  /**
   * The transcript is comments PLUS polls, in creation order. A poll belongs
   * where the conversation produced it, so it is interleaved by `createdAt`
   * rather than pinned off to one side; the band above the chat is the copy
   * that never scrolls away. A day filter filters *messages*, so polls bow out
   * there (they are never day-anchored).
   */
  const timeline = useMemo(() => {
    const items: Array<
      { kind: "comment"; at: number; row: TripComment } | { kind: "poll"; at: number; poll: TripPoll }
    > = chronological.map((row) => ({
      kind: "comment" as const,
      at: Date.parse(row.createdAt) || 0,
      row,
    }));
    if (dayFilter === null) {
      for (const poll of polls) {
        items.push({ kind: "poll", at: Date.parse(poll.createdAt) || 0, poll });
      }
    }
    return items.sort((a, b) => a.at - b.at);
  }, [chronological, polls, dayFilter]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setBusyId(target._id);
    try {
      await controller.removeComment(target);
      toast.success(target.isYou ? "Your message was removed" : "Message removed");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove the message.");
    } finally {
      setBusyId(null);
    }
  };

  const retry = () => {
    controller.ensureLoaded();
    // ensureLoaded is idempotent per open; force a fresh attempt by reloading state
  };

  const startNewChat = async () => {
    setResettingChat(true);
    try {
      await cryptoApi.resetChat();
      setResetChatOpen(false);
      toast.success("Chat is ready on this device. New messages and polls are protected.");
    } catch (err: any) {
      toast.error(err?.message || "Could not start a new chat. Please try again.");
    } finally {
      setResettingChat(false);
    }
  };

  /** Auto-grow — the WhatsApp trick: the input is one line until it isn't. */
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const autosizeComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  };

  /**
   * F15: show/hide the mention menu from the CURRENT draft + caret. Stateless
   * on purpose — a pasted "@trav" behaves exactly like typed letters.
   */
  const syncMentionMenu = (value: string, caret: number | null) => {
    const token = mentionTokenAt(value, caret ?? value.length);
    setMentionOpen(Boolean(token) && canWrite);
  };

  /**
   * F15: accept the suggestion (menu) or start an ask (chip). The mention is
   * typed, never auto-sent: the server's mention gate stays the cost brake,
   * and the violet disclosure explains what leaves the device next.
   */
  const insertMention = (source: "menu" | "chip") => {
    const el = composerRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const token = source === "menu" ? mentionTokenAt(draft, caret) : null;
    const start = token ? token.start : caret;
    const before = draft.slice(0, start);
    const after = draft.slice(token ? caret : start);
    // Mid-sentence, keep one space between the words and the mention.
    const lead = before && !/\s$/.test(before) ? " " : "";
    // If text already follows (a token was completed mid-sentence), don't
    // leave a double space behind the mention.
    const trail = /\s/.test(after.charAt(0)) ? "" : " ";
    const inserted = `${lead}${BOT_MENTION_TOKEN}${trail}`;
    if (before.length + inserted.length + after.length > COMMENT_MAX_LEN) {
      setMentionOpen(false);
      return;
    }
    setDraft(`${before}${inserted}${after}`);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
      if (isChat) autosizeComposer();
    });
    onTyping?.();
  };

  const dismissAiHint = () => {
    setAiHintDismissed(true);
    try {
      window.localStorage.setItem(AI_HINT_KEY, "1");
    } catch {
      /* private mode: hiding it for this visit is enough */
    }
  };

  /* ----------------------------------------------------------------------- */
  /*  Shared fragments — one logic core, two surface shapes                   */
  /* ----------------------------------------------------------------------- */

  const typingLine =
    typingLabels.length > 0 ? (
      <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-primary">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="truncate">
          {typingLabels.length === 1
            ? `${typingLabels[0]} is typing…`
            : `${typingLabels.slice(0, 2).join(", ")}${
                typingLabels.length > 2
                  ? ` and ${typingLabels.length - 2} more`
                  : ""
              } are typing…`}
        </span>
      </div>
    ) : null;

  const botThinkingLine = botThinking ? (
    <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
      <Bot className="h-3.5 w-3.5 shrink-0" />
      <span>TravelAI is thinking…</span>
    </div>
  ) : null;

  /**
   * F12a disclosure (user-confirmed design): while the draft mentions
   * @TravelAI, the composer states exactly what will leave the group's
   * end-to-end envelope — THIS message plus the N most recent readable ones.
   * Everyone else's rows never leave the trip unencrypted, and the answer
   * comes back encrypted into the thread like any other message.
   */
  const botDisclosure =
    botAskActive && !botThinking ? (
      <div className="flex items-start gap-1.5 rounded-xl border border-violet-300/50 bg-violet-500/5 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-violet-700 dark:border-violet-500/30 dark:text-violet-300">
        <Sparkles className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Asking TravelAI{anchorDay ? ` about Day ${anchorDay}` : ""}
          {BOT_SUMMARY_RE.test(draft) ? " for a recap" : ""} — sends this message plus{" "}
          {botContextCount === 0 ? "no" : botContextCount} recent chat message
          {botContextCount === 1 ? "" : "s"}
          {BOT_SUMMARY_RE.test(draft) ? " and the pinned decision cards" : ""} to the AI
          provider. The reply appears in this chat.
        </span>
      </div>
    ) : null;

  const loadEarlierButton = state.nextCursor ? (
    <div className="text-center">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={state.loadingEarlier}
        onClick={() => void controller.loadEarlier()}
        className="rounded-xl text-xs font-bold gap-1.5 h-8 px-3 text-muted-foreground"
      >
        {state.loadingEarlier ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span>Load earlier messages</span>
      </Button>
    </div>
  ) : null;

  /**
   * Honest but plain-language: while this device cannot use the chat's secure
   * channel, a message sent from here is not protected. No crypto vocabulary,
   * no icons — one quiet line and a way to try again.
   *
   * F10e: this covers EVERY not-ready state, not just error/keyless. 'starting'
   * and 'bootstrap' send plaintext too (the first open mints and shares the key,
   * which takes a moment), and 'off' means this browser has no WebCrypto at all
   * — all three used to send in the clear with nothing on screen saying so.
   *
   * §12.14: there is no key to paste anywhere any more (the backup dialog is
   * gone), so the keyless wording states what actually happens — the device
   * unlocks itself once another member's open chat shares the trip key.
   */
  const sendNotice =
    cryptoApi.status !== 'ready' ? (
      <div className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
        <div className="flex items-center justify-center gap-1.5">
          <span>
            {cryptoApi.status === 'keyless'
              ? "This device can't open the chat yet. Messages you send now aren't protected."
              : "Messages you send here aren't protected yet."}
          </span>
          <button
            type="button"
            onClick={cryptoApi.retry}
            className="font-bold underline underline-offset-2 hover:text-foreground"
          >
            Try again
          </button>
        </div>
        {cryptoApi.status === 'keyless' && (
          <button
            type="button"
            onClick={() => setResetChatOpen(true)}
            className="font-semibold text-muted-foreground/80 underline underline-offset-2 hover:text-foreground"
          >
            Still stuck? Start a new chat
          </button>
        )}
      </div>
    ) : null;

  /**
   * F15: the typing menu — the passive half of discoverability. One option
   * today (the assistant); accepting types the literal mention, which is the
   * server's cost gate AND the client's disclosure trigger.
   */
  const mentionMenu =
    mentionOpen && canWrite ? (
      <div
        role="listbox"
        aria-label="Mention TravelAI"
        className="absolute bottom-full left-0 right-0 z-30 mb-1.5 overflow-hidden rounded-2xl border border-violet-300/60 bg-popover p-1 shadow-lg dark:border-violet-500/30"
      >
        <button
          type="button"
          role="option"
          aria-selected="true"
          onPointerDown={(event) => {
            // A pointer on the suggestion is a selection, not a blur: keep the
            // caret in the textarea and insert at the token that opened us.
            if (event.button !== 0) return;
            event.preventDefault();
            insertMention("menu");
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-violet-500/10"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-foreground">TravelAI</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Answers from the recent messages here
            </span>
          </span>
          <kbd className="hidden shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:block">
            Enter
          </kbd>
        </button>
      </div>
    ) : null;

  /**
   * F15: the active half — a visible way in that costs no typing-space. It is
   * only on screen while the composer is empty, so it never competes with the
   * message someone is writing. The one-time tip states where answers come
   * from in plain words; dismissing it is remembered per browser.
   */
  const aiDiscovery =
    canWrite && !draft.trim() ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => insertMention("chip")}
          disabled={state.submitting}
          title="Ask TravelAI about this trip"
          className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/60 bg-violet-500/5 px-2.5 py-1 text-[11px] font-bold text-violet-700 transition-colors hover:bg-violet-500/10 disabled:opacity-50 dark:border-violet-500/30 dark:text-violet-300"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask TravelAI
        </button>
        {!aiHintDismissed && (
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">Each ask includes the last few messages here.</span>
            <button
              type="button"
              onClick={dismissAiHint}
              aria-label="Dismiss TravelAI tip"
              className="rounded-full p-0.5 hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
    ) : null;

  const composerBlock = canWrite ? (
    isChat ? (
      /* WhatsApp-style dock: one bar holding [day▾] [input…] (►).
         Enter sends, Shift+Enter is a newline; the input auto-grows. */
      <div className="flex items-end gap-1.5 rounded-3xl border border-border/70 bg-card p-1.5 pl-2 shadow-xs focus-within:border-primary/40 transition-colors">
        <select
          value={anchorDay ?? ""}
          onChange={(event) =>
            setAnchorDay(event.target.value ? Number(event.target.value) : null)
          }
          title="Anchor this message to a trip day"
          className="h-9 shrink-0 cursor-pointer self-center rounded-full border border-border/60 bg-muted/40 px-2.5 text-[11px] font-bold text-muted-foreground outline-none"
        >
          <option value="">Trip</option>
          {anchoredDays.slice(0, 12).map((day) => (
            <option key={day} value={day}>
              Day {day}
            </option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          {mentionMenu}
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              autosizeComposer();
              syncMentionMenu(value, event.target.selectionStart);
              onTyping?.();
            }}
            onKeyDown={(event) => {
              if (mentionOpen) {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  insertMention("menu");
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  // Keep Escape from also closing the chat drawer.
                  event.stopPropagation();
                  setMentionOpen(false);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            onSelect={(event) =>
              syncMentionMenu(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onBlur={() => setMentionOpen(false)}
            placeholder={
              anchorDay ? `Message about Day ${anchorDay}…` : "Message the trip…"
            }
            rows={1}
            maxLength={COMMENT_MAX_LEN}
            disabled={state.submitting}
            className="max-h-28 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setPollComposerOpen(true)}
          disabled={!canCreatePoll}
          title={canCreatePoll ? "Start a poll" : "Polls become available when the chat is ready on this device"}
          aria-label="Start a poll"
          className="h-9 w-9 shrink-0 self-end gap-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <BarChart3 className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={() => void submit()}
          disabled={!draft.trim() || state.submitting}
          title="Send"
          aria-label="Send message"
          className="h-9 w-9 shrink-0 self-end rounded-full gap-0"
        >
          {state.submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    ) : (
      <div className="space-y-2">
        <div className="relative">
          {mentionMenu}
          <Textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              syncMentionMenu(value, event.target.selectionStart);
              onTyping?.(); // throttled upstream; a 2.5s-silent composer stops pinging
            }}
            onKeyDown={(event) => {
              if (mentionOpen) {
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  insertMention("menu");
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setMentionOpen(false);
                  return;
                }
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            onSelect={(event) =>
              syncMentionMenu(event.currentTarget.value, event.currentTarget.selectionStart)
            }
            onBlur={() => setMentionOpen(false)}
            placeholder={
              anchorDay
                ? `Message about Day ${anchorDay}…`
                : "Message the trip…"
            }
            rows={2}
            maxLength={COMMENT_MAX_LEN}
            disabled={state.submitting}
            className="rounded-2xl text-sm resize-none"
          />
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setAnchorDay(null)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                anchorDay === null
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              )}
            >
              Whole trip
            </button>
            {anchoredDays.slice(0, 12).map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setAnchorDay(anchorDay === day ? null : day)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                  anchorDay === day
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPollComposerOpen(true)}
              disabled={!canCreatePoll}
              title={canCreatePoll ? "Start a poll" : "Polls become available when the chat is ready on this device"}
              className="rounded-xl text-xs font-bold gap-1.5 h-9 px-3"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Poll</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="hero"
              onClick={() => void submit()}
              disabled={!draft.trim() || state.submitting}
              className="rounded-xl text-xs font-bold gap-1.5 h-9 px-3"
            >
              {state.submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send</span>
            </Button>
          </div>
        </div>
      </div>
    )
  ) : (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
      You're viewing this trip, so the chat is read-only — ask the owner to
      make you a commenter.
    </div>
  );

  const streamBody =
    state.status === "idle" || state.status === "loading" ? (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    ) : state.status === "error" ? (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <p className="text-xs">Could not load the chat.</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={retry}
          className="rounded-xl text-xs font-bold gap-1.5 h-8 px-3"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </Button>
      </div>
    ) : timeline.length === 0 ? (
      <div className="py-8 text-center text-xs text-muted-foreground">
        {dayFilter === null
          ? !canWrite
            ? "No messages yet."
            : isChat
              ? "No messages yet — say hi 👋"
              : "No messages yet — start the conversation above."
          : "Nothing on this day yet."}
      </div>
    ) : (
      <div className="space-y-2">
        {timeline.map((item) => {
          if (item.kind === "poll") {
            const poll = item.poll;
            return (
              <PollCard
                key={`poll-${poll._id}`}
                poll={poll}
                decoded={decodedPolls.get(poll._id)}
                mine={isMine(poll)}
                decoding={cryptoApi.status === "ready"}
                busy={pollBusyId === poll._id}
                canVote={canWrite}
                canManage={isMine(poll) || myRole === "owner"}
                onVote={(index) => void voteOnPoll(poll, index)}
                onClosePoll={() => void closePoll(poll)}
                onRemovePoll={() => void removePoll(poll)}
              />
            );
          }
          const row = item.row;
          // F12b: bot rows may carry a proposal envelope; the card replaces
          // the raw JSON in the bubble text.
          const botCard = Boolean(row.bot) ? parseBotCard(bodyOf(row)) : null;
          return (
            <CommentRow
              key={row._id}
              row={row}
              displayBody={botCard ? botCard.text : bodyOf(row)}
              canModerate={myRole === "owner" || Boolean(row.isYou)}
              isBusy={busyId === row._id}
              decided={decidedCommentIds.has(row._id)}
              actionsOpen={editingId !== row._id && actionsForId === row._id}
              onOpenActions={openActionsFor}
              onDecide={() => void markDecision(row)}
              editing={editingId === row._id}
              editDraft={editDraft}
              onEditDraftChange={(value) => {
                setEditDraft(value);
                onTyping?.(); // editing is composition too
              }}
              onStartEdit={() => startEdit(row)}
              onSaveEdit={() => void saveEdit()}
              onCancelEdit={cancelEdit}
              onAskDelete={() => setPendingDelete(row)}
              botCard={botCard}
              proposalApplied={appliedProposals.has(row._id)}
              proposalDismissed={dismissedProposals.has(row._id)}
              canApplyProposal={Boolean(onApplyProposal)}
              onApplyProposal={() => void applyProposal(row)}
              onDismissProposal={() =>
                setDismissedProposals((prev) => new Set(prev).add(row._id))
              }
            />
          );
        })}
      </div>
    );

  return (
    <div
      className={
        isChat ? "flex h-full min-h-0 flex-col gap-3" : "space-y-4 max-w-3xl mx-auto"
      }
    >
      {isChat ? (
        <>
          {/* F13a: open polls are the newest actionable thing in the room —
              one row above the decisions band, collapsed by default. */}
          <PollsBand
            polls={openPolls}
            decoded={decodedPolls}
            decoding={cryptoApi.status === "ready"}
            busyId={pollBusyId}
            canVote={canWrite}
            canCreate={canCreatePoll}
            isOwner={myRole === "owner"}
            myUserId={currentUserId}
            onNewPoll={() => setPollComposerOpen(true)}
            onVote={(poll, index) => void voteOnPoll(poll, index)}
            onClosePoll={(poll) => void closePoll(poll)}
            onRemovePoll={(poll) => void removePoll(poll)}
          />

          {/* F10h: pinned decisions sit ABOVE the scroll area, not inside it.
              The chat opens at the bottom, so a strip at the top of the
              transcript was invisible until you scrolled all the way back. */}
          <DecisionsStrip
            variant="band"
            decisions={decisions.map((row) =>
              cryptoApi.isEncrypted(row) ? { ...row, body: bodyOf(row) } : row
            )}
            myRole={myRole}
            busyId={busyDecisionId}
            onUnmark={(row) => void unmarkDecision(row)}
          />

          {/* Chat scroll area — older pages, then the tail. Auto-scroll holds
              the bottom; the mounted transcript starts with the encryption
              line, which belongs to the conversation, not to the pins. */}
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 min-h-0 space-y-2 overflow-y-auto px-0.5"
          >
            {cryptoApi.status === 'ready' ? (
              /* WhatsApp-style: one quiet line at the top of the chat, no
                 technical detail, no icons, nothing to act on. */
              <div className="py-1 text-center text-[11px] text-muted-foreground">
                Messages are end-to-end encrypted.
              </div>
            ) : null}
            {loadEarlierButton}
            {streamBody}
          </div>

          {/* Pinned composer — the chat's floor; typing line just above it */}
          <div className="shrink-0 space-y-1.5 border-t border-border/60 pt-3">
            {typingLine}
            {botThinkingLine}
            {botDisclosure}
            {sendNotice}
            {aiDiscovery}
            {composerBlock}
          </div>
        </>
      ) : (
        <Card className="rounded-3xl border-border/70 bg-card shadow-xs overflow-hidden">
          <CardContent className="p-5 sm:p-6 space-y-4">
            {/* Header + count */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                <h3 className="font-extrabold text-foreground text-sm uppercase tracking-wider">
                  Trip chat
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {dayFilter === null ? comments.length : visible.length}
                </Badge>
              </div>
            </div>

            {cryptoApi.status === "ready" && (
              /* WhatsApp-style: the single, plain statement about the chat. */
              <p className="text-[11px] text-muted-foreground">
                Messages are end-to-end encrypted.
              </p>
            )}

            {/* Polls (F13a) — the same cards, inline in the feed */}
            {polls.length > 0 && (
              <div className="space-y-2">
                {polls.map((poll) => (
                  <PollCard
                    key={poll._id}
                    poll={poll}
                    decoded={decodedPolls.get(poll._id)}
                    mine={isMine(poll)}
                    decoding={cryptoApi.status === "ready"}
                    busy={pollBusyId === poll._id}
                    canVote={canWrite}
                    canManage={isMine(poll) || myRole === "owner"}
                    onVote={(index) => void voteOnPoll(poll, index)}
                    onClosePoll={() => void closePoll(poll)}
                    onRemovePoll={() => void removePoll(poll)}
                  />
                ))}
              </div>
            )}

            {/* Pinned decisions (F9) — the "what we agreed" strip, newest first */}
            <DecisionsStrip
              decisions={decisions.map((row) =>
                cryptoApi.isEncrypted(row) ? { ...row, body: bodyOf(row) } : row
              )}
              myRole={myRole}
              busyId={busyDecisionId}
              onUnmark={(row) => void unmarkDecision(row)}
            />

            {dayChips.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDayFilter(null)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                    dayFilter === null
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {dayChips.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDayFilter(dayFilter === day ? null : day)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                      dayFilter === day
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Day {day} · {dayCounts[String(day)]}
                  </button>
                ))}
              </div>
            )}

            {typingLine}

            {botThinkingLine}

            {botDisclosure}

            {sendNotice}

            {aiDiscovery}

            {composerBlock}

            {streamBody}

            {loadEarlierButton}
          </CardContent>
        </Card>
      )}

      {/* Moderation / self-removal confirm (§19.7) */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this message?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.isYou
                ? "Your message disappears for everyone, but a removal record is kept."
                : "It disappears for everyone — but the removal keeps its author and time for the audit trail."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* F10 recovery: a locked device can move the chat forward, honestly */}
      <AlertDialog open={resetChatOpen} onOpenChange={setResetChatOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new chat on this device?</AlertDialogTitle>
            <AlertDialogDescription>
              Older messages will stay locked and can't be read here. New messages and polls will be private
              again. Only do this if this device never unlocks — if another member's chat is open, their app
              will usually unlock this one for you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingChat}>Keep trying</AlertDialogCancel>
            <AlertDialogAction disabled={resettingChat} onClick={() => void startNewChat()}>
              {resettingChat ? "Starting…" : "Start new chat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start-a-poll dialog (F13a) — sealed by the caller before it is sent */}
      <PollComposer
        open={pollComposerOpen}
        onOpenChange={setPollComposerOpen}
        busy={pollCreating}
        onSubmit={(question, options) => void createPoll(question, options)}
      />
    </div>
  );
};

interface DecisionCardProps {
  row: TripDecision;
  canUnmark: boolean;
  isBusy: boolean;
  onUnmark: () => void;
}

/**
 * One pinned decision card (F9). The body is the promotion-time snapshot —
 * it stays even if the source comment is edited or removed later, which is
 * exactly the point of the record.
 */
const DecisionCard: React.FC<DecisionCardProps> = ({ row, canUnmark, isBusy, onUnmark }) => (
  <div className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
    <Pin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-foreground whitespace-pre-wrap break-words">
        {row.body}
      </p>
      <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[10px] text-muted-foreground">
        <span className="font-bold">{row.label}</span>
        <span aria-hidden>·</span>
        <span>{relativeTime(row.createdAt)}</span>
        {row.day !== undefined && (
          <Badge
            variant="outline"
            className="text-[9px] px-1 py-0 h-3.5 border-border/60 text-muted-foreground"
          >
            Day {row.day}
          </Badge>
        )}
        {!row.isYou && (
          <span className="text-muted-foreground/60 italic">
            pinned by {row.markedByLabel}
          </span>
        )}
      </div>
    </div>
    {canUnmark && (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onUnmark}
        disabled={isBusy}
        title={row.isYou ? "Unmark your decision" : "Moderate — unmark this decision"}
        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1 shrink-0"
      >
        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
        <span className="hidden sm:inline">Unmark</span>
      </Button>
    )}
  </div>
);

interface DecisionsStripProps {
  decisions: TripDecision[];
  myRole: TripRole;
  busyId: string | null;
  onUnmark: (row: TripDecision) => void;
  /**
   * "inline" (feed) renders the strip in place; "band" is the chat's pinned
   * bar ABOVE the scroll area — collapsed to the newest decision plus a count,
   * expandable. The chat opens at the bottom, so a strip at the top of the
   * transcript meant scrolling the whole conversation back just to see what
   * was pinned.
   */
  variant?: "inline" | "band";
}

const DecisionsStrip: React.FC<DecisionsStripProps> = ({
  decisions,
  myRole,
  busyId,
  onUnmark,
  variant = "inline",
}) => {
  const [expanded, setExpanded] = useState(false);
  if (decisions.length === 0) return null;

  if (variant === "band") {
    const latest = decisions[0];
    return (
      <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide pinned decisions" : "Show pinned decisions"}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        >
          <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground shrink-0">
            Decisions
          </span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {decisions.length}
          </Badge>
          {!expanded && (
            <span className="min-w-0 flex-1 truncate text-xs text-foreground/80">
              {latest.body}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 shrink-0 ml-auto text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        {expanded && (
          <div className="max-h-[38vh] space-y-1.5 overflow-y-auto px-2 pb-2">
            {decisions.map((row) => (
              <DecisionCard
                key={row._id}
                row={row}
                canUnmark={row.isYou || myRole === "owner"}
                isBusy={busyId === row._id}
                onUnmark={() => onUnmark(row)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Pin className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          Decisions
        </span>
        <Badge variant="outline" className="text-[10px]">
          {decisions.length}
        </Badge>
      </div>
      {decisions.map((row) => (
        <DecisionCard
          key={row._id}
          row={row}
          canUnmark={row.isYou || myRole === "owner"}
          isBusy={busyId === row._id}
          onUnmark={() => onUnmark(row)}
        />
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */

interface CommentRowProps {
  row: TripComment;
  /** The render text — plaintext for legacy rows, decrypted for e2ee rows. */
  displayBody: string;
  canModerate: boolean;
  isBusy: boolean;
  /** True when this comment already carries an active decision (F9). */
  decided: boolean;
  /** Context actions (edit/pin/delete) are open for THIS row (right-click / long-press). */
  actionsOpen: boolean;
  onOpenActions: (id: string) => void;
  onDecide: () => void;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
  /** F12b: a validated proposal envelope parsed from this row (bot rows only). */
  botCard?: { text: string; proposal: AssistantProposal } | null;
  /** F12b: local, per-visit card state. */
  proposalApplied?: boolean;
  proposalDismissed?: boolean;
  /** Applying needs edit access on the trip (the parent composes the save). */
  canApplyProposal?: boolean;
  onApplyProposal?: () => void;
  onDismissProposal?: () => void;
}

/** One bubble — right-aligned when the caller wrote it; tombstones shrink. */
const CommentRow: React.FC<CommentRowProps> = ({
  row,
  displayBody,
  canModerate,
  isBusy,
  decided,
  actionsOpen,
  onOpenActions,
  onDecide,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onAskDelete,
  botCard = null,
  proposalApplied = false,
  proposalDismissed = false,
  canApplyProposal = false,
  onApplyProposal,
  onDismissProposal,
}) => {
  // Long-press (mobile hold): a 500ms hold opens the action row; any movement
  // (a scroll, a swipe) cancels it so plain scrolling never pops a menu.
  const pressTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    },
    []
  );
  const startPress = () => {
    if (editing) return; // selecting text inside the edit box is not a menu request
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      onOpenActions(row._id);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  if (row.deletedAt) {
    return (
      <div className="flex items-center justify-center py-1.5">
        <span className="text-[11px] text-muted-foreground/70 italic">
          {row.isYou ? "Your message was removed" : "A message was removed"}
        </span>
      </div>
    );
  }

  // F12a: a bot row ALWAYS renders as the TravelAI participant — even for the
  // asker who technically posted it. The persona is the product, not the
  // authorship; that's why it sits on the incoming side with the AI avatar.
  const isBot = Boolean(row.bot);
  const isMine = row.isYou && !isBot;

  return (
    <div
      className={cn("group flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}
      onContextMenu={(event) => {
        // Right-click opens the Telegram-style action row instead of the
        // browser menu — the desktop twin of the mobile long-press. While
        // editing, the native cut/copy/paste menu stays.
        if (editing) return;
        event.preventDefault();
        onOpenActions(row._id);
      }}
      onTouchStart={startPress}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
    >
      {/* WhatsApp convention: avatar only on incoming; your own bubbles sit
          against the right edge, self-evident by color and side. */}
      {!isMine && (
        <Avatar className="h-7 w-7 shrink-0 self-end">
          {isBot ? (
            <AvatarFallback className="bg-violet-500/15 text-violet-600 dark:text-violet-300">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          ) : (
            <>
              {avatarSrc(row.avatarUrl) && (
                <AvatarImage src={avatarSrc(row.avatarUrl)} alt={row.label} />
              )}
              <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                {initialsFor(row.label)}
              </AvatarFallback>
            </>
          )}
        </Avatar>
      )}

      <div
        className={cn(
          "min-w-0 max-w-[85%] sm:max-w-[75%] rounded-2xl px-3 py-2 transition-shadow",
          isMine
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : isBot
              ? "bg-violet-500/10 text-foreground rounded-bl-sm"
              : "bg-muted text-foreground rounded-bl-sm",
          actionsOpen && "ring-2 ring-primary/40"
        )}
      >
        {/* Group-chat sender name — only on incoming (your own need no label) */}
        {!isMine && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={cn(
                "text-[11px] font-bold",
                isBot && "text-violet-600 dark:text-violet-300"
              )}
            >
              {isBot ? "TravelAI" : row.label}
            </span>
            {isBot && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 gap-0.5 border-violet-400/50 text-violet-600 dark:text-violet-300"
              >
                <Sparkles className="h-2 w-2" /> AI
              </Badge>
            )}
            {row.day !== undefined && (
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 border-border/60 text-muted-foreground"
              >
                Day {row.day}
              </Badge>
            )}
          </div>
        )}

        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <Textarea
              value={editDraft}
              onChange={(event) => onEditDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onSaveEdit();
                }
                if (event.key === "Escape") onCancelEdit();
              }}
              rows={2}
              maxLength={COMMENT_MAX_LEN}
              autoFocus
              disabled={isBusy}
              className="rounded-xl text-sm resize-none bg-card text-foreground"
            />
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onCancelEdit}
                disabled={isBusy}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                <X className="w-3 h-3" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="hero"
                onClick={onSaveEdit}
                disabled={isBusy || !editDraft.trim()}
                className="h-7 px-2.5 text-xs font-bold"
              >
                {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "text-sm whitespace-pre-wrap break-words",
              !isMine && "mt-0.5"
            )}
          >
            {displayBody}
          </p>
        )}

        {/* F12b proposal card: rides inside the bot bubble, dismissed/applied
            is per-visit local state (the row itself is immutable ciphertext). */}
        {botCard && !proposalDismissed && (
          <div className="mt-1.5 rounded-xl border border-violet-300/60 bg-background/85 p-2.5 dark:border-violet-500/30">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
              <Bot className="h-3 w-3" />
              <span>Proposed change</span>
            </div>
            <p className="mt-1 text-sm font-bold">{proposalLabel(botCard.proposal)}</p>
            <p className="text-sm break-words text-foreground/90">
              <span className="text-muted-foreground">→ </span>
              {formatProposalValue(botCard.proposal)}
            </p>
            {proposalApplied ? (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                <Sparkles className="h-2.5 w-2.5" /> Applied to the itinerary
              </span>
            ) : canApplyProposal ? (
              <div className="mt-2 flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={onApplyProposal}
                  disabled={isBusy}
                  className="h-7 rounded-full gap-1.5"
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Apply change
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDismissProposal}
                  disabled={isBusy}
                  className="h-7 rounded-full text-muted-foreground"
                >
                  Not now
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                Members with edit access can apply this from the card.
              </p>
            )}
          </div>
        )}

        {/* Time lives INSIDE the bubble, tail-right — the chat-app signature. */}
        <div
          className={cn(
            "flex items-center gap-1 justify-end text-[9px] leading-none opacity-70",
            !isMine && !editing && "mt-1"
          )}
        >
          {row.editedAt && <span className="italic">(edited)</span>}
          <span>{relativeTime(row.createdAt)}</span>
        </div>
      </div>

      {/* Row actions are invisible until summoned: right-click or long-press
          the bubble (onOpenActions). Keyboard users reveal them by simply
          tabbing onto the hidden buttons (focus-within). */}
      {canModerate && !editing && (
        <div
          className={cn(
            "flex flex-col items-center gap-0.5 self-center transition-opacity duration-150",
            isMine && "flex-row",
            actionsOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0 sm:focus-within:pointer-events-auto sm:focus-within:opacity-100"
          )}
        >
          {isMine && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onStartEdit}
              disabled={isBusy}
              title="Edit your message"
              className="h-6 px-1.5 text-muted-foreground hover:text-foreground gap-0"
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Pencil className="w-3 h-3" />
              )}
            </Button>
          )}
          {/* F9: promote author-or-owner; server enforces the real rule */}
          {canModerate &&
            (decided ? (
              <span
                className="flex h-6 items-center px-1 text-primary"
                title="This message is pinned as a decision"
              >
                <Pin className="w-3 h-3" />
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onDecide}
                disabled={isBusy}
                title={
                  isMine
                    ? "Record your message as a decision"
                    : "Owner — record this as a decision"
                }
                className="h-6 px-1.5 text-muted-foreground hover:text-primary gap-0"
              >
                <Pin className="w-3 h-3" />
              </Button>
            ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onAskDelete}
            disabled={isBusy}
            title={isMine ? "Delete your message" : "Moderate — remove this message"}
            className="h-6 px-1.5 text-muted-foreground hover:text-destructive gap-0"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};
