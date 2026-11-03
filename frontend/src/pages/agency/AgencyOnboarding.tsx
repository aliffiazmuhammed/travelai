import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center">
      <div className="w-full rounded-2xl border border-agency-line bg-agency-panel p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-agency-accent-soft text-agency-accent">
          <Building2 className="h-7 w-7" />
        </div>

        <div className="mt-5 space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-agency-ink">
            Agencies are set up by TravelAI
          </h1>
          <p className="mx-auto max-w-lg text-sm leading-6 text-agency-muted">
            Agency workspaces are provisioned for paying customers, and each
            agency account belongs to exactly one workspace. Self-service
            creation is no longer available.
          </p>
          {agency ? (
            <p className="text-xs text-agency-muted">
              You are signed in to{" "}
              <strong className="text-agency-ink">{agency.name}</strong>
              {user?.email ? ` as ${user.email}` : ""}.
            </p>
          ) : null}
        </div>

        <div className="mt-7 divide-y divide-agency-line border-y border-agency-line text-left">
          <div className="flex items-start gap-3 py-4">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-agency-accent" />
            <div>
              <p className="text-sm font-semibold text-agency-ink">
                Need a new workspace or another teammate?
              </p>
              <p className="mt-0.5 text-sm leading-6 text-agency-muted">
                Contact your TravelAI account manager. They will create the
                tenant and send the owner a separate agency login.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-agency-accent" />
            <div>
              <p className="text-sm font-semibold text-agency-ink">
                Your personal account stays personal.
              </p>
              <p className="mt-0.5 text-sm leading-6 text-agency-muted">
                Your personal TravelAI account is never converted into an agency
                account, even when the email address is the same.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 py-4">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-agency-accent" />
            <div>
              <p className="text-sm font-semibold text-agency-ink">
                Already invited?
              </p>
              <p className="mt-0.5 text-sm leading-6 text-agency-muted">
                Open the invitation link your workspace owner sent you to choose
                your agency password.
              </p>
            </div>
          </div>
        </div>

        <Button
          asChild
          className="mt-7 h-11 rounded-lg bg-agency-accent px-6 text-white hover:bg-agency-accent/90"
        >
          <Link to="/agency">Back to workspace</Link>
        </Button>
      </div>
    </div>
  );
};

export default AgencyOnboarding;
