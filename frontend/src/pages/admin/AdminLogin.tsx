import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, Lock, Mail, ShieldCheck, ShieldOff } from 'lucide-react';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { usePlatformEnabled } from '@/hooks/usePlatformEnabled';

/**
 * `/admin/login` (PA1).
 *
 * A separate front door for the platform realm: it authenticates against
 * `/api/admin/auth/signin` and the `platform_token` cookie only. Personal and
 * agency credentials are rejected by the server with the same generic error.
 */
const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const enabled = usePlatformEnabled();
  const { signin, isAuthenticated, loading: authLoading } = usePlatformAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/admin', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Enter your email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signin(trimmedEmail, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Incorrect email or password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (enabled === null || authLoading) {
    return (
      <div className="dark grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking platform access…
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="dark grid min-h-screen place-items-center bg-background px-4">
        <Card className="w-full max-w-md rounded-2xl border-border bg-card">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ShieldOff className="h-6 w-6" aria-hidden />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold text-foreground">
                Platform admin is not enabled
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                The internal operations console is switched off. Nothing else on
                TravelAI is affected.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="dark relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.06)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/25">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            TravelAI <span className="text-indigo-400">Platform</span>
          </span>
        </div>

        <Card className="rounded-2xl border-border bg-card shadow-2xl shadow-black/40">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
                Operations sign in
              </CardTitle>
              <Badge
                variant="outline"
                className="border-indigo-500/40 bg-indigo-500/10 text-[10px] font-semibold uppercase tracking-wide text-indigo-300"
              >
                Isolated realm
              </Badge>
            </div>
            <CardDescription className="leading-6">
              Internal platform administrators only. This account is separate from
              personal and agency accounts, and nothing here reads tenant content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}

              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-11 pl-9"
                    placeholder="ops@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-11 pl-9"
                    placeholder="Your password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full bg-indigo-500 text-white hover:bg-indigo-400"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Sign in to the console
              </Button>
            </form>

            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Every sign-in is written to the platform audit trail.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLogin;
