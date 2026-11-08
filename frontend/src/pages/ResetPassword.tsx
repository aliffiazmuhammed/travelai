import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

const PHOTO_URL =
  "https://images.unsplash.com/photo-1476990789491-712b869b91a5?auto=format&fit=crop&w=1400&q=80";

const ResetPassword = () => {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setError(null);

    const next: { password?: string; confirmPassword?: string } = {};
    if (!password) {
      next.password = "Choose a new password.";
    } else if (password.length < 6) {
      next.password = "Use at least 6 characters.";
    }
    if (!confirmPassword) {
      next.confirmPassword = "Re-enter your password to confirm it.";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "These don't match the password above.";
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setSaving(true);
    try {
      await api.resetPassword(token ?? '', password);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "We couldn't update your password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const unusable = !token;

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[48fr_52fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <img
          src={PHOTO_URL}
          alt=""
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(2,6,23,0.4),transparent_60%)]"
        />

        <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-10 xl:p-14">
          <Link
            to="/"
            aria-label="waytowalk home"
            className="w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <img src="/brand/waytowalk-logo-reverse.svg" alt="waytowalk" width="156" height="32" className="h-8 w-[156px]" />
          </Link>

          <div className="max-w-md pb-4">
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
              Pick up your trips right where you left them.
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              Choose a password you'll remember and we'll sign you in on this device.
            </p>
          </div>
        </div>
      </aside>

      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.08),transparent_55%)]"
        />

        <div className="relative flex w-full max-w-[440px] flex-col items-center">
          <Link
            to="/"
            aria-label="waytowalk home"
            className="mb-6 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
          >
            <img src="/brand/waytowalk-logo-name.svg" alt="waytowalk" width="156" height="32" className="h-8 w-[156px] dark:hidden" />
            <img src="/brand/waytowalk-logo-reverse.svg" alt="waytowalk" width="156" height="32" className="hidden h-8 w-[156px] dark:block" />
          </Link>

          <Card className="w-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader className="space-y-2 px-5 pb-5 pt-7 text-center sm:px-8 sm:pt-8">
              <CardTitle className="font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-[28px]">
                {done ? "You're all set" : "Choose a new password"}
              </CardTitle>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {done
                  ? "Your password is updated and this device is signed in."
                  : "Use at least 6 characters. This link works once and expires after an hour."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              {done ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3.5 text-sm text-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <p>Your trips, chats and enquiries are ready when you are.</p>
                  </div>
                  <Button asChild variant="hero" size="lg" className="w-full rounded-xl font-semibold">
                    <a href="/dashboard">
                      Go to your dashboard
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              ) : unusable ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>This reset link is incomplete. Ask for a new one to continue.</p>
                  </div>
                  <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
                    <Link to="/forgot-password">Request a new link</Link>
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive">
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

                  <div className="space-y-2">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      autoFocus
                      placeholder="••••••••"
                      className={cn("h-11 rounded-lg bg-card", fieldErrors.password && "border-destructive focus-visible:ring-destructive")}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                        setError(null);
                      }}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                    />
                    {fieldErrors.password && (
                      <p id="password-error" className="text-xs font-medium text-destructive">
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={cn("h-11 rounded-lg bg-card", fieldErrors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                        setError(null);
                      }}
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
                    />
                    {fieldErrors.confirmPassword && (
                      <p id="confirm-password-error" className="text-xs font-medium text-destructive">
                        {fieldErrors.confirmPassword}
                      </p>
                    )}
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
