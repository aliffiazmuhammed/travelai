import React, { useEffect, useState } from "react";
import { BarChart3, Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/date";
import type { TripPoll } from "@/types/trip";
import type { DecodedPoll } from "@/hooks/useDecodedPolls";

/**
 * Polls (Milestone 7, F13a) — the group's "let's settle this" card.
 *
 * Copy rule (same as the rest of the chat, §12.9): no encryption vocabulary.
 * The card speaks in plain product words — question, options, votes, closed.
 *
 * A poll is unreadable to the server, so everything the card shows (question,
 * option labels, counts, which option is yours) comes from `DecodedPoll`, which
 * the parent computes with the trip key. `UndecodedPoll` is the honest bridge
 * while that happens, or when this device cannot read the poll at all.
 */

export interface PollCardProps {
  poll: TripPoll;
  decoded?: DecodedPoll;
  /** The chat key is ready and decoding is in flight (vs. impossible here). */
  decoding?: boolean;
  /**
   * The caller started this poll. Computed from `createdBy` by the parent, NOT
   * read off `poll.isYou`: a broadcast frame carries the *author's* view, and
   * trusting it would show every recipient "You" plus Close/remove controls.
   */
  mine: boolean;
  /** A vote/close/remove for THIS poll is in flight. */
  busy: boolean;
  /** False for viewers (posting access is the voting floor) or closed polls. */
  canVote: boolean;
  /** Creator or trip owner: close and remove controls. */
  canManage: boolean;
  onVote: (index: number) => void;
  onClosePoll: () => void;
  onRemovePoll: () => void;
}

/** One option row: a fill bar sized by share, the label, the count. */
const PollOption: React.FC<{
  label: string;
  count: number;
  total: number;
  mine: boolean;
  disabled: boolean;
  onSelect: () => void;
}> = ({ label, count, total, mine, disabled, onSelect }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={mine}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors",
        mine
          ? "border-primary/60 bg-primary/10 font-semibold"
          : "border-border/60 hover:border-primary/40 hover:bg-primary/5",
        disabled && "cursor-default hover:border-border/60 hover:bg-transparent"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 transition-all",
          mine ? "bg-primary/20" : "bg-primary/10"
        )}
        style={{ width: `${pct}%` }}
      />
      <span className="relative flex items-center gap-1.5">
        {mine && <Check className="w-3 h-3 shrink-0 text-primary" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground">
          {count}
        </span>
      </span>
    </button>
  );
};

export const PollCard: React.FC<PollCardProps> = ({
  poll,
  decoded,
  decoding = true,
  mine,
  busy,
  canVote,
  canManage,
  onVote,
  onClosePoll,
  onRemovePoll,
}) => {
  const closed = Boolean(poll.closedAt);
  const total = decoded?.total ?? poll.votes.length;
  const options = decoded?.options ?? [];
  const question = decoded?.question?.trim();
  const unreadable = !decoded
    ? decoding
      ? "Opening poll…"
      : "This poll can't be opened on this device yet."
    : "This poll can't be opened here.";

  return (
    <div className="rounded-xl border border-primary/25 bg-card px-3 py-2.5">
      <div className="flex items-start gap-2">
        <BarChart3 className="mt-0.5 w-3.5 h-3.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold break-words text-foreground">
            {question || unreadable}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-bold">{mine ? "You" : poll.createdByLabel}</span>
            <span aria-hidden>·</span>
            <span>{formatRelative(poll.createdAt)}</span>
            {closed && (
              <Badge variant="outline" className="h-3.5 px-1 py-0 text-[9px] font-semibold">
                Closed
              </Badge>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-0.5">
            {!closed && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onClosePoll}
                disabled={busy}
                title="Close voting"
                className="h-6 gap-1 px-1.5 text-[10px]"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                <span className="hidden sm:inline">Close</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRemovePoll}
              disabled={busy}
              title="Remove poll"
              aria-label="Remove poll"
              className="h-6 px-1 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 space-y-1">
        {options.map((label, index) => (
          <PollOption
            key={`${poll._id}-${index}`}
            label={label}
            count={decoded?.counts[index] ?? 0}
            total={total}
            mine={decoded?.myChoice === index}
            disabled={closed || !canVote || busy}
            onSelect={() => onVote(index)}
          />
        ))}
        {!decoded &&
          (decoding ? (
            <div className="flex items-center gap-1.5 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Opening poll…
            </div>
          ) : (
            <p className="py-1 text-[11px] text-muted-foreground">
              The options and votes can't be read on this device yet.
            </p>
          ))}
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground">
        {total} {total === 1 ? "vote" : "votes"}
        {closed
          ? " · voting closed"
          : canVote
            ? decoded?.myChoice != null
              ? " · tap another option to change your vote"
              : " · tap an option to vote"
            : " · voting needs chat access"}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  The always-visible band (collapsed by default, like the decisions strip)   */
/* -------------------------------------------------------------------------- */

export interface PollsBandProps {
  /** Open polls only — closed ones stay in the conversation. */
  polls: TripPoll[];
  decoded: Map<string, DecodedPoll>;
  busyId: string | null;
  canVote: boolean;
  onVote: (poll: TripPoll, index: number) => void;
  onClosePoll: (poll: TripPoll) => void;
  onRemovePoll: (poll: TripPoll) => void;
  /** F13a: opens the composer (the band's "New poll" shortcut). */
  onNewPoll?: () => void;
  canCreate?: boolean;
  /** Trip owner: moderates anyone's poll, not just their own. */
  isOwner?: boolean;
  /** The caller's id — `mine` is derived from it, never from a frame. */
  myUserId?: string;
  /** The chat key is ready (decoding in flight) rather than unavailable. */
  decoding?: boolean;
}

/**
 * A single pinned row above the chat, mirroring `DecisionsStrip`'s band: the
 * newest open poll's question and vote count are always in sight, and the
 * chevron opens every open poll as a full card. Polls that need action must
 * never be scrolled away — the same defect F10h fixed for decisions.
 */
export const PollsBand: React.FC<PollsBandProps> = ({
  polls,
  decoded,
  busyId,
  canVote,
  onVote,
  onClosePoll,
  onRemovePoll,
  onNewPoll,
  canCreate,
  isOwner,
  myUserId,
  decoding = true,
}) => {
  const [expanded, setExpanded] = useState(false);
  if (polls.length === 0) return null;

  const latest = polls[0];
  const latestDecoded = decoded.get(latest._id);

  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-primary/25 bg-primary/5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left"
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
            Polls
          </span>
          <Badge
            variant="outline"
            className="h-4 shrink-0 border-primary/30 px-1 py-0 text-[9px] font-bold text-primary"
          >
            {polls.length}
          </Badge>
          {!expanded && (
            <>
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                {latestDecoded?.question?.trim() || "Opening poll…"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {latest.votes.length} voted
              </span>
            </>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
        {canCreate && onNewPoll && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onNewPoll}
            title="Start a poll"
            aria-label="Start a poll"
            className="mr-1 h-6 shrink-0 gap-0.5 px-1.5 text-[10px]"
          >
            <Plus className="w-3 h-3" />
          </Button>
        )}
      </div>
      {expanded && (
        <div className="max-h-[38vh] space-y-2 overflow-y-auto px-2 pb-2">
          {polls.map((poll) => (
            <PollCard
              key={poll._id}
              poll={poll}
              decoded={decoded.get(poll._id)}
              decoding={decoding}
              mine={myUserId ? poll.createdBy === myUserId : poll.isYou}
              busy={busyId === poll._id}
              canVote={canVote}
              canManage={
                (myUserId ? poll.createdBy === myUserId : poll.isYou) || Boolean(isOwner)
              }
              onVote={(index) => onVote(poll, index)}
              onClosePoll={() => onClosePoll(poll)}
              onRemovePoll={() => onRemovePoll(poll)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  Composer                                                                  */
/* -------------------------------------------------------------------------- */

export interface PollComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (question: string, options: string[]) => void;
}

const QUESTION_MAX = 120;
const OPTION_MAX = 60;
const MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;

/** Trims, drops blanks, and removes duplicates (case-insensitive). */
function cleanOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const option of options) {
    const value = option.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }
  return cleaned;
}

/**
 * Start-a-poll dialog. Options are plain inputs; the poll is sealed in the
 * caller (which holds the trip key) before it is sent, and this dialog refuses
 * to open at all when the key is not ready — a poll is never stored in the
 * clear.
 */
export const PollComposer: React.FC<PollComposerProps> = ({
  open,
  onOpenChange,
  busy,
  onSubmit,
}) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  // Every open starts clean — a half-written poll is not worth restoring.
  useEffect(() => {
    if (open) {
      setQuestion("");
      setOptions(["", ""]);
    }
  }, [open]);

  const cleaned = cleanOptions(options);
  const valid =
    question.trim().length > 0 &&
    question.trim().length <= QUESTION_MAX &&
    cleaned.length >= MIN_OPTIONS &&
    cleaned.every((option) => option.length <= OPTION_MAX);

  const setOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((option, at) => (at === index ? value : option)));
  };

  const submit = () => {
    if (!valid || busy) return;
    onSubmit(question.trim(), cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-primary" />
            Start a poll
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ask the group one question. Everyone can pick an option and change their mind
            until the poll is closed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="poll-question" className="text-[11px] font-bold text-foreground">
              Question
            </label>
            <Input
              id="poll-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value.slice(0, QUESTION_MAX))}
              placeholder="Where should we eat on Friday?"
              maxLength={QUESTION_MAX}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-foreground">Options</span>
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Input
                  value={option}
                  onChange={(event) => setOption(index, event.target.value.slice(0, OPTION_MAX))}
                  placeholder={`Option ${index + 1}`}
                  maxLength={OPTION_MAX}
                  aria-label={`Option ${index + 1}`}
                />
                {options.length > MIN_OPTIONS && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setOptions((prev) => prev.filter((_, at) => at !== index))}
                    title="Remove this option"
                    aria-label="Remove this option"
                    className="h-8 shrink-0 px-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="h-7 gap-1 px-1.5 text-[11px]"
              >
                <Plus className="w-3 h-3" />
                Add option
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 className="mr-1.5 w-3.5 h-3.5 animate-spin" /> : null}
            Start poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
