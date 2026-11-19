import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { AlertCircle, ArrowRight, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { api } from "@/services/api";
import { rememberResetEmail } from "@/lib/authRecovery";
import { AuthPostcard } from "@/components/auth/AuthPostcard";
import { AUTH_PHOTO_URL } from "@/components/auth/authPhoto";
import { AppImage } from "@/components/ui/app-image";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/** Long enough to stop double-clicks, short enough not to feel punitive. */
const RESEND_COOLDOWN_SECONDS = 30;

const ForgotPassword = () => {
  const emailRef = useRef<HTMLInputElement>(null);
  const showPhoto = useIsDesktop();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendResetLink = async (address: string) => {
    setSending(true);
    setError(null);
    try {
      const result = await api.requestPasswordReset(address);
      rememberResetEmail(address);
      setMessage(result.message);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "We couldn't send that reset link. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const showEmailError = (message: string) => {
    setFieldError(message);
    // Focus after the error is in the DOM so the field announces its message.
    requestAnimationFrame(() => {
      emailRef.current?.scrollIntoView({ block: "center" });
      emailRef.current?.focus({ preventScroll: true });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      showEmailError("Enter your email address.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      showEmailError("That email doesn't look right — check for typos.");
      return;
    }

    await sendResetLink(trimmed);
  };

  const handleResend = () => {
    const trimmed = email.trim();
    if (!trimmed || cooldown > 0) return;
    void sendResetLink(trimmed);
  };

  const useDifferentEmail = () => {
    setMessage(null);
    setError(null);
    setFieldError(null);
    setCooldown(0);
    requestAnimationFrame(() => emailRef.current?.focus());
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
              A new password, a few minutes away.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              Your trips and conversations will be waiting when you get back in.
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
                {message ? "Check your inbox" : "Reset your password"}
              </h1>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {message
                  ? "The link is good for one hour. If it expires, you can ask for another."
                  : "Enter the email you signed up with and we'll send a link to set a new password."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              {message ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3.5 text-sm text-foreground">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 space-y-1">
                      <p>{message}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        Sent to <span className="font-semibold text-foreground">{email.trim()}</span>
                      </p>
                    </div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>{error}</p>
                    </div>
                  )}

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    It can take a minute to arrive. If it isn't there, check your spam or
                    promotions folder before asking for another.
                  </p>

                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full rounded-xl"
                      onClick={handleResend}
                      disabled={sending || cooldown > 0}
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      )}
                      {sending
                        ? "Sending again…"
                        : cooldown > 0
                          ? `Send again in ${cooldown}s`
                          : "Send again"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="w-full rounded-xl"
                      onClick={useDifferentEmail}
                      disabled={sending}
                    >
                      Use a different email
                    </Button>
                  </div>

                  <p className="text-center text-xs text-muted-foreground">
                    <Link
                      to="/auth"
                      className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      Back to sign in
                    </Link>
                  </p>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>{error}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      ref={emailRef}
                      type="email"
                      name="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      className={cn("h-12 rounded-lg bg-card", fieldError && "border-destructive focus-visible:ring-destructive")}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFieldError(null);
                        setError(null);
                      }}
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={fieldError ? "email-error" : undefined}
                    />
                    {fieldError && (
                      <p id="email-error" role="alert" className="text-sm font-medium text-destructive">
                        {fieldError}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    size="lg"
                    className="mt-1 w-full rounded-xl font-semibold"
                    disabled={sending}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {sending ? "Sending the link…" : "Send reset link"}
                    {!sending && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </form>
              )}

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

              <p className="pt-6 text-center text-xs text-muted-foreground">
                Agency accounts are reset by their workspace owner.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default ForgotPassword;
