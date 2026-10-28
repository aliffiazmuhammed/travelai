import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Flag,
  Loader2,
  RefreshCw,
  ShieldOff,
  Undo2,
  UserRound,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import type {
  PlatformModerationGroup,
  PlatformModerationList,
  PlatformModerationStatus,
} from '@/types';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin/reports` (Milestone 8 G6).
 *
 * A deliberately small triage queue: only content with at least one report
 * appears here, and each card is a target summary (title, publisher, reasons)
 * rather than a trip browser — no itinerary body, budget or member list is ever
 * loaded. Two decisions resolve a stack:
 *
 * - **De-list** hides the trip from every public surface and closes the reports.
 * - **Dismiss** closes the reports and restores an auto-hidden listing.
 *
 * Profiles are queue-only. Hiding a profile would silently take down every trip
 * its owner has published, so that remains a separate account action.
 */

const TABS: Array<{ value: PlatformModerationStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'hidden', label: 'De-listed' },
  { value: 'dismissed', label: 'Dismissed' },
];

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  scam: 'Scam',
  privacy: 'Privacy',
  other: 'Other',
};

const reasonLabel = (reason: string): string => REASON_LABELS[reason] ?? reason;

function targetHeading(group: PlatformModerationGroup): string {
  if (group.targetType === 'trip') {
    return group.trip?.title ?? 'Deleted trip';
  }
  if (group.targetType === 'agency_profile') {
    return group.agency?.name ?? 'Deleted agency';
  }
  return group.profile?.handle ? `@${group.profile.handle}` : group.profile?.name ?? 'Deleted profile';
}

function targetSubheading(group: PlatformModerationGroup): string {
  if (group.targetType === 'trip') {
    const trip = group.trip;
    if (!trip) return 'The trip no longer exists. Reports are kept for the audit trail.';
    const publisher = trip.publisherHandle ? `@${trip.publisherHandle}` : trip.publisherName;
    return [trip.destination, publisher, trip.visibility].filter(Boolean).join(' · ');
  }
  if (group.targetType === 'agency_profile') {
    const agency = group.agency;
    if (!agency) return 'The agency no longer exists.';
    return [agency.slug, agency.city, agency.status, `profile ${agency.profileState}`]
      .filter(Boolean)
      .join(' · ');
  }
  const profile = group.profile;
  if (!profile) return 'The profile no longer exists.';
  return [profile.name, profile.email, profile.status].filter(Boolean).join(' · ');
}

const AdminReports: React.FC = () => {
  const [status, setStatus] = useState<PlatformModerationStatus>('open');
  const [data, setData] = useState<PlatformModerationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [actionTarget, setActionTarget] = useState<{
    group: PlatformModerationGroup;
    action: 'hide' | 'dismiss' | 'restore';
  } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .listModerationQueue(status, 50)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the report queue.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, reloadKey]);

  const groups = data?.groups ?? [];
  const totals = data?.totals ?? { open: 0, hidden: 0, dismissed: 0 };

  const openAction = (
    group: PlatformModerationGroup,
    action: 'hide' | 'dismiss' | 'restore'
  ) => {
    setActionError(null);
    setActionTarget({ group, action });
  };

  const runAction = async () => {
    if (!actionTarget) return;
    const { group, action } = actionTarget;

    try {
      setActionBusy(true);
      setActionError(null);
      if (action === 'hide') {
        await api.hideReportedContent(group.targetType, group.targetId);
      } else {
        // Restore and dismiss share the same server decision: close the reports
        // and clear the moderation marker. Only the intent differs.
        await api.dismissReportedContent(group.targetType, group.targetId);
      }
      setActionTarget(null);
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'That moderation action could not be applied.'
      );
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Flag className="h-5 w-5 text-indigo-400" />
            Reported content
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Only content a traveller has reported appears here. Three distinct open
            reports hide a trip automatically while it waits for review; profiles and
            agency pages are always reviewed manually.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
          onClick={reload}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        {TABS.map((tab) => {
          const count =
            tab.value === 'open'
              ? totals.open
              : tab.value === 'hidden'
                ? totals.hidden
                : totals.dismissed;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                status === tab.value
                  ? 'bg-indigo-500/20 text-indigo-200'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              )}
            >
              {tab.label}
              <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {loading && groups.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reports…
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="flex flex-col items-center gap-1.5 py-14 text-center text-sm text-slate-400">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="font-medium text-slate-300">
              {status === 'open' ? 'Nothing is waiting for review.' : 'Nothing in this tab.'}
            </p>
            <p className="text-xs text-slate-500">
              Reported trips, profiles and agency pages appear here as soon as a
              traveller flags them.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${group.targetType}:${group.targetId}`;
            const isProfile = group.targetType === 'profile';
            const isAgency = group.targetType === 'agency_profile';
            const canHide = group.targetType === 'trip' && !group.hidden;

            return (
              <Card key={key} className="border-slate-800 bg-slate-900/60">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide',
                            isAgency
                              ? 'border-amber-800 bg-amber-950/40 text-amber-300'
                              : isProfile
                                ? 'border-sky-800 bg-sky-950/40 text-sky-300'
                                : 'border-indigo-800 bg-indigo-950/40 text-indigo-300'
                          )}
                        >
                          {isAgency ? 'Agency' : isProfile ? 'Profile' : 'Trip'}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-100">
                          {targetHeading(group)}
                        </span>
                        {group.hidden ? (
                          <Badge
                            variant="outline"
                            className="border-rose-900 bg-rose-950/40 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-rose-300"
                          >
                            <ShieldOff className="mr-1 h-3 w-3" />
                            {isAgency
                              ? 'Hidden'
                              : group.trip?.hiddenSource === 'admin'
                                ? 'De-listed'
                                : 'Auto-hidden'}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-slate-400">{targetSubheading(group)}</p>
                      <p className="font-mono text-[10px] text-slate-600">{group.targetId}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isProfile && group.trip ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                        >
                          <a
                            href={`/explore/${encodeURIComponent(group.targetId)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Public page
                          </a>
                        </Button>
                      ) : null}
                      {isProfile && group.profile?.handle ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                        >
                          <a
                            href={`/travelers/${encodeURIComponent(group.profile.handle)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Public page
                          </a>
                        </Button>
                      ) : null}
                      {isAgency && group.agency?.slug ? (
                        <Button
                          asChild
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                        >
                          <a
                            href={`/agencies/${encodeURIComponent(group.agency.slug)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Public page
                          </a>
                        </Button>
                      ) : null}

                      {status === 'open' && canHide ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-rose-600 text-white hover:bg-rose-500"
                          onClick={() => openAction(group, 'hide')}
                        >
                          <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                          De-list
                        </Button>
                      ) : null}

                      {status === 'open' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                          onClick={() => openAction(group, 'dismiss')}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      ) : null}

                      {status === 'hidden' && group.targetType === 'trip' && group.hidden ? (
                        <Button
                          type="button"
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                          onClick={() => openAction(group, 'restore')}
                        >
                          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {group.reasons.map((entry) => (
                      <span
                        key={entry.reason}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-300"
                      >
                        {reasonLabel(entry.reason)}
                        <span className="text-slate-500">×{entry.count}</span>
                      </span>
                    ))}
                    <span className="text-[11px] text-slate-500">
                      {group.reportCount} report{group.reportCount === 1 ? '' : 's'} · last{' '}
                      {formatAdminDate(group.lastReportedAt)}
                    </span>
                  </div>

                  <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                    {group.reports.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        Reports were closed before this view was built.
                      </p>
                    ) : (
                      group.reports.map((report) => (
                        <div
                          key={report._id}
                          className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/70 pb-1.5 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs text-slate-300">
                              <span className="font-semibold text-slate-200">
                                {reasonLabel(report.reason)}
                              </span>
                              <span className="text-slate-500"> · </span>
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <UserRound className="h-3 w-3" />
                                {report.reporter?.label ?? 'Unknown reporter'}
                                {report.reporter?.handle ? (
                                  <span className="text-slate-500">
                                    @{report.reporter.handle}
                                  </span>
                                ) : null}
                              </span>
                            </p>
                            {report.note ? (
                              <p className="max-w-[640px] text-[11px] leading-relaxed text-slate-400">
                                “{report.note}”
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 text-[10px] text-slate-500">
                            {formatAdminDate(report.createdAt)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={actionTarget !== null}
        onOpenChange={(next) => {
          if (!next && !actionBusy) {
            setActionTarget(null);
            setActionError(null);
          }
        }}
      >
        <AlertDialogContent className="border-slate-800 bg-slate-900 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.action === 'hide'
                ? 'De-list this trip?'
                : actionTarget?.action === 'restore'
                  ? 'Restore this listing?'
                  : 'Dismiss these reports?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {actionTarget?.action === 'hide' ? (
                <>
                  The trip leaves the gallery, the traveler page, cloning and join
                  requests immediately, and every open report is closed as hidden.
                  The owner keeps their data and is told the listing was reviewed.
                </>
              ) : actionTarget?.action === 'restore' ? (
                <>
                  The reports stay closed as dismissed, the moderation marker is
                  cleared, and the trip returns to the gallery with its original
                  publication settings. The owner's data and members are untouched.
                </>
              ) : actionTarget?.group.targetType === 'profile' ? (
                <>
                  The reports are closed as dismissed. The profile stays public —
                  disable the account from Accounts if the content itself breaks the
                  guidelines.
                </>
              ) : actionTarget?.group.targetType === 'agency_profile' ? (
                <>
                  The reports are closed as dismissed. The agency page stays public;
                  agency profiles are never hidden automatically. Hide the
                  directory profile from the agency record if it breaks the
                  guidelines.
                </>
              ) : (
                <>
                  The reports are closed as dismissed. If the trip was hidden
                  automatically it returns to the gallery with its original
                  publication settings.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {actionTarget ? (
            <p className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              {targetHeading(actionTarget.group)}
              <span className="block font-mono text-[10px] text-slate-600">
                {actionTarget.group.targetType} · {actionTarget.group.targetId}
              </span>
            </p>
          ) : null}

          {actionError ? (
            <p className="text-xs text-rose-300">{actionError}</p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={actionBusy}
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={actionBusy}
              onClick={(event) => {
                // Keep the dialog mounted while the request runs so an error can
                // be shown in place instead of behind a closed overlay.
                event.preventDefault();
                void runAction();
              }}
              className={cn(
                actionTarget?.action === 'hide'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : actionTarget?.action === 'restore'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
              )}
            >
              {actionBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {actionTarget?.action === 'hide'
                ? 'De-list trip'
                : actionTarget?.action === 'restore'
                  ? 'Restore listing'
                  : 'Dismiss reports'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminReports;
