import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAgencyAuth } from '@/context/AgencyAuthContext';

/**
 * PA0 retired self-service agency creation.
 *
 * Agencies are paying SaaS tenants provisioned by TravelAI from the platform
 * admin panel (PA3). This page exists only so old `/agency/onboarding` links
 * land on a clear explanation instead of a broken screen.
 */
const AgencyOnboarding: React.FC = () => {
  const { agency, user } = useAgencyAuth();

  return (
    <div className="mx-auto max-w-xl">
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Agencies are set up by TravelAI</h1>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
              Agency workspaces are provisioned for paying customers, and each
              agency account belongs to exactly one workspace. Self-service
              creation is no longer available.
            </p>
            {agency ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                You are signed in to <strong>{agency.name}</strong>
                {user?.email ? ` as ${user.email}` : ''}.
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-left text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
              <p>
                Need a new workspace or another teammate? Contact your TravelAI
                account manager. They will create the tenant and send the owner a
                separate agency login.
              </p>
            </div>
            <div className="mt-3 flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
              <p>
                Your personal TravelAI account is never converted into an agency
                account, even when the email address is the same.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to="/agency">Back to workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyOnboarding;
