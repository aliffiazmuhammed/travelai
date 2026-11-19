import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive } from "@/components/ui/confirm-destructive";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { useAuth } from "@/context/UserContext";
import { keyBackup } from "@/lib/chatKeyBackup";
import { backUpReadableHistory, type BackfillProgress } from "@/lib/chatKeyBackfill";
import type { BackupDraft, BackupStatus } from "@/lib/keyBackupSession";
import { cn } from "@/lib/utils";

/**
 * "Chat backup & recovery" on the personal account shelf.
 *
 * Password-assisted backup keeps a copy of the per-trip conversation keys
 * wrapped under a password-derived key and a one-time recovery code. The server
 * stores only opaque wrappers; this card is where the browser enrolls, unlocks,
 * replaces the recovery code and migrates history it can still read.
 *
 * Copy is deliberately candid about the design: this is not zero-knowledge
 * recovery (the sign-in server receives your password), and history that no
 * remaining device can open is not recoverable.
 */

const DESCRIPTIONS: Record<BackupStatus, string> = {
  idle: "Sign in to check chat backup.",
  loading: "Checking your chat backup…",
  disabled:
    "Chat backups are not enabled. Keep a device that can still read your history until you set one up.",
  locked:
    "Your account is signed in. Unlock chat backup separately to restore saved history.",
  unlocking: "Unlocking chat backup. This can take a moment…",
  ready:
    "Backup is unlocked on this browser. Readable keys are saved as you open trips; use the history migration below for trips you have not opened here.",
  recoveryNeeded:
    "Your password was reset. Use your saved recovery code to restore access; existing device chats still work.",
  error:
    "Chat backup could not be checked. Your account and any readable device chats still work.",
};

const emptyProgress: BackfillProgress = {
  trips: 0,
  saved: 0,
  alreadySaved: 0,
  unavailable: 0,
  failedTrips: 0,
  finished: false,
};

export function ChatRecoverySettings() {
  const snapshot = useSyncExternalStore(keyBackup.subscribe, keyBackup.getSnapshot, keyBackup.getSnapshot);
  const { user } = useAuth();
  const [draft, setDraft] = useState<BackupDraft | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<BackfillProgress>(emptyProgress);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const pendingDraft = useRef<BackupDraft | null>(null);
  const run = useRef(0);

  useEffect(() => () => {
    pendingDraft.current?.key.fill(0);
    if (pendingDraft.current) pendingDraft.current.code = "";
    run.current += 1;
  }, []);

  const loading = busy || snapshot.status === "loading" || snapshot.status === "unlocking";
  const enrolled = Boolean(snapshot.metadata?.enrolled);
  const canUnlock = !draft && enrolled && Boolean(snapshot.metadata?.enrolled && snapshot.metadata.password) && snapshot.status !== "ready";
  const canRecover = !draft && enrolled;

  function resetFeedback() {
    setError(null);
    setNote(null);
  }

  async function prepare(useCode: boolean): Promise<boolean> {
    resetFeedback();
    try {
      const next = await keyBackup.prepare(useCode ? code : undefined);
      pendingDraft.current?.key.fill(0);
      pendingDraft.current = next;
      setDraft(next);
      setCode("");
      setPassword("");
      setAcknowledged(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recovery could not be opened. Try again.");
      return false;
    }
  }

  async function replaceRecoveryCode() {
    if (await prepare(false)) setReplaceOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !password || (draft && !acknowledged)) return;
    const enteredPassword = password;
    setPassword("");
    setBusy(true);
    resetFeedback();
    try {
      if (draft) {
        await keyBackup.save(draft, enteredPassword);
        pendingDraft.current?.key.fill(0);
        pendingDraft.current = null;
        setDraft(null);
        setNote(
          "Recovery saved. Your new code is active. Open your trips, or use history migration below, to back up readable history."
        );
        toast.success("Chat backup is active.");
      } else {
        await keyBackup.unlock(enteredPassword);
        if (keyBackup.getSnapshot().status === "ready") {
          setNote("Chat backup is unlocked on this browser.");
          toast.success("Chat backup unlocked.");
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Nothing was confirmed. Check your connection and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.code);
      setNote("Copied. Save it somewhere private before continuing.");
    } catch {
      setError("Copy was unavailable. Select and copy the code instead.");
    }
  }

  async function backfill() {
    if (!snapshot.userId || backfillBusy) return;
    const ticket = ++run.current;
    setBackfillBusy(true);
    setBackfillError(null);
    try {
      await backUpReadableHistory(
        snapshot.userId,
        progress.finished ? emptyProgress : progress,
        () => run.current === ticket,
        (next) => {
          if (run.current === ticket) setProgress(next);
        }
      );
    } catch (cause) {
      if (run.current === ticket) {
        setBackfillError(
          cause instanceof Error ? cause.message : "History backup paused. Try again."
        );
      }
    } finally {
      if (run.current === ticket) setBackfillBusy(false);
    }
  }

  if (!user) return null;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Advanced: chat backup &amp; recovery
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Keep trip conversation history readable after a password reset or on a new
            browser. Only keys this account can already read are ever backed up.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <p
          className="text-sm leading-relaxed text-muted-foreground"
          aria-live="polite"
        >
          {DESCRIPTIONS[snapshot.status]}
        </p>

        {snapshot.error ? (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {snapshot.error}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-semibold text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {note ? (
          <p className="text-xs font-semibold text-primary" aria-live="polite">
            {note}
          </p>
        ) : null}

        {draft ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/60 p-4">
              <p className="text-overline font-semibold text-muted-foreground">
                Your recovery code
              </p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">
                {draft.code}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3 rounded-lg"
                onClick={() => void copyCode()}
                disabled={busy}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy code
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Shown only now. Anyone with this code and your backup can open saved
              trip keys; we never send the code to the server. A replacement code
              opens the current backup, while an old code with a copied old backup
              can still work.
            </p>
            <label className="flex items-start gap-2 text-xs font-medium text-foreground">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>I saved this recovery code somewhere safe.</span>
            </label>
            <div className="space-y-2">
              <Label htmlFor="backup-password" className="text-xs font-semibold">
                Current account password
              </Label>
              <PasswordInput
                id="backup-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={busy}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Enter it again to activate backup. The code is not active until the
                save succeeds.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={loading || !password || !acknowledged}
                className="h-11 rounded-xl px-5 text-sm font-semibold"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                I saved it — activate backup
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-xl"
                disabled={busy}
                onClick={() => {
                  pendingDraft.current?.key.fill(0);
                  pendingDraft.current = null;
                  setDraft(null);
                  resetFeedback();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            {!enrolled && snapshot.status === "disabled" ? (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-foreground">
                  Back up readable trip keys so a new browser can open saved history
                  after password sign-in. Web history can be migrated here once a
                  device has backed it up.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This is not zero-knowledge recovery: our sign-in server receives
                  your password. A compromised server could unlock backups, and a
                  stolen backup allows offline password guessing. Choose a strong,
                  unique password.
                </p>
                <Button
                  className="h-11 rounded-xl px-5 text-sm font-semibold"
                  onClick={() => void prepare(false)}
                  disabled={loading}
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Set up chat backup
                </Button>
              </div>
            ) : null}

            {canUnlock ? (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="unlock-password" className="text-xs font-semibold">
                    Account password
                  </Label>
                  <Input
                    id="unlock-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className="h-11 rounded-xl"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-11 rounded-xl px-5 text-sm font-semibold"
                  disabled={loading || !password}
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Unlock chat backup
                </Button>
              </form>
            ) : null}

            {canRecover && snapshot.status !== "ready" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="recovery-code" className="text-xs font-semibold">
                    Saved recovery code
                  </Label>
                  <Input
                    id="recovery-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="WTK1-…"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loading}
                    className="h-11 rounded-xl font-mono text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 rounded-xl px-5 text-sm font-semibold"
                  disabled={loading || !code.trim()}
                  onClick={() => void prepare(true)}
                >
                  Use recovery code
                </Button>
              </div>
            ) : null}

            {snapshot.status === "ready" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 rounded-xl px-5 text-sm font-semibold"
                    disabled={loading}
                    onClick={() => setReplaceOpen(true)}
                  >
                    Replace recovery code
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-xl"
                    disabled={loading}
                    onClick={() => void keyBackup.refresh()}
                  >
                    Check again
                  </Button>
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
                  <p className="text-xs font-semibold text-foreground">
                    Migrate readable history
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Walks your accessible trips and saves every epoch key this
                    browser can still open. Unreadable epochs are skipped, never
                    guessed, and the run can be paused and resumed.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      disabled={backfillBusy}
                      onClick={() => void backfill()}
                    >
                      {backfillBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {progress.afterTripId && !progress.finished
                        ? "Continue history backup"
                        : "Back up readable history"}
                    </Button>
                    {backfillBusy ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => {
                          run.current += 1;
                          setBackfillBusy(false);
                        }}
                      >
                        Pause
                      </Button>
                    ) : null}
                  </div>
                  {progress.trips > 0 || progress.finished ? (
                    <p
                      className="mt-3 text-xs leading-relaxed text-muted-foreground"
                      aria-live="polite"
                    >
                      {progress.trips} trips visited · {progress.saved} keys saved ·{" "}
                      {progress.alreadySaved} already saved · {progress.unavailable}{" "}
                      unreadable epochs · {progress.failedTrips} trips no longer
                      accessible.
                      {progress.finished
                        ? " Reached the end of the accessible trip list. Unreadable history is not backed up."
                        : " Unvisited history is not yet checked."}
                    </p>
                  ) : null}
                  {backfillError ? (
                    <p className="mt-2 text-xs font-semibold text-destructive" role="alert">
                      {backfillError}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {snapshot.status === "locked" || snapshot.status === "error" ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 rounded-xl"
                disabled={loading}
                onClick={() => void keyBackup.refresh()}
              >
                Retry backup check
              </Button>
            ) : null}

            {snapshot.status === "recoveryNeeded" ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden="true" />
                Without a matching saved code or this browser&rsquo;s saved backup key,
                unavailable history cannot be recovered. Existing device chats may
                still work. Nothing is erased or replaced automatically.
              </p>
            ) : null}

            {snapshot.status === "ready" ? (
              <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                Keep old devices available until their history has been migrated.
                This browser stores the unlocked key in local storage for this
                account; signing out clears it.
              </p>
            ) : null}
          </>
        )}

        <p className={cn("text-xs leading-relaxed text-muted-foreground")}>
          Changing your password here re-wraps the chat-backup key under the new
          password automatically. Agency identities are separate and never use
          personal chat backup.
        </p>
      </div>

      <ConfirmDestructive
        open={replaceOpen}
        onOpenChange={(next) => {
          setReplaceOpen(next);
          if (!next) resetFeedback();
        }}
        title="Replace your recovery code?"
        description="This creates a new recovery code and two new wrapped copies of the account key. The old code stops working for future recovery; a copied old backup can still be opened with it, so keep or destroy that copy deliberately."
        confirmLabel="Replace recovery code"
        tone="warning"
        onConfirm={replaceRecoveryCode}
        error={replaceOpen ? error : null}
      />
    </section>
  );
}
