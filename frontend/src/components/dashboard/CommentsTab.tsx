import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { toast } from "sonner";import {
  Loader2,
  MessageCircle,
  Pencil,
  Pin,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripComment, TripDecision, TripRole } from "@/types/trip";
import type { UseTripComments } from "@/hooks/useTripComments";

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
}

const COMMENT_MAX_LEN = 2000; // mirrors COMMENT_MAX_LEN (server default)

const initialsFor = (label: string): string =>
  (label || "T").trim().slice(0, 2).toUpperCase();

/** Compact relative time — "3m", "2h", "5d", else a short date. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export const CommentsTab: React.FC<CommentsTabProps> = ({
  tripId,
  myRole,
  days,
  controller,
  typingLabels = [],
  onTyping,
  variant = "feed",
}) => {
  const { state } = controller;
  const { comments, dayCounts } = state;
  const canWrite = myRole !== "viewer";
  const isChat = variant === "chat";

  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [anchorDay, setAnchorDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TripComment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // F9: which decision card is mid-unmark (one at a time, like row removals).
  const [busyDecisionId, setBusyDecisionId] = useState<string | null>(null);
  const { decidedCommentIds } = controller;
  const decisions = state.decisions;

  // Load the first page when the tab is opened (TabsContent mounts lazily).
  useEffect(() => {
    controller.ensureLoaded();
  }, [controller]);

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

  const submit = async () => {
    const body = draft.trim();
    if (!body || state.submitting) return;
    try {
      await controller.addComment(body, anchorDay ?? undefined);
      setDraft("");
      toast.success("Comment added");
    } catch (err: any) {
      toast.error(err?.message || "Could not post your comment. Please try again.");
    }
  };

  const startEdit = (row: TripComment) => {
    setEditingId(row._id);
    setEditDraft(row.body);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const body = editDraft.trim();
    if (!body) return;
    setBusyId(editingId);
    try {
      await controller.editComment(editingId, body);
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setBusyId(target._id);
    try {
      await controller.removeComment(target);
      toast.success(target.isYou ? "Your comment was removed" : "Comment removed");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove the comment.");
    } finally {
      setBusyId(null);
    }
  };

  const retry = () => {
    controller.ensureLoaded();
    // ensureLoaded is idempotent per open; force a fresh attempt by reloading state
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
        <span>Load earlier comments</span>
      </Button>
    </div>
  ) : null;

  const composerBlock = canWrite ? (
    <div
      className={cn(
        "space-y-2",
        isChat &&
          "rounded-2xl border border-border/70 bg-card p-2 shadow-xs focus-within:border-primary/40 transition-colors"
      )}
    >
      <Textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onTyping?.(); // throttled upstream; a 2.5s-silent composer stops pinging
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={
          anchorDay
            ? `Message about Day ${anchorDay}…`
            : isChat
              ? "Message the trip…"
              : "Share a thought about this trip…"
        }
        rows={2}
        maxLength={COMMENT_MAX_LEN}
        disabled={state.submitting}
        className={cn(
          isChat
            ? "min-h-9 resize-none bg-transparent border-0 p-1.5 text-sm focus-visible:ring-0 shadow-none"
            : "rounded-2xl text-sm resize-none"
        )}
      />
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
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            ⌘/Ctrl + Enter
          </span>
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
            <span>Post</span>
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-3 text-xs text-muted-foreground">
      You're viewing this trip, so the discussion is read-only — ask the
      owner to change your role to comment.
    </div>
  );

  const streamBody =
    state.status === "idle" || state.status === "loading" ? (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    ) : state.status === "error" ? (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <p className="text-xs">Could not load the discussion.</p>
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
    ) : chronological.length === 0 ? (
      <div className="py-8 text-center text-xs text-muted-foreground">
        {dayFilter === null
          ? isChat
            ? "No messages yet — say hi 👋"
            : "No comments yet — start the conversation above."
          : "Nothing on this day yet."}
      </div>
    ) : (
      <div className="space-y-2">
        {chronological.map((row) => (
          <CommentRow
            key={row._id}
            row={row}
            canModerate={myRole === "owner" || Boolean(row.isYou)}
            isBusy={busyId === row._id}
            decided={decidedCommentIds.has(row._id)}
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
          />
        ))}
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
          {/* Chat scroll area — decisions pinned at the very top (history),
              then older pages, then the tail. Auto-scroll holds the bottom. */}
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            className="flex-1 min-h-0 space-y-2 overflow-y-auto px-0.5"
          >
            <DecisionsStrip
              decisions={decisions}
              myRole={myRole}
              busyId={busyDecisionId}
              onUnmark={(row) => void unmarkDecision(row)}
            />
            {loadEarlierButton}
            {streamBody}
          </div>

          {/* Pinned composer — the chat's floor; typing line just above it */}
          <div className="shrink-0 space-y-1.5 border-t border-border/60 pt-3">
            {typingLine}
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
                  Trip discussion
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {dayFilter === null ? comments.length : visible.length}
                </Badge>
              </div>
            </div>

            {/* Pinned decisions (F9) — the "what we agreed" strip, newest first */}
            <DecisionsStrip
              decisions={decisions}
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
            <AlertDialogTitle>Remove this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.isYou
                ? "Your comment disappears for everyone, but a removal record is kept."
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
}

/** The pinned strip above the stream; hidden entirely when nothing is pinned. */
const DecisionsStrip: React.FC<DecisionsStripProps> = ({ decisions, myRole, busyId, onUnmark }) => {
  if (decisions.length === 0) return null;
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
  canModerate: boolean;
  isBusy: boolean;
  /** True when this comment already carries an active decision (F9). */
  decided: boolean;
  onDecide: () => void;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onAskDelete: () => void;
}

/** One bubble — right-aligned when the caller wrote it; tombstones shrink. */
const CommentRow: React.FC<CommentRowProps> = ({
  row,
  canModerate,
  isBusy,
  decided,
  onDecide,
  editing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onAskDelete,
}) => {
  if (row.deletedAt) {
    return (
      <div className="flex items-center justify-center py-1.5">
        <span className="text-[11px] text-muted-foreground/70 italic">
          {row.isYou ? "Your comment was removed" : "A comment was removed"}
        </span>
      </div>
    );
  }

  const isMine = row.isYou;

  return (
    <div className={cn("flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}>
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback
          className={cn(
            "text-[10px] font-bold",
            isMine ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          )}
        >
          {initialsFor(row.label)}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "min-w-0 max-w-[85%] sm:max-w-[75%] rounded-2xl border px-3 py-2",
          isMine
            ? "bg-primary/5 border-primary/20 rounded-tr-sm"
            : "bg-background/60 border-border/60 rounded-tl-sm"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 flex-wrap text-[11px]",
            isMine ? "justify-end" : "justify-start"
          )}
        >
          <span className="font-bold text-foreground">
            {isMine ? "You" : row.label}
          </span>
          {row.day !== undefined && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-3.5 border-border/60 text-muted-foreground"
            >
              Day {row.day}
            </Badge>
          )}
          <span className="text-muted-foreground/70">{relativeTime(row.createdAt)}</span>
          {row.editedAt && (
            <span className="text-muted-foreground/60 italic">(edited)</span>
          )}
        </div>

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
              className="rounded-xl text-sm resize-none"
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
          <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">
            {row.body}
          </p>
        )}

        {canModerate && !editing && (
          <div
            className={cn(
              "flex items-center gap-0.5 mt-1.5",
              isMine ? "justify-end" : "justify-start"
            )}
          >
            {isMine && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onStartEdit}
                disabled={isBusy}
                title="Edit your comment"
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              >
                <Pencil className="w-3 h-3" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
            {/* F9: promote author-or-owner; server enforces the real rule */}
            {canModerate &&
              (decided ? (
                <span
                  className="flex items-center gap-1 h-6 px-1.5 text-[10px] font-bold text-primary"
                  title="This comment is pinned as a decision"
                >
                  <Pin className="w-3 h-3" />
                  <span className="hidden sm:inline">Decided</span>
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDecide}
                  disabled={isBusy}
                  title={isMine ? "Record your comment as a decision" : "Owner — record this as a decision"}
                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-primary gap-1"
                >
                  <Pin className="w-3 h-3" />
                  <span className="hidden sm:inline">Decide</span>
                </Button>
              ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onAskDelete}
              disabled={isBusy}
              title={isMine ? "Remove your comment" : "Moderate — remove this comment"}
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive gap-1"
            >
              {isBusy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">{isMine ? "Delete" : "Remove"}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
