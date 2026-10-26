import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/UserContext";
import { cn } from "@/lib/utils";

type FieldErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
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
    const next: FieldErrors = {};

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
        await signup(trimmedEmail, password);
      }
    } catch {
      // Error is set in context
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-all">
            <Plane className="h-5 w-5" />
          </div>
          <span className="text-xl font-extrabold text-foreground">
            TravelAI
          </span>
        </Link>

        <Card className="shadow-card border-border/50">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">
              {isLogin ? "Welcome Back" : "Get Started"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "Sign in to access your trips and continue planning"
                : "Create an account to turn your travel ideas into a day-by-day plan"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                        className="text-xs font-bold underline hover:opacity-80 block text-primary mt-1"
                      >
                        Sign in with this email instead →
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className={cn("h-11", fieldErrors.email && "border-destructive focus-visible:ring-destructive")}
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
                  placeholder="••••••••"
                  className={cn("h-11", fieldErrors.password && "border-destructive focus-visible:ring-destructive")}
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
                    placeholder="••••••••"
                    className={cn("h-11", fieldErrors.confirmPassword && "border-destructive focus-visible:ring-destructive")}
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

              <Button variant="hero" size="lg" className="w-full font-bold" disabled={loading}>
                {loading ? (isLogin ? 'Signing you in…' : 'Creating your account…') : (isLogin ? "Sign In" : "Create Account")}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="text-primary hover:underline font-semibold"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
