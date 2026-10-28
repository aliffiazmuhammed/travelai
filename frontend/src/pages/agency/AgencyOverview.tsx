import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  Inbox,
  LayoutTemplate,
  Loader2,
  Map,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAgency } from '@/context/AgencyContext';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { AgencyEnquirySummaryView } from '@/types/agency';

const toolCards = [
  {
    icon: FileText,
    title: 'Branded exports',
    milestone: 'A5 live',
    to: '/agency/trips',
    description:
      'PDF brochures with real trip data, signed downloads and an export history for every trip.',
  },
  {
    icon: LayoutTemplate,
    title: 'Templates',
    milestone: 'A6 live',
    to: '/agency/templates',
    description:
      'Custom proposal layouts with immutable versions, real-trip previews and one default per audience.',
  },
  {
    icon: Sparkles,
    title: 'Client portal',
    milestone: 'A7 next',
    to: null,
    description:
      'Clients review proposals, accept quotes and download approved documents in one place.',
  },
];

const AgencyOverview: React.FC = () => {
  const { loading, agencies, activeAgency, canManage } = useAgency();
  const [enquirySummary, setEnquirySummary] =
    useState<AgencyEnquirySummaryView | null>(null);

  // D6: a small live funnel on the dashboard. The inbox remains the full view;
  // this is only a nudge, so a failed fetch leaves the cards empty rather than
  // blocking the workspace.
  useEffect(() => {
    if (!activeAgency?._id) {
      setEnquirySummary(null);
      return;
    }
    let cancelled = false;
    void api
      .getAgencyEnquirySummary()
      .then((result) => {
        if (!cancelled) setEnquirySummary(result.summary);
      })
      .catch(() => {
        /* counters only */
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgency?._id]);

  if (loading && agencies.length === 0) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your workspace...
      </div>
    );
  }

  if (!activeAgency) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="space-y-2 p-8 text-center">
          <h1 className="text-lg font-semibold">Workspace unavailable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            We could not load this agency workspace. Refresh the page, or sign in
            again at the workspace login link.
          </p>
          <Button asChild className="mt-2">
            <Link to="/agency/login">Go to agency sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const accent = activeAgency.branding.accentColor || '#0f766e';
  const teamReady = activeAgency.memberCount > 1;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-[11px]', agencyRoleBadgeClass(activeAgency.role))}
              >
                {agencyRoleLabel(activeAgency.role)}
              </Badge>
              <Badge
                variant="outline"
                className="border-teal-200 bg-teal-50 text-[11px] text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
              >
                Agency workspace A9
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {activeAgency.name}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                This is your agency's private workspace. Your personal trips stay
                separate, clients live in a directory only your team can see, and
                quote prices are always computed server-side.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/agency/team">
                  <Users className="mr-2 h-4 w-4" />
                  {teamReady ? 'Manage team' : 'Invite your team'}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/agency/trips">
                  <Map className="mr-2 h-4 w-4" />
                  Agency trips
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/agency/clients">
                  <BriefcaseBusiness className="mr-2 h-4 w-4" />
                  Clients
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/agency/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {canManage ? 'Agency settings' : 'View agency profile'}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Team
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {activeAgency.memberCount}
              </div>
              <div className="text-xs text-slate-500">
                {activeAgency.memberCount === 1
                  ? 'Just you so far'
                  : 'People with agency access'}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Workspace separation
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300">
                <BadgeCheck className="h-4 w-4" />
                Personal stays personal
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Agency staff trips carry a tenant id and never appear on the
                personal dashboard; invited clients see only their own trip.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                <Inbox className="h-4 w-4" />
              </span>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                D6 live
              </Badge>
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {enquirySummary ? enquirySummary.byStatus.new : '—'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                New leads waiting for a first reply
                {enquirySummary
                  ? ` · ${enquirySummary.open} open in total`
                  : ''}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/agency/enquiries">
                Open inbox <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="space-y-2 p-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <div className="text-2xl font-semibold">
                {enquirySummary ? enquirySummary.repliedThisWeek : '—'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Replied in the last 7 days
                {enquirySummary
                  ? ` · ${enquirySummary.receivedThisWeek} received`
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="space-y-2 p-5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
              <Trophy className="h-4 w-4" />
            </span>
            <div>
              <div className="text-2xl font-semibold">
                {enquirySummary
                  ? `${Math.round(enquirySummary.conversionRate * 1000) / 10}%`
                  : '—'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Won ÷ all leads
                {enquirySummary
                  ? ` · ${enquirySummary.byStatus.won} won`
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Set up checklist</CardTitle>
            <CardDescription>
              Milestone 9 adds your public directory profile, package cards and the
              lead inbox: publish once, then answer and convert enquiries here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChecklistRow
              done
              title="Create your agency workspace"
              detail="Your agency is isolated from personal trips and other agencies."
            />
            <ChecklistRow
              done={teamReady}
              title="Invite your team"
              detail={
                teamReady
                  ? `${activeAgency.memberCount} people have access.`
                  : 'Add an admin, planner or viewer with a single-use invite.'
              }
              action={
                !teamReady ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/team">
                      Invite team <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                ) : null
              }
            />
            <ChecklistRow
              title="Create your first agency trip"
              detail="Use the same planner, chat, map, expenses and versions you know, with agency-wide visibility."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/agency/trips">
                    Open trips <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            <ChecklistRow
              title="Save a client and prepare a quote"
              detail="Keep contact details private to the agency, then price the trip with line items, markup, tax and validity."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/agency/clients">
                    Manage clients <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            <ChecklistRow
              title="Upload your proposal template"
              detail="Start from an HTML layout, map your brand assets, preview it on a real trip and activate the version."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/agency/templates">
                    Manage templates <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card className="border-dashed bg-slate-50/60 dark:bg-slate-900/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-teal-600" />
              What's live now
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>One agency can own multiple staff members with ranked roles.</p>
            <p>Every agency trip is isolated from personal trips and other agencies.</p>
            <p>A private client directory keeps contact details inside the agency.</p>
            <p>Quotes are versioned, priced server-side and locked once sent.</p>
            <p>Branded PDF exports pin the template, version and quote they used.</p>
            <p>Custom templates need a real-trip preview before activation.</p>
            <p>Planners edit; owners and admins manage sharing and the trash.</p>
            <p>Clients stay trip-scoped and never become agency members.</p>
            <p>A public directory page turns profile and package views into consented leads.</p>
            <p>The lead inbox is in-app: claim, reply, quote, then convert to a client.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolCards.map((card) => (
          <Card key={card.title} className="border-slate-200 dark:border-slate-800">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <card.icon className="h-4 w-4" />
                </span>
                <Badge variant="outline" className="text-[10px] text-slate-500">
                  {card.milestone}
                </Badge>
              </div>
              <div>
                <h3 className="text-sm font-semibold">{card.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {card.description}
                </p>
              </div>
              {card.to ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={card.to}>
                    Open <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
};

const ChecklistRow: React.FC<{
  done?: boolean;
  title: string;
  detail: string;
  badge?: string;
  action?: React.ReactNode;
}> = ({ done, title, detail, badge, action }) => (
  <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
    <span
      className={cn(
        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px]',
        done
          ? 'border-teal-600 bg-teal-600 text-white'
          : 'border-slate-300 text-slate-400 dark:border-slate-700'
      )}
    >
      {done ? '✓' : ''}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">{title}</div>
        {badge ? (
          <Badge variant="outline" className="text-[9px] text-slate-400">
            {badge}
          </Badge>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
    {action}
  </div>
);

export default AgencyOverview;
