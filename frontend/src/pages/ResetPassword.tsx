import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { api, ApiError } from "@/services/api";
import { useAuth } from "@/context/UserContext";
import { queryClient } from "@/lib/queryClient";
import {
  forgetRememberedResetEmail,
  readRememberedResetEmail,
  resetLinkFailureState,
  type ResetLinkState,
} from "@/lib/authRecovery";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { AuthPostcard } from "@/components/auth/AuthPostcard";
import { AUTH_PHOTO_URL } from "@/components/auth/authPhoto";
import { AppImage } from "@/components/ui/app-image";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
} from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

/**
 * `checking` runs the read-only preflight before the form exists, so an expired
 * or used link is rejected here rather than after the visitor picks a password.
 * `retry` is reserved for a network/server failure — we never claim a link is
 * dead when we simply could not ask.
 */
const ResetPassword = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const passwordRef = useRef<HTMLInputElement>(null);
  const showPhoto = useIsDesktop();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [linkState, setLinkState] = useState<ResetLinkState>(token ? "checking" : "invalid");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [resetEmail] = useState(readRememberedResetEmail);

  useEffect(() => {
    if (!token) {
      setLinkState("invalid");
      return;
    }

    let cancelled = false;
    setLinkState("checking");
    setLinkError(null);

    api
      .validatePasswordResetToken(token)
      .then(() => {
        if (!cancelled) setLinkState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 400 is the server's "this link is not usable" answer. Anything
        // else (offline, 5xx, throttled) is transient and gets a retry.
        const nextState = resetLinkFailureState(
          err instanceof ApiError ? err.status : undefined
        );
        setLinkState(nextState);
        if (nextState === "invalid") return;
        setLinkError(
          err instanceof Error && err.message
            ? err.message
            : "We couldn't check this link. Please try again."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [token, checkAttempt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setError(null);

    const problem = password ? passwordProblem(password) : "Choose a new password.";
    if (problem) {
      setFieldError(problem);
      requestAnimationFrame(() => {
        passwordRef.current?.focus();
        passwordRef.current?.scrollIntoView({ block: "center" });
      });
      return;
    }

    setSaving(true);
    try {
      await api.resetPassword(token ?? '', password);
      // The response already switched the realm cookie. Drop cached data from
      // whatever account was signed in before, then adopt the fresh session so
      // the dashboard renders this account without a document reload.
      queryClient.clear();
      forgetRememberedResetEmail();
      await refreshUser();
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't update your password. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[48fr_52fr]">
      {/* The desktop photograph is requested only at lg and above (C-21). */}
      {showPhoto && (
      <aside className="relative overflow-hidden bg-background">
        <AppImage
          src={AUTH_PHOTO_URL}
          alt=""
          width={1920}
          height={1080}
          priority
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-muted/90 via-muted/55 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(2,6,23,0.4),transparent_60%)]"
        />

        <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
          <Link
            to="/"
            aria-label="waytowalk home"
            className="w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-brand"
          >
            <img src="/brand/waytowalk-logo-reverse.svg" alt="waytowalk" width="156" height="32" className="h-8 w-[156px]" />
          </Link>

          <div className="max-w-md pb-4">
            <p className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
              Pick up your trips right where you left them.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              Choose a password you'll remember and we'll sign you in on this device.
            </p>
          </div>
        </div>
      </aside>
      )}

      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-5 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.08),transparent_55%)]"
        />

        <div className="relative flex w-full max-w-[440px] flex-col items-center">
          <AuthPostcard />

          <Card className="w-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader className="space-y-2 px-5 pb-5 pt-7 text-center sm:px-8 sm:pt-8">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl">
                {linkState === "invalid"
                  ? "This link has expired"
                  : linkState === "retry"
                    ? "We couldn't check this link"
                    : done
                      ? "You're all set"
                      : "Choose a new password"}
              </h1>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {linkState === "invalid"
                  ? "Reset links work once and expire after an hour. Send yourself a fresh one to continue."
                  : linkState === "retry"
                    ? "The link may still be fine — we just couldn't reach the server."
                    : done
                      ? "Your password is updated and this device is signed in."
                      : linkState === "checking"
                        ? "Checking that this link is still usable…"
                        : "This link works once and expires after an hour."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              {linkState === "checking" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                  <p className="text-sm font-medium text-muted-foreground">
                    Checking your reset link…
                  </p>
                </div>
              ) : linkState === "invalid" ? (
                <div className="space-y-5">
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      This link is invalid, already used, or has expired. Nothing has changed on
                      your account.
                    </p>
                  </div>
                  <Button asChild variant="hero" size="lg" className="w-full rounded-xl font-semibold">
                    <Link to="/forgot-password">
                      Send a new link
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ) : linkState === "retry" ? (
                <div className="space-y-5">
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>{linkError}</p>
                  </div>
                  <div className="space-y-3">
                    <Button
                      type="button"
                      variant="hero"
                      size="lg"
                      className="w-full rounded-xl font-semibold"
                      onClick={() => setCheckAttempt((attempt) => attempt + 1)}
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Try again
                    </Button>
                    <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
                      <Link to="/forgot-password">Send a new link instead</Link>
                    </Button>
                  </div>
                </div>
              ) : done ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3.5 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <p>Your trips, chats and enquiries are ready when you are.</p>
                  </div>
                  <Button asChild variant="hero" size="lg" className="w-full rounded-xl font-semibold">
                    <Link to="/dashboard">
                      Go to your dashboard
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="flex-1 space-y-1">
                        <p>{error}</p>
                        <Link
                          to="/forgot-password"
                          className="mt-1 block text-xs font-bold underline hover:opacity-80"
                        >
                          Request a new link →
                        </Link>
                      </div>
                    </div>
                  )}

                  {resetEmail ? (
                    <input
                      type="email"
                      name="username"
                      autoComplete="username"
                      value={resetEmail}
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      className="sr-only"
                    />
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <PasswordInput
                      id="password"
                      ref={passwordRef}
                      name="password"
                      autoComplete="new-password"
                      autoFocus
                      placeholder="Choose a password"
                      maxLength={DEFAULT_PASSWORD_POLICY.maxLength}
                      className={cn("h-12 rounded-lg bg-card", fieldError && "border-destructive focus-visible:ring-destructive")}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldError(null);
                        setError(null);
                      }}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={
                        [fieldError ? "password-error" : null, "password-requirements"]
                          .filter(Boolean)
                          .join(" ")
                      }
                    />
                    {fieldError && (
                      <p id="password-error" role="alert" className="text-sm font-medium text-destructive">
                        {fieldError}
                      </p>
                    )}
                    <PasswordStrength id="password-requirements" value={password} />
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="mt-1 w-full rounded-xl font-semibold"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {saving ? "Updating your password…" : "Save new password"}
                    {!saving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </form>
              )}

              {!done && (
                <div className="mt-5 flex items-center gap-3">
                  <span aria-hidden className="h-px flex-1 bg-border" />
                  <p className="text-center text-xs text-muted-foreground">
                    <Link
                      to="/auth"
                      className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Back to sign in
                    </Link>
                  </p>
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
