import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

const PHOTO_URL =
  "https://images.unsplash.com/photo-1476990789491-712b869b91a5?auto=format&fit=crop&w=1400&q=80";

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    setError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Enter your email address.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setFieldError("That email doesn't look right — check for typos.");
      return;
    }

    setSending(true);
    try {
      const result = await api.requestPasswordReset(trimmed);
      setMessage(result.message);
    } catch (err: any) {
      setError(err?.message || "We couldn't send that reset link. Please try again.");
    } finally {
      setSending(false);
    }
  };

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
            aria-label="TravelAI home"
            className="w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <span className="font-display text-2xl font-semibold tracking-tight text-slate-950">
              Travel<span className="text-primary">AI</span>
            </span>
          </Link>

          <div className="max-w-md pb-4">
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white xl:text-5xl">
              A new password, a few minutes away.
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              Your trips and conversations will be waiting when you get back in.
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
            aria-label="TravelAI home"
            className="mb-6 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:hidden"
          >
            <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Travel<span className="text-primary">AI</span>
            </span>
          </Link>

          <Card className="w-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
            <CardHeader className="space-y-2 px-5 pb-5 pt-7 text-center sm:px-8 sm:pt-8">
              <CardTitle className="font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-[28px]">
                {message ? "Check your inbox" : "Reset your password"}
              </CardTitle>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {message
                  ? "The link is good for one hour. If it expires, you can ask for another."
                  : "Enter the email you signed up with and we'll send a link to set a new password."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              {message ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 p-3.5 text-sm text-foreground">
                    <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <p>{message}</p>
                  </div>
                  <Button asChild variant="outline" size="lg" className="w-full rounded-xl">
                    <Link to="/auth">
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Back to sign in
                    </Link>
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-sm font-medium text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>{error}</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      className={cn("h-11 rounded-lg bg-card", fieldError && "border-destructive focus-visible:ring-destructive")}
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
                      <p id="email-error" className="text-xs font-medium text-destructive">
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
