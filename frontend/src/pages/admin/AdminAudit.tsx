import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminTableFrame,
  adminTableHeadClass,
  adminTableRowClass,
} from '@/components/admin/AdminTableFrame';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { api } from '@/services/api';
import type { PlatformAuditList, PlatformAuditRow } from '@/types';
import { cn } from '@/lib/utils';
import { formatAdminDate } from './accountMeta';
import { auditActionLabel, auditTargetLabel, humaniseLabel } from './adminLabels';

/**
 * `/admin/audit` (PA4).
 *
 * Platform action history only. These rows are written by the platform realm
 * and by PA4 tenant mutations; they never contain credentials, tokens, headers
 * or tenant content. Tenant-internal audit stays in the tenant's own viewer.
 *
 * Every filter lives in the URL, so an operator can send a colleague the exact
 * view they are looking at. Free text and both id fields are debounced: typing a
 * partial id produces one request, not one per keystroke.
 */

const PAGE_SIZE = 50;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

const idError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length !== 24) return 'Use the full 24-character id.';
  if (!OBJECT_ID.test(trimmed)) return 'Use hexadecimal characters only.';
  return null;
};

const AdminAudit: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(1, Number(searchParams.get('page')) || 1);

  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() =>
    (searchParams.get('q') ?? '').trim()
  );
  const [action, setAction] = useState(() => searchParams.get('action') ?? '');
  const [targetType, setTargetType] = useState(
    () => searchParams.get('targetType') ?? ''
  );
  const [targetId, setTargetId] = useState(() => searchParams.get('targetId') ?? '');
  const [actorId, setActorId] = useState(() => searchParams.get('actorId') ?? '');
  const [from, setFrom] = useState(() => searchParams.get('from') ?? '');
  const [to, setTo] = useState(() => searchParams.get('to') ?? '');
  const [page, setPage] = useState(initialPage);
  const [reloadKey, setReloadKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(() =>
    Boolean(
      searchParams.get('targetId') ||
        searchParams.get('actorId') ||
        searchParams.get('from') ||
        searchParams.get('to')
    )
  );

  const [data, setData] = useState<PlatformAuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlatformAuditRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // One debounce covers the free text and both id fields: a pasted id should
  // not fire a request per character, nor turn into a 400 mid-paste.
  const [debouncedIds, setDebouncedIds] = useState({
    targetId: targetId.trim(),
    actorId: actorId.trim(),
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setDebouncedIds({ targetId: targetId.trim(), actorId: actorId.trim() });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, targetId, actorId]);

  // Keep the URL in step with the visible filters. `replace` keeps the history
  // useful: Back should leave the page, not undo keystrokes.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    if (action) next.set('action', action);
    if (targetType) next.set('targetType', targetType);
    if (targetId.trim()) next.set('targetId', targetId.trim());
    if (actorId.trim()) next.set('actorId', actorId.trim());
    if (from) next.set('from', from);
    if (to) next.set('to', to);
    if (page > 1) next.set('page', String(page));
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [
    search,
    action,
    targetType,
    targetId,
    actorId,
    from,
    to,
    page,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const targetIdValue = OBJECT_ID.test(debouncedIds.targetId)
      ? debouncedIds.targetId
      : undefined;
    const actorIdValue = OBJECT_ID.test(debouncedIds.actorId)
      ? debouncedIds.actorId
      : undefined;

    api
      .listAdminAudit({
        q: debouncedSearch,
        action,
        targetType,
        targetId: targetIdValue,
        actorId: actorIdValue,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the audit trail.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, debouncedIds, action, targetType, from, to, page, reloadKey]);

  const entries = data?.entries ?? [];
  const targetIdMessage = idError(targetId);
  const actorIdMessage = idError(actorId);

  const copyDetail = async (entry: PlatformAuditRow) => {
    const lines = [
      `When: ${formatAdminDate(entry.createdAt)}`,
      `Action: ${auditActionLabel(entry.action)} (${entry.action})`,
      `Target: ${auditTargetLabel(entry.targetType)}${entry.targetId ? ` · ${entry.targetId}` : ''}`,
      `Actor: ${entry.actorEmail ?? 'system'}${entry.actorId ? ` · ${entry.actorId}` : ''}`,
      `IP: ${entry.ip ?? '—'}`,
      ...Object.entries(entry.metadata ?? {}).map(
        ([key, value]) => `${humaniseLabel(key)}: ${formatMetadataValue(value)}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(entry._id);
      toast.success('Audit entry copied.');
      window.setTimeout(
        () => setCopiedId((current) => (current === entry._id ? null : current)),
        2000
      );
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.');
    }
  };

  const columns: DataTableColumn<PlatformAuditRow>[] = [
    {
      id: 'when',
      header: 'When',
      headClassName: adminTableHeadClass,
      cellClassName: 'whitespace-nowrap px-4 py-3 text-xs text-muted-foreground',
      cell: (entry) => formatAdminDate(entry.createdAt),
    },
    {
      id: 'action',
      header: 'Action',
      mobile: 'primary',
      headClassName: adminTableHeadClass,
      cellClassName: 'px-4 py-3',
      cell: (entry) => (
        <span className="text-xs font-medium text-admin-accent-ink">
          {auditActionLabel(entry.action)}
        </span>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      headClassName: adminTableHeadClass,
      cellClassName: 'px-4 py-3 text-xs',
      cell: (entry) => entry.actorEmail ?? 'System',
    },
    {
      id: 'target',
      header: 'Target',
      mobileSpan: 2,
      headClassName: adminTableHeadClass,
      cellClassName: 'px-4 py-3 text-xs',
      cell: (entry) => {
        const href = entry.targetId
          ? targetHref(entry.targetType, entry.targetId)
          : null;
        return (
          <>
            <Badge variant="outline" className="text-overline text-muted-foreground">
              {auditTargetLabel(entry.targetType)}
            </Badge>
            {entry.targetId ? (
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                {href ? (
                  <Link
                    to={href}
                    className="text-admin-accent-ink underline-offset-2 hover:text-admin-accent-ink hover:underline"
                  >
                    {entry.targetId}
                  </Link>
                ) : (
                  entry.targetId
                )}
              </p>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'context',
      header: 'Context',
      mobileSpan: 2,
      headClassName: adminTableHeadClass,
      cellClassName: 'max-w-[320px] px-4 py-3 text-xs text-muted-foreground',
      cell: (entry) => summarizeMetadata(entry.metadata) || '—',
    },
    {
      id: 'ip',
      header: 'IP',
      headClassName: adminTableHeadClass,
      cellClassName:
        'whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground',
      cell: (entry) => entry.ip ?? '—',
    },
    {
      id: 'details',
      header: <span className="sr-only">Details</span>,
      mobile: 'action',
      headClassName: `w-12 px-2 ${adminTableHeadClass}`,
      cellClassName: 'px-2 py-3 text-right',
      cell: (entry) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => setDetail(entry)}
          aria-label={`Open details for ${auditActionLabel(entry.action)}`}
        >
          <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden />
        </Button>
      ),
    },
  ];
  const actions = data?.facets.actions ?? [];
  const targetTypes = data?.facets.targetTypes ?? [];

  const moreFilterCount = useMemo(
    () => [actorId, targetId, from, to].filter((value) => value.trim() !== '').length,
    [actorId, targetId, from, to]
  );
  const anyFilter =
    search !== '' || action !== '' || targetType !== '' || moreFilterCount > 0;

  const resetFilters = () => {
    setSearch('');
    setAction('');
    setTargetType('');
    setTargetId('');
    setActorId('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Audit"
        description="Platform operations across accounts, agencies and tenant lifecycle. No tenant content or credential is ever stored here."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-full px-3 text-xs"
              onClick={resetFilters}
              disabled={!anyFilter}
            >
              Clear filters
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Refresh
            </Button>
          </>
        }
      />

      <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search action, target or id"
              aria-label="Search audit"
              className="h-9 rounded-full pl-9 text-sm"
            />
          </div>

          <Select
            value={action || 'all'}
            onValueChange={(value) => {
              setAction(value === 'all' ? '' : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-full lg:w-56" aria-label="Filter by action">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((value) => (
                <SelectItem key={value} value={value}>
                  {auditActionLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={targetType || 'all'}
            onValueChange={(value) => {
              setTargetType(value === 'all' ? '' : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-full lg:w-44" aria-label="Filter by target">
              <SelectValue placeholder="All targets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {targetTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {auditTargetLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-controls="audit-more-filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            More filters
            {moreFilterCount > 0 ? (
              <span className="rounded-full bg-admin-accent/15 px-1.5 text-xs font-semibold text-admin-accent-ink">
                {moreFilterCount}
              </span>
            ) : null}
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', moreOpen && 'rotate-180')}
              aria-hidden
            />
          </Button>
        </div>

        {moreOpen ? (
          <div
            id="audit-more-filters"
            className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="audit-actor" className="text-xs text-muted-foreground">
                Actor account id
              </Label>
              <div className="relative">
                <Input
                  id="audit-actor"
                  value={actorId}
                  onChange={(event) => {
                    setActorId(event.target.value);
                    setPage(1);
                  }}
                  placeholder="24-character id"
                  aria-invalid={Boolean(actorIdMessage)}
                  aria-describedby={actorIdMessage ? 'audit-actor-error' : undefined}
                  className={cn(
                    'h-9 pr-8 font-mono text-xs',
                    actorIdMessage && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
                {actorId ? (
                  <button
                    type="button"
                    onClick={() => setActorId('')}
                    aria-label="Clear actor id"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              {actorIdMessage ? (
                <p id="audit-actor-error" className="text-xs text-destructive-ink">
                  {actorIdMessage}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-target" className="text-xs text-muted-foreground">
                Target id
              </Label>
              <div className="relative">
                <Input
                  id="audit-target"
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    setPage(1);
                  }}
                  placeholder="24-character id"
                  aria-invalid={Boolean(targetIdMessage)}
                  aria-describedby={targetIdMessage ? 'audit-target-error' : undefined}
                  className={cn(
                    'h-9 pr-8 font-mono text-xs',
                    targetIdMessage && 'border-destructive focus-visible:ring-destructive'
                  )}
                />
                {targetId ? (
                  <button
                    type="button"
                    onClick={() => setTargetId('')}
                    aria-label="Clear target id"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              {targetIdMessage ? (
                <p id="audit-target-error" className="text-xs text-destructive-ink">
                  {targetIdMessage}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="audit-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className="h-9"
              />
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <AdminNotice
          tone="error"
          title="The audit trail did not load"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          }
        >
          {error}
        </AdminNotice>
      ) : null}

      <AdminTableFrame
        title="Platform events"
        description={
          data && data.total > 0
            ? `${data.total} event${data.total === 1 ? '' : 's'} match these filters.`
            : 'Newest first.'
        }
        footer={
          <AdminPagination
            page={data?.page ?? page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total}
            noun="event"
            loading={loading}
            onChange={setPage}
          />
        }
      >
        <DataTable
          rows={entries}
          columns={columns}
          getRowKey={(entry) => entry._id}
          scrollLabel="Platform events table"
          mobileLabel="Platform events"
          minWidth="920px"
          rowClassName={adminTableRowClass}
          loading={loading}
          loadingContent={<AdminLoadingPanel label="Loading audit events…" />}
          emptyContent={
            error ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                The trail could not be loaded. Use Try again above.
              </p>
            ) : (
              <AdminEmptyState
                icon={ClipboardList}
                title="Nothing matches these filters"
                description="Widen the date range, clear an id, or search for part of an action name."
                action={
                  anyFilter ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={resetFilters}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </AdminTableFrame>

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader className="space-y-1.5">
                <SheetTitle>{auditActionLabel(detail.action)}</SheetTitle>
                <SheetDescription>
                  {formatAdminDate(detail.createdAt)} ·{' '}
                  {auditTargetLabel(detail.targetType)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Machine action</dt>
                  <dd className="break-all font-mono text-xs text-foreground">
                    {detail.action}
                  </dd>
                  <dt className="text-muted-foreground">Target type</dt>
                  <dd className="text-foreground">
                    {auditTargetLabel(detail.targetType)}
                  </dd>
                  <dt className="text-muted-foreground">Target id</dt>
                  <dd className="break-all font-mono text-xs text-foreground">
                    {detail.targetId ?? '—'}
                  </dd>
                  <dt className="text-muted-foreground">Actor</dt>
                  <dd className="break-all text-foreground">
                    {detail.actorEmail ?? 'System'}
                    {detail.actorId ? (
                      <span className="block font-mono text-xs text-muted-foreground">
                        {detail.actorId}
                      </span>
                    ) : null}
                  </dd>
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs text-foreground">
                    {detail.ip ?? '—'}
                  </dd>
                </dl>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Metadata</p>
                  {detail.metadata && Object.keys(detail.metadata).length > 0 ? (
                    <dl className="space-y-1.5 rounded-xl border border-border bg-muted/30 p-3 text-xs">
                      {Object.entries(detail.metadata).map(([key, value]) => (
                        <div
                          key={key}
                          className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2"
                        >
                          <dt className="text-muted-foreground">{humaniseLabel(key)}</dt>
                          <dd className="break-words text-foreground">
                            {formatMetadataValue(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                      No extra context was recorded for this event.
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void copyDetail(detail)}
                >
                  {copiedId === detail._id ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Copy entry
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

/**
 * Deep-link a platform audit target to the console page that owns it. Agency
 * records are real routes; account records are opened as a sheet from the
 * directory via the `?account=` deep link.
 */
function targetHref(targetType: string, targetId: string): string | null {
  if (!/^[a-f0-9]{24}$/i.test(targetId)) return null;
  const type = targetType.toLowerCase();
  if (type === 'agency') return `/admin/agencies/${targetId}`;
  if (type === 'account' || type === 'platform_account') {
    return `/admin/accounts?account=${targetId}`;
  }
  return null;
}

const contextKeys = [
  'name',
  'email',
  'workspace',
  'role',
  'status',
  'previousStatus',
  'previousTierId',
  'tierId',
  'kind',
  'fromEmail',
  'toEmail',
  'fields',
];

function formatMetadataValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function summarizeMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  return contextKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => {
      const text = formatMetadataValue(metadata[key]);
      return `${humaniseLabel(key)}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
    })
    .join(' · ');
}

export default AdminAudit;
