import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import type { PlatformAuditList } from '@/types';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin/audit` (PA4).
 *
 * Platform action history only. These rows are written by the platform realm
 * and by PA4 tenant mutations; they never contain credentials, tokens, headers
 * or tenant content. Tenant-internal audit stays in the tenant's own viewer.
 */
const AdminAudit: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardList className="h-5 w-5 text-indigo-400" />
            Audit
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Platform operations across accounts, agencies and tenant lifecycle. No tenant
            content or credential is ever stored here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            onClick={resetFilters}
            disabled={loading}
          >
            Clear filters
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, target or id"
            aria-label="Search audit"
            className="h-9 border-slate-700 bg-slate-950 pl-9 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <Select
          value={action || 'all'}
          onValueChange={(value) => {
            setAction(value === 'all' ? '' : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 border-slate-700 bg-slate-950 text-slate-200">
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
          <SelectTrigger className="h-9 border-slate-700 bg-slate-950 text-slate-200">
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

        <Input
          value={actorId}
          onChange={(event) => {
            setActorId(event.target.value);
            setPage(1);
          }}
          placeholder="Actor account ID"
          aria-label="Filter by actor account id"
          className="h-9 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-slate-500"
        />

        <Input
          value={targetId}
          onChange={(event) => {
            setTargetId(event.target.value);
            setPage(1);
          }}
          placeholder="Target ID"
          aria-label="Filter by target id"
          className="h-9 border-slate-700 bg-slate-950 font-mono text-xs text-slate-100 placeholder:font-sans placeholder:text-slate-500"
        />

        <Input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
          aria-label="From date"
          className="h-9 border-slate-700 bg-slate-950 text-slate-100"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
          aria-label="To date"
          className="h-9 border-slate-700 bg-slate-950 text-slate-100"
        />
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <Card className="border-slate-800 bg-slate-900/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Actor</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">Context</th>
                  <th className="px-4 py-3 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody>
                {loading && entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading audit events…
                      </span>
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-400">
                      No audit events match these filters.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry._id}
                      className="border-b border-slate-800/70 align-top last:border-0 hover:bg-slate-900/70"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                        {formatAdminDate(entry.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs text-indigo-300">{entry.action}</code>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {entry.actorEmail ?? 'system'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Badge
                          variant="outline"
                          className="border-slate-700 text-[10px] uppercase tracking-wide text-slate-300"
                        >
                          {entry.targetType}
                        </Badge>
                        {entry.targetId ? (
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
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
                      <td className="max-w-[320px] px-4 py-3 text-[11px] text-slate-400">
                        {summarizeMetadata(entry.metadata) || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[10px] text-slate-500">
                        {entry.ip ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
            <p className="text-xs text-slate-500">
              {data
                ? `${data.total} event${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.totalPages}`
                : 'Loading…'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!data || data.page <= 1 || loading}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => value + 1)}
                disabled={!data || data.page >= data.totalPages || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Deep-link a platform audit target to the console page that owns it. Detail
 * views are state-driven, so the pages read `?agency=` / `?account=` on mount.
 */
function targetHref(targetType: string, targetId: string): string | null {
  if (!/^[a-f0-9]{24}$/i.test(targetId)) return null;
  const type = targetType.toLowerCase();
  if (type === 'agency') return `/admin/agencies?agency=${targetId}`;
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
