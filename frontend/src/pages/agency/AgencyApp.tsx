import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AgencyProvider } from '@/context/AgencyContext';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgencyEnabled } from '@/hooks/useAgencyEnabled';
import AgencyLayout from './AgencyLayout';
import AgencyPasswordChange from './AgencyPasswordChange';

/**
 * `/agency/*` gate (PA0).
 *
 * The backend feature flag is authoritative; while the probe is in flight we
 * show a neutral loader, and when it is off we never mount the shell or call
 * any agency API. Access requires an *agency* session — a personal session
 * alone is not enough. A provisioned owner with a temporary password must set
 * a new one before the tenant API becomes reachable.
 */
const AgencyApp: React.FC = () => {
  const enabled = useAgencyEnabled();
  const { isAuthenticated, loading, mustChangePassword } = useAgencyAuth();

  if (enabled === null || loading) {
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

  if (!isAuthenticated) {
    return <Navigate to="/agency/login" replace />;
  }

  if (mustChangePassword) {
    return <AgencyPasswordChange forced />;
  }

  return (
    <AgencyProvider>
      <AgencyLayout />
    </AgencyProvider>
  );
};

export default AgencyApp;
