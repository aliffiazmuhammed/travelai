import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
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
      <div className="grid min-h-screen place-items-center bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking platform access...
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-100">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-800 text-slate-400">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Platform admin is not enabled</h1>
              <p className="text-sm text-slate-400">
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
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/25">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-100">
            TravelAI <span className="text-indigo-400">Platform</span>
          </span>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-xl shadow-black/20">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Operations sign in</CardTitle>
            <CardDescription className="text-slate-400">
              Internal platform administrators only. This account is separate from
              personal and agency accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {error ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm font-medium text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="admin-email" className="text-slate-300">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="admin-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-11 border-slate-700 bg-slate-950 pl-9 text-slate-100 placeholder:text-slate-500"
                    placeholder="ops@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-password" className="text-slate-300">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    id="admin-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError(null);
                    }}
                    className="h-11 border-slate-700 bg-slate-950 pl-9 text-slate-100 placeholder:text-slate-500"
                    placeholder="Your password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full bg-indigo-500 text-white hover:bg-indigo-400"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in to the console
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          Access is logged to the platform audit trail.
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
