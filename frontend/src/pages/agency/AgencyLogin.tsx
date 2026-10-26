import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Building2, Loader2, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgencyEnabled } from '@/hooks/useAgencyEnabled';
import { api } from '@/services/api';
import type { AgencyPublicTenant } from '@/types';

/** Last tenant used on this device; prefill only, never a session or switcher. */
const WORKSPACE_HINT_KEY = 'travelai.agencyWorkspace';

function readWorkspaceHint(): string {
  try {
    return localStorage.getItem(WORKSPACE_HINT_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberWorkspaceHint(workspace: string): void {
  try {
    localStorage.setItem(WORKSPACE_HINT_KEY, workspace);
  } catch {
    /* localStorage can be unavailable in private modes */
  }
}

/**
 * `/agency/login?workspace=<slug>` (PA0).
 *
 * Agency login is two-dimensional: the workspace slug resolves the tenant, then
 * the email/password identifies a *tenant-scoped agency account*. It never uses
 * the personal session, and signing in here leaves the personal session alone.
 */
const AgencyLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const enabled = useAgencyEnabled();
  const { signin, isAuthenticated, loading: authLoading } = useAgencyAuth();

  const queryWorkspace = (searchParams.get('workspace') ?? '').trim().toLowerCase();
  const [workspace, setWorkspace] = useState(
    queryWorkspace || readWorkspaceHint()
  );
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [tenant, setTenant] = useState<AgencyPublicTenant | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in to an agency account: go straight to the workspace.
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/agency', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const lookupWorkspace = useCallback(async (value: string) => {
    const slug = value.trim().toLowerCase();
    if (!slug) {
      setTenant(null);
      return;
    }
    setLookingUp(true);
    try {
      const result = await api.getAgencyLoginContext(slug);
      setTenant(result.agency);
    } catch {
      setTenant(null);
    } finally {
      setLookingUp(false);
    }
  }, []);

  useEffect(() => {
    if (!queryWorkspace) return;
    void lookupWorkspace(queryWorkspace);
  }, [queryWorkspace, lookupWorkspace]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const slug = workspace.trim().toLowerCase();
    const trimmedEmail = email.trim();

    if (!slug) {
      setError('Enter your workspace name.');
      return;
    }
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
      await signin(slug, trimmedEmail, password);
      rememberWorkspaceHint(slug);
      navigate('/agency', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Incorrect workspace, email or password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (enabled === null || authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking agency workspace...
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <Building2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold">Agency workspace is not enabled</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This private pilot feature is currently switched off. Your
                personal trips and messages are unchanged.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link to="/dashboard">Back to my trips</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            TravelAI <span className="text-teal-600">Agency</span>
          </span>
        </Link>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Sign in to your agency</CardTitle>
            <CardDescription>
              {tenant
                ? `Continue to ${tenant.name}.`
                : 'Enter the workspace name your TravelAI account manager gave you.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {tenant ? (
                <div className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 dark:border-teal-900 dark:bg-teal-950/40">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-teal-700 dark:bg-slate-900 dark:text-teal-300">
                    {tenant.logoUrl ? (
                      <img
                        src={tenant.logoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Building2 className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-teal-900 dark:text-teal-100">
                      {tenant.name}
                    </div>
                    <div className="truncate text-xs text-teal-700 dark:text-teal-300">
                      workspace: {tenant.slug}
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="workspace">Workspace</Label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="workspace"
                    value={workspace}
                    onChange={(event) => {
                      setWorkspace(event.target.value);
                      setTenant(null);
                      if (error) setError(null);
                    }}
                    onBlur={() => void lookupWorkspace(workspace)}
                    placeholder="acme-travel"
                    autoComplete="organization"
                    className="h-11 pl-9"
                    maxLength={40}
                  />
                  {lookingUp ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="you@agency.com"
                    autoComplete="email"
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Agency password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Your agency password"
                    autoComplete="current-password"
                    className="h-11 pl-9"
                  />
                </div>
              </div>

              <Button type="submit" className="h-11 w-full" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sign in to agency
              </Button>
            </form>

            <p className="mt-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
              Agency accounts are separate from personal TravelAI accounts. The
              same email can have both, with different passwords.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-500">
          Looking for your personal trips?{' '}
          <Link to="/auth" className="font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Personal sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AgencyLogin;
