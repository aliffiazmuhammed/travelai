import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Briefcase,
  Building2,
  Loader2,
  Lock,
  Mail,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const AgencyBrand = ({ inverted = false }: { inverted?: boolean }) => (
  <span className="flex items-center gap-3">
    <img
      src={inverted ? "/brand/waytowalk-logo-reverse.svg" : "/brand/waytowalk-logo-name.svg"}
      alt="waytowalk"
      width="148"
      height="30"
      className="h-[30px] w-[148px]"
    />
    <span className={`text-sm font-semibold ${inverted ? "text-white/70" : "text-agency-accent"}`}>
      Agency
    </span>
  </span>
);

const PROMISES = [
  {
    icon: UserRound,
    title: "Separate from your personal account",
    body: "Keep your agency and personal travel distinct.",
  },
  {
    icon: Users,
    title: "Invites for every teammate",
    body: "Work together, with the right access.",
  },
  {
    icon: Briefcase,
    title: "Your workspace, your clients",
    body: "Manage enquiries, trips and traveller details in one place.",
  },
];

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
      <div className="grid min-h-screen place-items-center bg-agency-canvas">
        <div className="flex items-center gap-2 text-sm text-agency-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking agency workspace...
        </div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="grid min-h-screen place-items-center bg-agency-canvas px-4">
        <div className="w-full max-w-md rounded-2xl border border-agency-line bg-agency-panel p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-agency-accent-soft text-agency-accent">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="mt-4 space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-agency-ink">
              Agency workspace is not enabled
            </h1>
            <p className="text-sm leading-6 text-agency-muted">
              This private pilot feature is currently switched off. Your
              personal trips and messages are unchanged.
            </p>
          </div>
          <Button
            asChild
            className="mt-6 h-11 w-full rounded-lg bg-agency-accent text-white hover:bg-agency-accent/90"
          >
            <Link to="/dashboard">Back to my trips</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-agency-canvas text-agency-ink lg:grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <aside className="relative hidden overflow-hidden bg-agency-accent p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
          viewBox="0 0 600 800"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <path d="M-40 120c120-60 240 60 360 0s220-40 320 20" stroke="white" strokeWidth="1" />
          <path d="M-60 220c140-70 260 70 400 10s240-30 320 40" stroke="white" strokeWidth="1" />
          <path d="M-30 330c150-80 250 80 410 20s230-20 290 50" stroke="white" strokeWidth="1" />
          <path d="M-70 450c160-90 270 90 420 30s220-10 310 60" stroke="white" strokeWidth="1" />
          <path d="M-20 570c140-70 250 70 390 20s240-20 310 40" stroke="white" strokeWidth="1" />
          <path d="M-50 690c130-60 260 80 420 20s200-10 280 50" stroke="white" strokeWidth="1" />
        </svg>

        <Link to="/" className="relative w-fit">
          <AgencyBrand inverted />
        </Link>

        <div className="relative max-w-md space-y-7">
          <div className="space-y-3">
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight">
              Your trips,
              <br />
              one calm workspace.
            </h1>
            <p className="text-sm leading-6 text-white/75">
              Sign in to manage enquiries, trips and the travellers you host.
            </p>
          </div>
          <ul className="space-y-5">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/25 text-white/90">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/60">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] font-medium tracking-[0.2em] text-white/45">
          TRAVEL FURTHER TOGETHER
        </p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Link to="/">
              <AgencyBrand />
            </Link>
          </div>

          <div className="rounded-2xl border border-agency-line bg-agency-panel p-6 shadow-sm sm:p-8">
            <header className="space-y-1.5">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-agency-ink">
                Sign in to your agency
              </h2>
              <p className="text-sm leading-6 text-agency-muted">
                {tenant
                  ? `Continue to ${tenant.name}.`
                  : "Enter the workspace name your waytowalk account manager gave you."}
              </p>
            </header>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              {tenant ? (
                <div className="flex items-center gap-3 rounded-xl border border-agency-line bg-agency-accent-soft px-3.5 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-agency-accent text-white">
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
                    <div className="truncate text-sm font-semibold text-agency-ink">
                      {tenant.name}
                    </div>
                    <div className="truncate text-xs text-agency-muted">
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
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
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
                    className="h-11 border-agency-line bg-agency-panel pl-9"
                    maxLength={40}
                  />
                  {lookingUp ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-agency-muted" />
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
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
                    className="h-11 border-agency-line bg-agency-panel pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Agency password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
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
                    className="h-11 border-agency-line bg-agency-panel pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-agency-accent text-white hover:bg-agency-accent/90"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sign in to agency
              </Button>
            </form>

            <p className="mt-5 border-t border-agency-line pt-5 text-center text-xs leading-5 text-agency-muted">
              Agency accounts are separate from personal waytowalk accounts. The
              same email can have both, with different passwords.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-agency-muted">
            Looking for your personal trips?{" "}
            <Link
              to="/auth"
              className="font-semibold text-agency-accent hover:underline"
            >
              Personal sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default AgencyLogin;
