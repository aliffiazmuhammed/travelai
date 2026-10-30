import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ClipboardList,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import type { PlatformAuditList } from '@/types';
import { cn } from '@/lib/utils';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin/audit` (PA4).
 *
 * Platform action history only. These rows are written by the platform realm
 * and by PA4 tenant mutations; they never contain credentials, tokens, headers
 * or tenant content. Tenant-internal audit stays in the tenant's own viewer.
 *
 * The two filters used most often — free text and action type — stay visible;
 * id and date narrowing lives behind "More filters" so the page starts calm.
 */
const AdminAudit: React.FC = () => {
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState(() => searchParams.get('targetId') ?? '');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [moreOpen, setMoreOpen] = useState(() => Boolean(searchParams.get('targetId')));

  const [data, setData] = useState<PlatformAuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .listAdminAudit({
        q: debouncedSearch,
        action,
        targetType,
        targetId: targetId.trim() || undefined,
        // The API accepts an account ObjectId only; partial typing must not
        // turn into a 400 while the operator is still pasting the id.
        actorId: /^[a-f0-9]{24}$/i.test(actorId.trim()) ? actorId.trim() : undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: 50,
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
  }, [debouncedSearch, action, targetType, targetId, actorId, from, to, page, reloadKey]);

  const entries = data?.entries ?? [];
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
              onChange={(event) => setSearch(event.target.value)}
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
                  {value}
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
                  {value}
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
              <span className="rounded-full bg-indigo-500/15 px-1.5 text-[10px] font-semibold text-indigo-300">
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
            className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="audit-actor" className="text-[11px] text-muted-foreground">
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
                  className="h-9 pr-8 font-mono text-xs"
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-target" className="text-[11px] text-muted-foreground">
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
                  className="h-9 pr-8 font-mono text-xs"
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-from" className="text-[11px] text-muted-foreground">
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
              <Label htmlFor="audit-to" className="text-[11px] text-muted-foreground">
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
        <AdminNotice tone="error" title="The audit trail did not load">
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
        minWidth="920px"
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
        <thead>
          <tr>
            <th className={adminTableHeadClass}>When</th>
            <th className={adminTableHeadClass}>Action</th>
            <th className={adminTableHeadClass}>Actor</th>
            <th className={adminTableHeadClass}>Target</th>
            <th className={adminTableHeadClass}>Context</th>
            <th className={adminTableHeadClass}>IP</th>
          </tr>
        </thead>
        <tbody>
          {loading && entries.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <AdminLoadingPanel label="Loading audit events…" />
              </td>
            </tr>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={6}>
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
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry._id} className={adminTableRowClass}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatAdminDate(entry.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs font-medium text-indigo-300">{entry.action}</code>
                </td>
                <td className="px-4 py-3 text-xs">{entry.actorEmail ?? 'system'}</td>
                <td className="px-4 py-3 text-xs">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    {entry.targetType}
                  </Badge>
                  {entry.targetId ? (
                    <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                      {targetHref(entry.targetType, entry.targetId) ? (
                        <Link
                          to={targetHref(entry.targetType, entry.targetId)!}
                          className="text-indigo-300 underline-offset-2 hover:text-indigo-200 hover:underline"
                        >
                          {entry.targetId}
                        </Link>
                      ) : (
                        entry.targetId
                      )}
                    </p>
                  ) : null}
                </td>
                <td className="max-w-[320px] px-4 py-3 text-[11px] text-muted-foreground">
                  {summarizeMetadata(entry.metadata) || '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-muted-foreground">
                  {entry.ip ?? '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableFrame>
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

function summarizeMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata) return '';
  return contextKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => {
      const value = metadata[key];
      const text = Array.isArray(value) ? value.join(', ') : String(value);
      return `${key}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`;
    })
    .join(' · ');
}

export default AdminAudit;
