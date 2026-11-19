import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@/context/UserContext";
import { DEFAULT_LEGAL_CONFIG, fetchAuthConfig, type LegalConfig } from "@/lib/authConfig";
import { PasswordStrength } from "@/components/auth/PasswordStrength";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { AuthPostcard } from "@/components/auth/AuthPostcard";
import { AUTH_PHOTO_URL } from "@/components/auth/authPhoto";
import { AppImage } from "@/components/ui/app-image";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import WaytowalkLoader from "@/components/brand/WaytowalkLoader";
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
  type PasswordPolicy,
} from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  consent?: string;
};

const Auth = () => {
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  // An invite more than one account can see prefills the invited address after
  // "sign out and continue with…", so the recovery is one click plus a password.
  const [email, setEmail] = useState(
    typeof location.state?.email === "string" ? location.state.email : ""
  );
  const [password, setPassword] = useState('');
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [legalConfig, setLegalConfig] = useState<LegalConfig>(DEFAULT_LEGAL_CONFIG);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);
  const [consentRequired, setConsentRequired] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLButtonElement>(null);
  const { signup, signin, loading, error, clearError, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const showPhoto = useIsDesktop();
  const from = location.state?.from?.pathname || "/dashboard";
  const fromState = location.state?.from?.state;

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true, state: fromState });
    }
  }, [isAuthenticated, navigate, from, fromState]);

  // Fetch the versions the server will accept. The local defaults keep the form
  // usable if the API is briefly unavailable; a stale pair is rejected server-side.
  useEffect(() => {
    const controller = new AbortController();
    fetchAuthConfig(controller.signal)
      .then((config) => {
        setLegalConfig(config.legal);
        setPasswordPolicy(config.password);
        // The server owns whether accepting the current versions is a hard
        // requirement; the form mirrors it instead of always enforcing.
        setConsentRequired(config.consentRequired);
      })
      .catch(() => {
        // Keep DEFAULT_LEGAL_CONFIG and DEFAULT_PASSWORD_POLICY.
      });
    return () => controller.abort();
  }, []);

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    clearError();
    setFieldErrors({});
    setAcceptedLegal(false);
    setMarketingOptIn(false);
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

    if (trimmedName.length > 40) {
      next.name = "Keep your name under 40 characters.";
    }

    if (!trimmedEmail) {
      next.email = "Enter your email address.";
    } else if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      next.email = "That email doesn't look right — check for typos.";
    }

    if (!password) {
      next.password = "Enter your password.";
    } else if (!isLogin) {
      const problem = passwordProblem(password, passwordPolicy, {
        email: trimmedEmail,
        name: trimmedName,
      });
      if (problem) next.password = problem;
    }

    if (!isLogin && consentRequired && !acceptedLegal) {
      next.consent = "Please accept the Terms and Privacy Policy to create an account.";
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      // Move focus after the errors exist in the DOM, so the field announces
      // both aria-invalid and its aria-describedby error text.
      const firstInvalid = (
        ["name", "email", "password", "consent"] as const
      ).find((field) => next[field]);
      if (firstInvalid) {
        const target =
          firstInvalid === "name"
            ? nameRef
            : firstInvalid === "email"
              ? emailRef
              : firstInvalid === "password"
                ? passwordRef
                : consentRef;
        requestAnimationFrame(() => {
          target.current?.focus();
          // focus() brings the input into view, but its error sits below it.
          target.current?.scrollIntoView({ block: "center" });
        });
      }
      return;
    }

    try {
      if (isLogin) {
        await signin(trimmedEmail, password);
      } else {
        await signup(trimmedEmail, password, trimmedName || undefined, {
          termsVersion: legalConfig.termsVersion,
          privacyVersion: legalConfig.privacyVersion,
          marketingOptIn,
        });
      }
    } catch {
      // Error is set in context
    }
  };

  const handleLegalChange = (checked: boolean) => {
    setAcceptedLegal(checked);
    if (fieldErrors.consent) {
      setFieldErrors((previous) => ({ ...previous, consent: undefined }));
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

  // While the initial session check (or a sign-in/sign-up round trip) is in
  // flight, show the branded loader instead of an editable form that is about
  // to redirect. A failed attempt clears `loading`, so the form and its error
  // return together.
  if (loading && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WaytowalkLoader size="md" caption="Checking your session…" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[48fr_52fr]">
      {/* Photo panel — requested only at lg and above (C-21), so phones do not
          download a desktop-sized photograph they never display. */}
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
              Your next trip could start with someone else’s plan.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/80 xl:text-base">
              One account for your trips, chats and enquiries.
            </p>
          </div>
        </div>
        </aside>
      )}

      {/* Auth floor — very light, softly tinted, card centred. */}
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-5 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,hsl(var(--primary)/0.08),transparent_55%)]"
        />

        <div className="relative flex w-full max-w-[440px] flex-col items-center">
          {/* Compact postcard for phone widths; the desktop panel carries the
              same local photograph (C-21). */}
          <AuthPostcard />

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
              <h1 className="font-display text-2xl font-semibold tracking-tight text-card-foreground sm:text-3xl">
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <CardDescription className="mx-auto max-w-xs text-sm leading-relaxed">
                {isLogin
                  ? "Pick up your trips, chats and enquiries where you left them."
                  : "One account for your trips, travel chats and enquiries."}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-5 sm:px-8 sm:pb-7">
              <form className="space-y-4" onSubmit={handleSubmit}>
                {error && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm font-medium flex items-start gap-2.5 animate-fade-in"
                  >
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
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      ref={nameRef}
                      name="name"
                      autoComplete="name"
                      placeholder="Asha Rao"
                      className={cn("h-12 rounded-lg bg-card", fieldErrors.name && "border-destructive focus-visible:ring-destructive")}
                      value={name}
                      onChange={handleInputChange("name", setName)}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? "name-error" : "name-help"}
                    />
                    {fieldErrors.name ? (
                      <p id="name-error" role="alert" className="text-sm font-medium text-destructive">
                        {fieldErrors.name}
                      </p>
                    ) : (
                      <p id="name-help" className="text-sm text-muted-foreground">
                        Optional — people see this on your trips.
                      </p>
                    )}
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
                    placeholder="you@example.com"
                    className={cn("h-12 rounded-lg bg-card", fieldErrors.email && "border-destructive focus-visible:ring-destructive")}
                    value={email}
                    onChange={handleInputChange("email", setEmail)}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  />
                  {fieldErrors.email && (
                    <p id="email-error" role="alert" className="text-sm font-medium text-destructive">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <Link
                        to="/forgot-password"
                        className="rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <PasswordInput
                    id="password"
                    ref={passwordRef}
                    name="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    placeholder={isLogin ? "••••••••" : "Choose a password"}
                    maxLength={isLogin ? undefined : passwordPolicy.maxLength}
                    className={cn("h-12 rounded-lg bg-card", fieldErrors.password && "border-destructive focus-visible:ring-destructive")}
                    value={password}
                    onChange={handleInputChange("password", setPassword)}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={
                      [fieldErrors.password ? "password-error" : null, !isLogin ? "password-requirements" : null]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  />
                  {fieldErrors.password && (
                    <p id="password-error" role="alert" className="text-sm font-medium text-destructive">
                      {fieldErrors.password}
                    </p>
                  )}
                  {!isLogin && (
                    <PasswordStrength
                      id="password-requirements"
                      value={password}
                      policy={passwordPolicy}
                      email={email}
                      name={name}
                    />
                  )}
                </div>

                {!isLogin && (
                  <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-3.5">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="accept-legal"
                        ref={consentRef}
                        name="acceptLegal"
                        checked={acceptedLegal}
                        onCheckedChange={(value) => handleLegalChange(value === true)}
                        aria-labelledby="accept-legal-label"
                        aria-invalid={Boolean(fieldErrors.consent)}
                        aria-describedby={fieldErrors.consent ? "consent-error" : undefined}
                        className="mt-0.5 h-6 w-6 shrink-0 rounded-[5px]"
                      />
                      <p id="accept-legal-label" className="min-w-0 text-sm leading-relaxed text-foreground">
                        I agree to the{" "}
                        <Link
                          to={legalConfig.termsPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link
                          to={legalConfig.privacyPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    </div>
                    {fieldErrors.consent ? (
                      <p id="consent-error" role="alert" className="text-sm font-medium text-destructive">
                        {fieldErrors.consent}
                      </p>
                    ) : null}
                    <div className="flex min-h-11 items-start gap-3 border-t border-border/60 pt-3">
                      <Checkbox
                        id="marketing-opt-in"
                        checked={marketingOptIn}
                        onCheckedChange={(value) => setMarketingOptIn(value === true)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded-[4px]"
                      />
                      <label
                        htmlFor="marketing-opt-in"
                        className="min-w-0 cursor-pointer text-sm leading-relaxed text-muted-foreground"
                      >
                        Send me occasional trip ideas and product updates. (optional)
                      </label>
                    </div>
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

              <div className="mt-6 space-y-2 border-t border-border/60 pt-5 text-center">
                <p className="text-sm font-medium text-foreground">
                  Free to start — no card needed.
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Your trips stay private until you choose to share them.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Auth;
