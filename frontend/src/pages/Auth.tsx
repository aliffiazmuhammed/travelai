import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plane, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/UserContext";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
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
    setFormError(null);
    setConfirmPassword('');
  };

  const handleInputChange = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (formError) setFormError(null);
    if (error) clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("Please enter your email address.");
      return;
    }

    if (!password) {
      setFormError("Please enter your password.");
      return;
    }

    if (!isLogin) {
      if (password.length < 6) {
        setFormError("Password must be at least 6 characters long.");
        return;
      }
      if (password !== confirmPassword) {
        setFormError("Passwords do not match. Please verify and try again.");
        return;
      }
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

  const activeError = formError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-hero px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-primary text-white flex items-center justify-center shadow-md shadow-sky-500/25 group-hover:scale-105 transition-all">
            <Plane className="h-5 w-5" />
          </div>
          <span className="text-xl font-extrabold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
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
                : "Create your account and start planning amazing trips"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {activeError && (
                <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm font-medium flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                  <div className="flex-1 space-y-1">
                    <p>{activeError}</p>
                    {activeError.toLowerCase().includes("already exists") && !isLogin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsLogin(true);
                          clearError();
                          setFormError(null);
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
                  className="h-11"
                  value={email}
                  onChange={handleInputChange(setEmail)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-11"
                  value={password}
                  onChange={handleInputChange(setPassword)}
                />
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    className="h-11"
                    value={confirmPassword}
                    onChange={handleInputChange(setConfirmPassword)}
                  />
                </div>
              )}

              <Button variant="hero" size="lg" className="w-full font-bold" disabled={loading}>
                {loading ? 'Please wait...' : (isLogin ? "Sign In" : "Create Account")}
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
