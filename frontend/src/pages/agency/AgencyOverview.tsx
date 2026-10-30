import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Inbox,
  Loader2,
  Map,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AgencyEmptyState } from '@/components/agency/AgencyEmptyState';
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { AgencyStatTile } from '@/components/agency/AgencyStatTile';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { Trip } from '@/types';
import type { AgencyEnquirySummaryView, AgencyEvent } from '@/types/agency';

const todayIso = () => new Date().toISOString().slice(0, 10);

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const TRIP_STATUS_LABELS: Record<NonNullable<Trip['status']>, string> = {
  draft: 'Draft',
  planned: 'Planned',
  ongoing: 'On the road',
  completed: 'Finished',
};

function tripRange(trip: Trip): string {
  const start = trip.startDate ? formatDate(trip.startDate) : null;
  const end = trip.endDate ? formatDate(trip.endDate) : null;
  if (start && end) return `${start} → ${end}`;
  if (start) return `From ${start}`;
  return 'No dates yet';
}

/** A row skeleton that keeps the panel's height steady while data arrives. */
const RowSkeleton: React.FC = () => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
    <Skeleton className="h-9 w-9 rounded-lg" />
    <div className="flex-1 space-y-1.5">
      <Skeleton className="h-3.5 w-1/2" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  </div>
);

/**
 * The agency home. It answers one question — what needs a person today — and
 * stays out of the way otherwise. Milestone notes and feature tours belong in
 * release notes, not on a workspace someone opens every morning.
 */
const AgencyOverview: React.FC = () => {
  const { loading, agencies, activeAgency, activeAgencyId, canManage, eventNeedsAttention } =
    useAgency();
  const { user } = useAgencyAuth();

  const [summary, setSummary] = useState<AgencyEnquirySummaryView | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [events, setEvents] = useState<AgencyEvent[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // One quiet read of the three lists the page summarises. A failed call leaves
  // its panel empty rather than blocking the workspace: the full pages still
  // work, and this is only a morning glance.
  useEffect(() => {
    if (!activeAgencyId) {
      setSummary(null);
      setTrips([]);
      setEvents([]);
      setDataLoading(false);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    void Promise.allSettled([
      api.getAgencyEnquirySummary(),
      api.getAgencyTrips(activeAgencyId),
      api.listAgencyEvents(activeAgencyId),
    ]).then(([enquiryResult, tripResult, eventResult]) => {
      if (cancelled) return;
      if (enquiryResult.status === 'fulfilled') setSummary(enquiryResult.value.summary);
      if (tripResult.status === 'fulfilled') setTrips(tripResult.value.trips ?? []);
      if (eventResult.status === 'fulfilled') setEvents(eventResult.value.events ?? []);
      setDataLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId]);

  const today = todayIso();

  const upcomingTrips = useMemo(
    () =>
      trips
        .filter((trip) => trip.startDate && trip.startDate.slice(0, 10) >= today)
        .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
        .slice(0, 3),
    [trips, today]
  );

  const liveEvents = useMemo(
    () =>
      events
        .filter((event) => event.state === 'published' && !event.closedAt && !event.hidden)
        .filter((event) => (event.endDate ?? event.startDate) >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 3),
    [events, today]
  );

  if (loading && agencies.length === 0) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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

  const newLeads = summary?.byStatus.new ?? 0;
  const openLeads = summary?.open ?? 0;
  const leadsWaiting = summary?.needsAttention ?? 0;
  const firstName = user?.name?.trim().split(' ')[0] ?? null;
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const teamReady = activeAgency.memberCount > 1;
  const setupIncomplete = !teamReady || trips.length === 0 || events.length === 0;
  const primaryAction =
    leadsWaiting > 0
      ? {
          to: '/agency/enquiries',
          label: `Answer ${countLabel(leadsWaiting, 'enquiry', 'enquiries')}`,
        }
      : { to: '/agency/trips', label: 'Plan a trip' };

  return (
    <div className="space-y-8">
      <AgencyPageHeader
        title={`${greetingFor(new Date())}${firstName ? `, ${firstName}` : ''}`}
        description={`Here is what ${activeAgency.name} needs today — ${todayLabel}.`}
        actions={
          <>
            <Button asChild>
              <Link to={primaryAction.to}>
                {primaryAction.label}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/agency/events">
                <CalendarPlus className="mr-2 h-4 w-4" aria-hidden />
                New event
              </Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="needs-you" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="needs-you" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Needs you today
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AgencyStatTile
            icon={Inbox}
            tone="teal"
            to="/agency/enquiries"
            value={summary ? leadsWaiting : undefined}
            label={
              leadsWaiting === 1
                ? 'enquiry needs a reply'
                : 'enquiries need a reply'
            }
            hint={
              summary
                ? leadsWaiting === 0
                  ? 'Inbox is clear — new leads will land here.'
                  : `${newLeads} new · ${openLeads} open in total`
                : 'Counting your inbox…'
            }
          />
          <AgencyStatTile
            icon={CalendarDays}
            tone="sky"
            to="/agency/events"
            value={eventNeedsAttention}
            label={
              eventNeedsAttention === 1
                ? 'traveller waiting on a spot'
                : 'travellers waiting on a spot'
            }
            hint={
              eventNeedsAttention === 0
                ? 'No one is waiting on a decision.'
                : 'Confirm or decline them from the event roster.'
            }
          />
          <AgencyStatTile
            icon={Map}
            tone="violet"
            to="/agency/trips"
            value={upcomingTrips.length}
            label={upcomingTrips.length === 1 ? 'trip coming up' : 'trips coming up'}
            hint={
              upcomingTrips[0]?.startDate
                ? `Next: ${formatDate(upcomingTrips[0].startDate)}`
                : 'No dates on the calendar yet.'
            }
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 dark:border-slate-800 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Coming up</CardTitle>
              <CardDescription>The next trips on your calendar.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/agency/trips">
                All trips
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {dataLoading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
              </>
            ) : upcomingTrips.length === 0 ? (
              <AgencyEmptyState
                icon={Map}
                title="Nothing on the calendar"
                body="A trip shows up here once it has dates."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/trips">Plan a trip</Link>
                  </Button>
                }
              />
            ) : (
              upcomingTrips.map((trip) => (
                <Link
                  key={trip._id}
                  to={`/agency/trips/${trip._id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900/60"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                  >
                    <Map className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                      {trip.title?.trim() || 'Untitled trip'}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {tripRange(trip)}
                    </span>
                  </span>
                  {trip.status ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0 text-[10px]',
                        trip.status === 'ongoing'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'text-slate-500'
                      )}
                    >
                      {TRIP_STATUS_LABELS[trip.status]}
                    </Badge>
                  ) : null}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base">Live events</CardTitle>
            <CardDescription>Public pages taking interest.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dataLoading ? (
              <>
                <RowSkeleton />
                <RowSkeleton />
              </>
            ) : liveEvents.length === 0 ? (
              <AgencyEmptyState
                icon={Sparkles}
                title="No public events yet"
                body="Publish a camp or group trip and travellers can ask for a spot."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/events">Create an event</Link>
                  </Button>
                }
              />
            ) : (
              liveEvents.map((event) => (
                <Link
                  key={event.id}
                  to="/agency/events"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900/60"
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-50">
                      {event.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {event.dateLabel}
                    </span>
                  </span>
                  {event.interests.pending > 0 ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-teal-200 bg-teal-50 text-[10px] text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
                    >
                      {countLabel(event.interests.pending, 'waiting', 'waiting')}
                    </Badge>
                  ) : null}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && setupIncomplete ? (
        <Card className="border-dashed bg-slate-50/60 dark:bg-slate-900/40">
          <CardHeader>
            <CardTitle className="text-base">Finish setting up</CardTitle>
            <CardDescription>
              Three small things make the workspace feel like a team, not a login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SetupRow
              done={teamReady}
              title="Invite a teammate"
              detail={
                teamReady
                  ? `${activeAgency.memberCount} people share this workspace.`
                  : 'So enquiries do not sit until you are back at your desk.'
              }
              action={
                !teamReady ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/team">
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Invite
                    </Link>
                  </Button>
                ) : null
              }
            />
            <SetupRow
              done={trips.length > 0}
              title="Plan your first agency trip"
              detail={
                trips.length > 0
                  ? `${countLabel(trips.length, 'trip', 'trips')} in the library.`
                  : 'Itinerary, map, expenses and versions work exactly like your personal trips.'
              }
              action={
                trips.length === 0 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/trips">
                      <Map className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Plan
                    </Link>
                  </Button>
                ) : null
              }
            />
            <SetupRow
              done={events.length > 0}
              title="Publish an event"
              detail={
                events.length > 0
                  ? `${countLabel(events.length, 'event', 'events')} in the library.`
                  : 'A dated camp or group trip with its own public page and roster.'
              }
              action={
                events.length === 0 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/agency/events">
                      <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Create
                    </Link>
                  </Button>
                ) : null
              }
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

const SetupRow: React.FC<{
  done: boolean;
  title: string;
  detail: string;
  action?: React.ReactNode;
}> = ({ done, title, detail, action }) => (
  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
    <span
      className={cn(
        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
        done
          ? 'border-teal-600 bg-teal-600 text-white'
          : 'border-slate-300 text-slate-400 dark:border-slate-700'
      )}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : null}
      <span className="sr-only">{done ? 'Done' : 'Not done yet'}</span>
    </span>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-50">{title}</div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
    {action}
  </div>
);

export default AgencyOverview;
