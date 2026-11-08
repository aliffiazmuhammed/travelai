import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgencyEnabled } from '@/hooks/useAgencyEnabled';
import { api } from '@/services/api';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { toast } from 'sonner';
import type { AgencyInvitePreview } from '@/types';

/**
 * `/agency/invite/:token` (PA0).
 *
 * Acceptance is agency-account activation, not a personal sign-in: the invitee
 * chooses the password for a tenant-scoped agency account. An existing agency
 * account for this tenant is signed in; a personal account is never attached or
 * converted, even when the email matches.
 */
const AgencyInviteAccept: React.FC = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const enabled = useAgencyEnabled();
  const { isAuthenticated, user, applySession } = useAgencyAuth();

  const [preview, setPreview] = useState<AgencyInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.email) setEmail(user.email);
  }, [isAuthenticated, user?.email]);

  useEffect(() => {
    if (!token || enabled === null) return;
    if (!enabled) {
      setLoading(false);
      setError('The agency workspace is not enabled.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    api
      .getAgencyInvitePreview(token)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'This invitation is invalid or has expired.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, enabled]);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !preview) return;
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Enter the email address this invitation was sent to.');
      return;
    }
    if (password.length < 6) {
      setFormError('Choose a password with at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('The passwords do not match.');
      return;
    }

    setJoining(true);
    try {
      const result = await api.acceptAgencyInvite(token, {
        email: trimmedEmail,
        password,
        name: name.trim() || undefined,
      });
      applySession(result);
      toast.success(result.message || 'Welcome to the agency team.');
      navigate('/agency', { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'We could not accept the invitation.'
      );
    } finally {
      setJoining(false);
    }
  };

  if (enabled === null || loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-agency-canvas">
        <div className="flex items-center gap-2 text-sm text-agency-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your invitation...
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="grid min-h-screen place-items-center bg-agency-canvas px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-agency-line bg-agency-panel p-7 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="mt-4 space-y-1.5">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-agency-ink">
              Invitation unavailable
            </h1>
            <p className="text-sm leading-6 text-agency-muted">
              {error ?? 'This invitation is invalid or has expired.'}
            </p>
          </div>
          <Button
            asChild
            className="mt-6 h-11 w-full rounded-lg bg-agency-accent text-white hover:bg-agency-accent/90"
          >
            <Link to="/agency/login">Go to agency sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-agency-canvas px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <Link to="/" className="flex items-center gap-3">
            <img src="/brand/waytowalk-logo-name.svg" alt="waytowalk" width="148" height="30" className="h-[30px] w-[148px]" />
            <span className="text-sm font-semibold text-agency-accent">Agency</span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-agency-line bg-agency-panel shadow-sm">
          <div className="h-1.5 w-full bg-agency-accent" />
          <div className="space-y-5 p-6 sm:p-8">
            <header className="space-y-1.5">
              <h1 className="font-display text-3xl font-semibold tracking-tight text-agency-ink">
                Join {preview.agency.name}
              </h1>
              <p className="text-sm leading-6 text-agency-muted">
                Choose the password for your agency account. This is separate
                from any personal waytowalk account.
              </p>
            </header>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-agency-line bg-agency-accent-soft p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-agency-accent text-white">
                {preview.agency.logoUrl ? (
                  <img
                    src={preview.agency.logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-agency-ink">
                  {preview.agency.name}
                </div>
                <div className="truncate text-xs text-agency-muted">
                  workspace: {preview.agency.slug}
                </div>
              </div>
              <Badge variant="outline" className={agencyRoleBadgeClass(preview.role)}>
                {agencyRoleLabel(preview.role)}
              </Badge>
            </div>

            {formError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {formError}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={accept}>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Work email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="you@agency.com"
                    autoComplete="email"
                    className="h-11 border-agency-line bg-agency-panel pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-name">Display name (optional)</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
                  <Input
                    id="invite-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    maxLength={40}
                    className="h-11 border-agency-line bg-agency-panel pl-9"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-password">Agency password</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
                    <Input
                      id="invite-password"
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (formError) setFormError(null);
                      }}
                      autoComplete="new-password"
                      className="h-11 border-agency-line bg-agency-panel pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-confirm">Confirm password</Label>
                  <Input
                    id="invite-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      if (formError) setFormError(null);
                    }}
                    autoComplete="new-password"
                    className="h-11 border-agency-line bg-agency-panel"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="h-11 w-full rounded-lg bg-agency-accent text-white hover:bg-agency-accent/90"
                disabled={joining}
              >
                {joining ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Join {preview.agency.name}
              </Button>
            </form>

            <p className="border-t border-agency-line pt-5 text-center text-xs leading-5 text-agency-muted">
              Already have an agency account for this workspace?{" "}
              <Link
                to={`/agency/login?workspace=${encodeURIComponent(preview.agency.slug)}`}
                className="font-semibold text-agency-accent hover:underline"
              >
                Sign in
              </Link>
              . Joining an agency never changes your personal trips or chats.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencyInviteAccept;
