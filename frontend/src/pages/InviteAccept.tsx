import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/UserContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Loader2, MapPin, CalendarClock, AlertTriangle, Sparkles, Users } from "lucide-react";
import { roleLabel } from "@/hooks/useTripAccess";
import { formatDateTime } from "@/lib/date";
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

  const loading = authLoading || loadingPreview;
  const emailMismatch =
    preview?.emailBoundTo && user?.email && preview.emailBoundTo !== user.email;

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 pt-24 pb-16">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Checking your invitation…</span>
          </div>
        ) : error ? (
          <Card className="rounded-3xl max-w-md w-full border border-border/70 bg-card/95 shadow-card overflow-hidden">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Invitation unavailable</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
              </div>
              <Button type="button" variant="hero" className="rounded-2xl h-11 px-6 text-xs font-bold" onClick={() => navigate("/dashboard")}>
                Go to dashboard
              </Button>
            </CardContent>
          </Card>
        ) : preview ? (
          <Card className="rounded-3xl max-w-md w-full border border-border/70 bg-card/95 shadow-card overflow-hidden">
            {/* Cover strip */}
            <div className="relative h-32 bg-gradient-to-br from-sky-500 to-primary">
              <div className="absolute inset-0 bg-black/25" />
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <span className="text-sm font-bold tracking-wide">
                  You are invited to collaborate
                </span>
              </div>
            </div>

            <CardContent className="p-6 space-y-5">
              <div className="space-y-1.5 text-center">
                <h2 className="text-xl font-semibold tracking-tight text-foreground line-clamp-2">
                  {preview.trip.title}
                </h2>
                {preview.trip.destination && (
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {preview.trip.destination}
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Badge className="bg-primary/10 text-primary border-primary/20 px-2.5 py-0.5 text-[11px] font-bold">
                    <Users className="w-3 h-3 mr-1" />
                    as {roleLabel(preview.role)}
                  </Badge>
                  {preview.invitedBy && (
                    <Badge variant="outline" className="text-[11px] px-2.5 py-0.5">
                      by {preview.invitedBy}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-muted/60 border border-border/60 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>
                    This invitation is valid until{" "}
                    <strong className="text-foreground">
                      {formatDateTime(preview.expiresAt)}
                    </strong>
                    {preview.kind === "email" ? " and is reserved for " : ""}
                    {preview.kind === "email" && (
                      <strong className="text-foreground">{preview.emailBoundTo}</strong>
                    )}
                    .
                  </span>
                </div>
                <p className="leading-relaxed">
                  You will be able to{" "}
                  {preview.role === "viewer"
                    ? "view the plan and print it — editing stays with the owner."
                    : preview.role === "editor"
                    ? "edit the itinerary, expenses map and days together with the owner."
                    : "follow along and join the trip discussion."}
                </p>
              </div>

              {emailMismatch ? (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
                  This invitation was sent to{" "}
                  <strong>{preview.emailBoundTo}</strong>, but you are signed in
                  as <strong>{user?.email}</strong>. Sign in with the invited
                  email to accept it.
                </div>
              ) : (
                <Button
                  type="button"
                  variant="hero"
                  disabled={joining}
                  onClick={handleJoin}
                  className="w-full rounded-2xl h-12 text-sm font-bold gap-2"
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Joining…</span>
                    </>
                  ) : (
                    <span>Join the trip</span>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
};

export default InviteAccept;
