import React, { useCallback, useEffect, useState } from 'react';
import {
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
import { Button } from '@/components/ui/button';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import {
  AdminSegmented,
  type AdminSegmentedOption,
} from '@/components/admin/AdminSegmented';
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

const targetTypeChip = (group: PlatformModerationGroup): string => {
  if (group.targetType === 'agency_profile') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }
  if (group.targetType === 'profile') {
    return 'border-sky-500/40 bg-sky-500/10 text-sky-200';
  }
  return 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200';
};

const targetTypeLabel = (group: PlatformModerationGroup): string => {
  if (group.targetType === 'agency_profile') return 'Agency';
  if (group.targetType === 'profile') return 'Profile';
  return 'Trip';
};

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

/** Public destination for a queued target, when it still exists. */
function publicHref(group: PlatformModerationGroup): string | null {
  if (group.targetType === 'trip' && group.trip) {
    return `/explore/${encodeURIComponent(group.targetId)}`;
  }
  if (group.targetType === 'profile' && group.profile?.handle) {
    return `/travelers/${encodeURIComponent(group.profile.handle)}`;
  }
  if (group.targetType === 'agency_profile' && group.agency?.slug) {
    return `/agencies/${encodeURIComponent(group.agency.slug)}`;
  }
  return null;
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

  const segmented: Array<AdminSegmentedOption<PlatformModerationStatus>> = TABS.map((tab) => ({
    ...tab,
    count: totals[tab.value],
  }));

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={
          <>
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-indigo-300"
            >
              <Flag className="h-4 w-4" />
            </span>
            Reported content
          </>
        }
        description="Only content a traveller has reported appears here. Three distinct open reports hide a trip automatically while it waits for review; profiles and agency pages are always reviewed manually."
        actions={
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSegmented
          ariaLabel="Report status"
          value={status}
          options={segmented}
          onChange={(value) => setStatus(value)}
        />
        <p className="text-xs text-muted-foreground">
          {groups.length === 0
            ? 'Nothing in this tab'
            : `${groups.length} target${groups.length === 1 ? '' : 's'} in this tab`}
        </p>
      </div>

      {error ? (
        <AdminNotice tone="error" title="Could not load the report queue">
          {error}
        </AdminNotice>
      ) : null}

      {loading && groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <AdminLoadingPanel label="Loading reports…" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <AdminEmptyState
            icon={CheckCircle2}
            title={status === 'open' ? 'Nothing is waiting for review.' : 'Nothing in this tab.'}
            description="Reported trips, profiles and agency pages appear here as soon as a traveller flags them."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const key = `${group.targetType}:${group.targetId}`;
            const canHide = group.targetType === 'trip' && !group.hidden;
            const href = publicHref(group);

            return (
              <article key={key} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 p-4 sm:p-5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          targetTypeChip(group)
                        )}
                      >
                        {targetTypeLabel(group)}
                      </span>
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {targetHeading(group)}
                      </h2>
                      {group.hidden ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                          <ShieldOff className="h-3 w-3" aria-hidden />
                          {group.targetType === 'agency_profile'
                            ? 'Hidden'
                            : group.trip?.hiddenSource === 'admin'
                              ? 'De-listed'
                              : 'Auto-hidden'}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {targetSubheading(group)}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                      {group.targetId}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {href ? (
                      <Button
                        asChild
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                      >
                        <a href={href} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Public page
                        </a>
                      </Button>
                    ) : null}

                    {status === 'open' && canHide ? (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-full bg-rose-600 text-white hover:bg-rose-500"
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
                        className="rounded-full"
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
                        className="rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={() => openAction(group, 'restore')}
                      >
                        <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5">
                  {group.reasons.map((entry) => (
                    <span
                      key={entry.reason}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-foreground"
                    >
                      {reasonLabel(entry.reason)}
                      <span className="text-muted-foreground">×{entry.count}</span>
                    </span>
                  ))}
                  <span className="text-[11px] text-muted-foreground">
                    {group.reportCount} report{group.reportCount === 1 ? '' : 's'} · last{' '}
                    {formatAdminDate(group.lastReportedAt)}
                  </span>
                </div>

                <div className="space-y-1.5 border-t border-border/70 bg-muted/20 p-3 sm:p-4">
                  {group.reports.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Reports were closed before this view was built.
                    </p>
                  ) : (
                    group.reports.map((report) => (
                      <div
                        key={report._id}
                        className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-1.5 text-xs last:border-0 last:pb-0"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-muted-foreground">
                            <span className="font-semibold text-foreground">
                              {reasonLabel(report.reason)}
                            </span>
                            <span className="px-1 text-muted-foreground/60">·</span>
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="h-3 w-3" aria-hidden />
                              {report.reporter?.label ?? 'Unknown reporter'}
                              {report.reporter?.handle ? (
                                <span className="text-muted-foreground/70">
                                  @{report.reporter.handle}
                                </span>
                              ) : null}
                            </span>
                          </p>
                          {report.note ? (
                            <p className="max-w-[640px] text-[11px] leading-relaxed text-muted-foreground">
                              “{report.note}”
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground/80">
                          {formatAdminDate(report.createdAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </article>
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
        {/* Portalled content leaves the console tree, so it carries the dark scope. */}
        <AlertDialogContent className="dark rounded-2xl border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionTarget?.action === 'hide'
                ? 'De-list this trip?'
                : actionTarget?.action === 'restore'
                  ? 'Restore this listing?'
                  : 'Dismiss these reports?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
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
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
              {targetHeading(actionTarget.group)}
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {actionTarget.group.targetType} · {actionTarget.group.targetId}
              </span>
            </p>
          ) : null}

          {actionError ? <p className="text-xs text-rose-300">{actionError}</p> : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy} className="rounded-full">
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
                'rounded-full',
                actionTarget?.action === 'hide'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : actionTarget?.action === 'restore'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-indigo-500 text-white hover:bg-indigo-400'
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
