import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/context/UserContext";
import { cn } from "@/lib/utils";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const PHOTO_URL =
  "https://images.unsplash.com/photo-1476990789491-712b869b91a5?auto=format&fit=crop&w=1400&q=80";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { signup, signin, loading, error, clearError, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";
  const fromState = location.state?.from?.state;

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true, state: fromState });
    }
  }, [isAuthenticated, navigate, from, fromState]);

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    clearError();
    setFieldErrors({});
    setConfirmPassword('');
  };

  /** Move to an explicit mode without re-toggling when the tab is already active. */
  const switchMode = (nextIsLogin: boolean) => {
    if (nextIsLogin !== isLogin) handleToggleMode();
  };

  const handleInputChange = (
    field: keyof FieldErrors,
    setter: (val: string) => void
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (error) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    clearError();

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    const next: FieldErrors = {};

    if (!isLogin && !trimmedName) {
      next.name = "Enter your name — agencies use it when they reply.";
    }

    if (!trimmedEmail) {
      next.email = "Enter your email address.";
    } else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      next.email = "That email doesn't look right — check for typos.";
    }

    if (!password) {
      next.password = "Enter your password.";
    } else if (!isLogin && password.length < 6) {
      next.password = "Use at least 6 characters.";
    }

    if (!isLogin) {
      if (!confirmPassword) {
        next.confirmPassword = "Re-enter your password to confirm it.";
      } else if (password !== confirmPassword) {
        next.confirmPassword = "These don't match the password above.";
      }
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    try {
      if (isLogin) {
        await signin(trimmedEmail, password);
      } else {
        await signup(trimmedEmail, password, trimmedName);
      }
    } catch {
      // Error is set in context
    }
  };

  const tabClass = (active: boolean) =>
    cn(
      "relative flex min-h-[52px] items-center justify-center px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    );

  const ctaLabel = loading
    ? isLogin
      ? "Signing you in…"
      : "Creating your account…"
    : isLogin
      ? "Sign in"
      : "Create account";

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[48fr_52fr]">
      {/* Photo panel — hidden on small screens, always dark-overlaid on large ones. */}
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
              Your next trip could start with someone else’s plan.
            </h1>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              One account for your trips, chats and enquiries.
            </p>
          </div>
        </div>
      </aside>

      {/* Auth floor — very light, softly tinted, card centred. */}
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
            <div
              role="group"
              aria-label="Sign in or create an account"
              className="grid grid-cols-2 border-b border-border/70"
            >
              <button
                type="button"
                aria-pressed={isLogin}
                onClick={() => switchMode(true)}
                className={tabClass(isLogin)}
              >
                Sign in
                {isLogin && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                aria-pressed={!isLogin}
                onClick={() => switchMode(false)}
                className={tabClass(!isLogin)}
              >
                Create account
                {!isLogin && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                )}
              </button>
            </div>

            <CardHeader className="space-y-2 px-5 pb-5 pt-7 text-center sm:px-8 sm:pt-8">
              <CardTitle className="font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-[28px]">
                {isLogin ? "Welcome back" : "Create your account"}
              </CardTitle>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {isLogin
                  ? "Pick up your trips, chats and enquiries where you left them."
                  : "One account for your trips, travel chats and enquiries."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm font-medium flex items-start gap-2.5 animate-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                    <div className="flex-1 space-y-1">
                      <p>{error}</p>
                      {error.toLowerCase().includes("already exists") && !isLogin && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsLogin(true);
                            clearError();
                            setFieldErrors({});
                          }}
                          className="mt-1 block text-xs font-bold underline hover:opacity-80 text-primary"
                        >
                          Sign in with this email instead →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="Asha Rao"
                      className={cn("h-11 rounded-lg bg-card", fieldErrors.name && "border-destructive focus-visible:ring-destructive")}
                      value={name}
                      onChange={handleInputChange("name", setName)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "name-error" : undefined}
                    />
                    {fieldErrors.name ? (
                      <p id="name-error" className="text-xs font-medium text-destructive">
                        {fieldErrors.name}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This is the name agencies see when you get in touch.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={cn("h-11 rounded-lg bg-card", fieldErrors.email && "border-destructive focus-visible:ring-destructive")}
                    value={email}
                    onChange={handleInputChange("email", setEmail)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  />
                  {fieldErrors.email && (
                    <p id="email-error" className="text-xs font-medium text-destructive">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    className={cn("h-11 rounded-lg bg-card", fieldErrors.password && "border-destructive focus-visible:ring-destructive")}
                    value={password}
                    onChange={handleInputChange("password", setPassword)}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  />
                  {fieldErrors.password && (
                    <p id="password-error" className="text-xs font-medium text-destructive">
                      {fieldErrors.password}
                    </p>
                  )}
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={cn("h-11 rounded-lg bg-card", fieldErrors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
                      value={confirmPassword}
                      onChange={handleInputChange("confirmPassword", setConfirmPassword)}
                      aria-invalid={Boolean(fieldErrors.confirmPassword)}
                      aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
                    />
                    {fieldErrors.confirmPassword && (
                      <p id="confirm-password-error" className="text-xs font-medium text-destructive">
                        {fieldErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="hero"
                  size="lg"
                  className="mt-1 w-full rounded-xl font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {ctaLabel}
                  {!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </form>

              <div className="mt-5 flex items-center gap-3">
                <span aria-hidden className="h-px flex-1 bg-border" />
                <p className="text-center text-xs text-muted-foreground">
                  {isLogin ? "New to TravelAI?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(!isLogin)}
                    className="rounded-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {isLogin ? "Create an account" : "Sign in"}
                  </button>
                </p>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </div>

              <p className="pt-6 text-center text-xs text-muted-foreground">
                Free to start · No card needed
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Auth;
