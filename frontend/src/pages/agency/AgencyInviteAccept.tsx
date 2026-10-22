import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, Loader2, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/UserContext';
import { useAgencyEnabled } from '@/hooks/useAgencyEnabled';
import { api } from '@/services/api';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { toast } from 'sonner';
import type { AgencyInvitePreview } from '@/types';

const INVITE_TOKEN_KEY = 'travelai.agencyInviteToken';

function stripTokenFromUrl(): void {
  try {
    window.history.replaceState(null, '', '/agency');
  } catch {
    /* ignore */
  }
}

/**
 * `/agency/invite/:token` — preview then accept. The token is kept in the URL
 * only while the flow is open; it is remembered in sessionStorage across the
 * auth round trip and removed after acceptance.
 */
const AgencyInviteAccept: React.FC = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { loading: authLoading, isAuthenticated } = useAuth();
  const enabled = useAgencyEnabled();

  const [preview, setPreview] = useState<AgencyInvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (token) {
      try {
        sessionStorage.setItem(INVITE_TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token || authLoading || enabled === null) return;
    if (!isAuthenticated) {
      navigate('/auth', {
        state: { from: { pathname: `/agency/invite/${token}` } },
        replace: true,
      });
      return;
    }
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
  }, [token, authLoading, isAuthenticated, enabled, navigate]);

  useEffect(
    () => () => {
      try {
        sessionStorage.removeItem(INVITE_TOKEN_KEY);
      } catch {
        /* ignore */
      }
    },
    []
  );

  const accept = async () => {
    if (!token || !preview) return;
    setJoining(true);
    try {
      const result = await api.acceptAgencyInvite(token);
      toast.success(result.message || 'Welcome to the agency team.');
      stripTokenFromUrl();
      navigate('/agency', { replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not accept the invitation.'
      );
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 sm:py-20">
        {loading || authLoading || enabled === null ? (
          <div className="flex items-center gap-2 py-20 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your invitation...
          </div>
        ) : error ? (
          <Card className="w-full">
            <CardContent className="space-y-4 p-7 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold">Invitation unavailable</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
              </div>
              <Button className="w-full" onClick={() => navigate('/dashboard')}>
                Go to my trips
              </Button>
            </CardContent>
          </Card>
        ) : preview ? (
          <Card className="w-full overflow-hidden">
            <div className="h-1.5 w-full bg-teal-600" />
            <CardContent className="space-y-5 p-7">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Agency invitation
                  </div>
                  <h1 className="text-xl font-semibold">{preview.agency.name}</h1>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">You will join as</span>
                  <Badge
                    variant="outline"
                    className={agencyRoleBadgeClass(preview.role)}
                  >
                    {agencyRoleLabel(preview.role)}
                  </Badge>
                </div>
                {preview.invitedBy ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Invited by {preview.invitedBy}
                  </p>
                ) : null}
                {preview.emailBoundTo ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Mail className="h-3.5 w-3.5" />
                    This invitation is bound to {preview.emailBoundTo}
                  </p>
                ) : null}
              </div>

              <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
                Joining the agency does not change your personal trips or chats.
                Agency access is separate, and clients are added per trip rather
                than to the staff team.
              </p>

              <Button className="w-full" onClick={() => void accept()} disabled={joining}>
                {joining ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                Join {preview.agency.name}
              </Button>
              <p className="text-center text-xs text-slate-400">
                This link is single-use by default and expires automatically.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
};

export default AgencyInviteAccept;
