import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/context/UserContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  MapPin,
} from "lucide-react";
import { roleLabel } from "@/hooks/useTripAccess";
import { formatDate } from "@/lib/date";
import { initialsFor } from "@/lib/avatar";
import type { InvitePreview } from "@/types/trip";
import Navbar from "@/components/Navbar";

/**
 * `/invite/:token` (§3.5, §3.8) — preview then join.
 *
 * Token hygiene in the browser: the token lives in the URL only while the
 * page is open. We `history.replaceState` it away as soon as the flow ends
 * (and again on unmount), so it never lingers in history and cannot leak
 * through the Referer header (backed by Helmet's `no-referrer`).
 */

const INVITE_TOKEN_KEY = "travelai.inviteToken";

type InviteRole = InvitePreview["role"];

/**
 * What each seat can actually do (mirrors the capability matrix in
 * `docs/roadmap-milestone-6-collaboration.md` §1.3). Only the roles an invite
 * can grant are listed — the owner is never invited to their own trip.
 */
const ROLE_COPY: Record<InviteRole, { intro: string; bullets: string[] }> = {
  viewer: {
    intro:
      "As a viewer you can follow the plan, see what it costs and take a copy with you. Editing stays with the owner.",
    bullets: [
      "Follow the full itinerary",
      "See the shared expenses and who else is coming",
      "Download or print a copy for the road",
    ],
  },
  commenter: {
    intro:
      "As a commenter you can follow the plan, ask questions and join the trip chat. Editing stays with the owner.",
    bullets: [
      "Follow the full itinerary",
      "Ask questions and get answers",
      "Join the trip chat and vote in polls",
    ],
  },
  editor: {
    intro:
      "As an editor you can shape the itinerary and expenses alongside the owner. Inviting people and sharing the trip stay with the owner.",
    bullets: [
      "Edit days, activities and the order of the plan",
      "Update expenses, travellers and the currency",
      "Comment, chat and vote in polls",
    ],
  },
};

const InviteAccept: React.FC = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, isAuthenticated } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinedRole, setJoinedRole] = useState<string | null>(null);

  /** Removes the token from the URL once it has been consumed. */
  const stripTokenFromUrl = () => {
    try {
      window.history.replaceState({}, "", "/dashboard");
    } catch {
      /* replaceState is unavailable in rare embeds — harmless */
    }
  };

  useEffect(() => {
    // Signed-out visitor → remember the invite through the auth round trip
    // (`location.state` is lost on the full page reload that /auth may do).
    if (!token && !authLoading) {
      const remembered = sessionStorage.getItem(INVITE_TOKEN_KEY);
      if (remembered) {
        navigate(`/invite/${remembered}`, { replace: true });
        return;
      }
      window.location.replace("/dashboard");
      return;
    }

    if (token) {
      try {
        sessionStorage.setItem(INVITE_TOKEN_KEY, token);
      } catch {
        /* storage may be full/blocked — state.from still covers most flows */
      }
    }

    // Preview fetch waits for the auth check so a signed-in visitor gets the
    // preview directly, and a signed-out one is routed through /auth cleanly.
    if (authLoading) return;

    if (!isAuthenticated) {
      navigate("/auth", {
        state: { from: { pathname: `/invite/${token}` } },
        replace: true,
      });
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    api
      .getInvitePreview(token)
      .then((result) => {
        if (cancelled) return;
        setPreview({
          trip: result.trip,
          role: result.role,
          kind: result.kind,
          invitedBy: result.invitedBy,
          expiresAt: result.expiresAt,
          emailBoundTo: result.emailBoundTo,
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || "This invite link is invalid or has expired.");
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, authLoading, isAuthenticated, navigate]);

  // Leaving the page after a successful join also clears the token.
  useEffect(
    () => () => {
      if (joinedRole) stripTokenFromUrl();
      try {
        sessionStorage.removeItem(INVITE_TOKEN_KEY);
      } catch {
        /* ignore */
      }
    },
    [joinedRole]
  );

  const handleJoin = async () => {
    try {
      setJoining(true);
      const result = await api.acceptInvite(token);
      setJoinedRole(result.role);
      stripTokenFromUrl();
      toast.success(
        result.alreadyMember
          ? "You are already part of this trip."
          : `Welcome aboard — you joined as ${roleLabel(result.role)}.`
      );
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Could not join this trip.");
      // A dead invite means the token no longer has value; keep the page so
      // the user can read the reason (404/403/410 all carry a message).
    } finally {
      setJoining(false);
    }
  };

  /**
   * Declining is deliberately quiet: the invite has no decline endpoint, so
   * walking away is simply leaving the flow and forgetting the token.
   */
  const handleDecline = () => {
    stripTokenFromUrl();
    navigate("/dashboard", { replace: true });
  };

  const loading = authLoading || loadingPreview;
  const emailMismatch =
    preview?.emailBoundTo && user?.email && preview.emailBoundTo !== user.email;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-hero">
      {/* Soft blue floor: a low glow, then a dotted grid that fades out. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.10),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,hsl(var(--primary)/0.16)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_at_50%_45%,black_15%,transparent_75%)]"
      />

      <Navbar />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-24">
        {loading ? (
          <div className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-3xl border border-border/70 bg-card px-6 py-16 text-center shadow-card">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-muted-foreground">
              Checking your invitation…
            </p>
          </div>
        ) : error ? (
          <div className="w-full max-w-[440px] space-y-4 rounded-3xl border border-border/70 bg-card p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Invitation unavailable
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
            <Button
              type="button"
              variant="hero"
              className="h-11 w-full rounded-xl text-xs font-bold"
              onClick={() => navigate("/dashboard")}
            >
              Go to dashboard
            </Button>
          </div>
        ) : preview ? (
          <div className="w-full max-w-[440px] rounded-3xl border border-border/70 bg-card p-6 shadow-card sm:p-8">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-6 w-6" aria-hidden="true" />
              </div>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                You're invited
              </p>

              <h1 className="mt-2 break-words text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
                Join {preview.trip.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">
                    Valid until {formatDate(preview.expiresAt)}
                  </span>
                </span>
                {preview.trip.destination && (
                  <>
                    <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 break-words">{preview.trip.destination}</span>
                    </span>
                  </>
                )}
              </div>

              {preview.kind === "email" && preview.emailBoundTo && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Reserved for{" "}
                  <span className="break-all font-semibold text-foreground">
                    {preview.emailBoundTo}
                  </span>
                </p>
              )}

              {preview.invitedBy && (
                <div className="mt-4 flex items-center justify-center gap-2.5">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
                      {initialsFor(preview.invitedBy)}
                    </AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{preview.invitedBy}</span>{" "}
                    invited you
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl bg-muted/60 p-4 text-left sm:p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {ROLE_COPY[preview.role].intro}
              </p>
              <ul className="mt-3 space-y-2">
                {ROLE_COPY[preview.role].bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-2 text-xs leading-relaxed text-foreground/85"
                  >
                    <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0">{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            {emailMismatch ? (
              <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3 text-left text-xs font-medium leading-relaxed text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="min-w-0">
                  This invitation was sent to{" "}
                  <strong className="break-all">{preview.emailBoundTo}</strong>, but you are
                  signed in as <strong className="break-all">{user?.email}</strong>. Sign in
                  with the invited email to accept it.
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant="hero"
                disabled={joining}
                onClick={handleJoin}
                className="mt-5 h-12 w-full rounded-xl text-sm font-bold"
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Joining…</span>
                  </>
                ) : (
                  <span>Accept invitation</span>
                )}
              </Button>
            )}

            <button
              type="button"
              onClick={handleDecline}
              disabled={joining}
              className="mt-1 w-full rounded-xl py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              No thanks
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              This invitation link is personal to you.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default InviteAccept;
