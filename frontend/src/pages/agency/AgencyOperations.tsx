import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Clock3,
  FileDown,
  Gauge,
  HardDrive,
  Loader2,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AgencySectionTabs } from '@/components/agency/AgencySectionTabs';
import { AgencySegmented } from '@/components/agency/AgencySegmented';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/services/api';
import { useAgency } from '@/context/AgencyContext';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import type {
  AgencyAuditEntry,
  AgencyUsage,
  AgencyUsageLevel,
} from '@/types';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

const AUDIT_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'export.', label: 'Exports' },
  { value: 'trip.', label: 'Trips' },
  { value: 'share.', label: 'Shares' },
  { value: 'quote.', label: 'Quotes' },
  { value: 'template.', label: 'Templates' },
  { value: 'plan.', label: 'Plan' },
  { value: 'invite.', label: 'Invites' },
  { value: 'member.', label: 'Members' },
  { value: 'client.', label: 'Clients' },
  { value: 'asset.', label: 'Assets' },
];

const LEVEL_STYLES: Record<AgencyUsageLevel, string> = {
  ok: 'bg-agency-accent',
  warning: 'bg-warning',
  over: 'bg-destructive',
};

const LEVEL_TEXT: Record<AgencyUsageLevel, string> = {
  ok: 'text-agency-accent-ink',
  warning: 'text-warning-ink',
  over: 'text-destructive-ink',
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function actorLabel(entry: AgencyAuditEntry): string {
  if (entry.actor) return entry.actor;
  if (entry.action.startsWith('share.')) return 'Client (link)';
  if (entry.action === 'plan.changed') return 'waytowalk ops';
  return 'System';
}

function actionLabel(action: string): string {
  return action.replace(/\./g, ' ');
}

function detailSnippet(entry: AgencyAuditEntry): string {
  const parts: string[] = [];
  if (entry.targetType) parts.push(entry.targetType);
  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    const raw = JSON.stringify(entry.metadata);
    parts.push(raw.length > 100 ? `${raw.slice(0, 100)}…` : raw);
  }
  return parts.join(' · ');
}

interface UsageBarProps {
  label: string;
  icon: React.ReactNode;
  used: number;
  cap: number;
  usedText: string;
  capText: string;
  level: AgencyUsageLevel;
}

const UsageBar: React.FC<UsageBarProps> = ({
  label,
  icon,
  used,
  cap,
  usedText,
  capText,
  level,
}) => {
  const percent = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-agency-ink">
          {icon}
          {label}
        </span>
        <span className={cn('font-bold tabular-nums', LEVEL_TEXT[level])}>
          {usedText} / {capText}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={Math.max(cap, 1)}
        aria-valuenow={Math.min(used, Math.max(cap, 1))}
        aria-valuetext={`${usedText} of ${capText} used (${percent}%)`}
        className="h-2 w-full overflow-hidden rounded-full bg-agency-soft"
      >
        <div
          className={cn('h-full rounded-full transition-all', LEVEL_STYLES[level])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

/**
 * A8 operations: plan usage and the append-only audit log. Owner/admin only —
 * the server re-checks the rank; this client gate just keeps the nav tidy.
 */
const AgencyOperations: React.FC = () => {
  const { activeAgency, activeAgencyId, canManage, loading: contextLoading } =
    useAgency();

  const [usage, setUsage] = useState<AgencyUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [entries, setEntries] = useState<AgencyAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [section, setSection] = useState<'usage' | 'audit'>('usage');
  const [actionFilter, setActionFilter] = useState('');

  const loadUsage = useCallback(async () => {
    if (!activeAgencyId) return;
    setUsageLoading(true);
    try {
      const result = await api.getAgencyUsage(activeAgencyId);
      setUsage(result.usage);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not load plan usage.'
      );
    } finally {
      setUsageLoading(false);
    }
  }, [activeAgencyId]);

  const loadAudit = useCallback(
    async (filter: string, page: number) => {
      if (!activeAgencyId) return;
      setAuditLoading(true);
      try {
        const result = await api.getAgencyAudit(activeAgencyId, {
          page,
          limit: PAGE_SIZE,
          action: filter || undefined,
        });
        setEntries(result.entries || []);
        setTotal(result.total || 0);
        // A filter can shrink the log under the open page; step back in.
        const lastPage = Math.max(
          1,
          Math.ceil((result.total || 0) / PAGE_SIZE)
        );
        if (page > lastPage) setAuditPage(lastPage);
      } catch (err) {
        setEntries([]);
        setTotal(0);
        toast.error(
          err instanceof Error ? err.message : 'Could not load the audit log.'
        );
      } finally {
        setAuditLoading(false);
      }
    },
    [activeAgencyId]
  );

  useEffect(() => {
    if (!activeAgencyId) return;
    void loadUsage();
  }, [activeAgencyId, loadUsage]);

  useEffect(() => {
    if (!activeAgencyId) return;
    void loadAudit(actionFilter, auditPage);
  }, [activeAgencyId, actionFilter, auditPage, loadAudit]);

  const handleFilterChange = (filter: string) => {
    setActionFilter(filter);
    setAuditPage(1);
  };


  if (!contextLoading && !canManage) {
    return <Navigate to="/agency" replace />;
  }

  if (!activeAgencyId) {
    return (
      <Card className="rounded-2xl border-agency-line bg-agency-panel shadow-none">
        <CardContent className="p-10 text-center text-sm text-agency-muted">
          Create or join an agency to see operations.
        </CardContent>
      </Card>
    );
  }

  const seats = usage?.used.seats ?? 0;
  const seatCap = usage?.plan.seats ?? 0;
  const exportsUsed = usage?.used.exportsThisMonth ?? 0;
  const exportsCap = usage?.plan.monthlyExports ?? 0;
  const storageUsed = usage?.used.storageBytes ?? 0;
  const storageCapMb = usage?.plan.storageMb ?? 0;

  const auditColumns: DataTableColumn<AgencyAuditEntry>[] = [
    {
      id: 'time',
      header: 'Time',
      headClassName:
        'py-2.5 pl-3 pr-3 text-overline font-semibold text-agency-muted',
      cellClassName: 'whitespace-nowrap py-2.5 pl-3 pr-3 text-agency-muted',
      cell: (entry) => (
        <span className="flex items-center gap-1">
          <Clock3 className="h-3 w-3 shrink-0" />
          {formatDateTime(entry.createdAt)}
        </span>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      headClassName: 'py-2.5 pr-3 text-overline font-semibold text-agency-muted',
      cellClassName: 'py-2.5 pr-3 font-semibold text-agency-ink',
      cell: (entry) => actorLabel(entry),
    },
    {
      id: 'action',
      header: 'Action',
      mobile: 'primary',
      headClassName: 'py-2.5 pr-3 text-overline font-semibold text-agency-muted',
      cellClassName: 'py-2.5 pr-3',
      cell: (entry) => (
        <Badge variant="outline" className="text-xs">
          {actionLabel(entry.action)}
        </Badge>
      ),
    },
    {
      id: 'details',
      header: 'Details',
      mobileSpan: 2,
      headClassName: 'py-2.5 pr-3 text-overline font-semibold text-agency-muted',
      cellClassName: 'max-w-[280px] break-words py-2.5 pr-3 text-agency-muted',
      cell: (entry) => detailSnippet(entry) || '—',
    },
  ];

  return (
    <div className="space-y-5">
      <AgencyPageHeader
        title="Operations"
        meta={
          <Badge variant="outline" className="text-xs">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Owner / admin
          </Badge>
        }
        description={`Plan usage and the audit trail for ${
          activeAgency?.name ?? 'this agency'
        }. Counters reset monthly for exports; storage is the live total of assets, templates and export PDFs.`}
      />

      <AgencySectionTabs
        ariaLabel="Operations sections"
        panelId="operations-panels"
        value={section}
        onChange={(value) => setSection(value)}
        options={[
          { value: 'usage', label: 'Usage', icon: Gauge },
          { value: 'audit', label: 'Audit log', icon: ScrollText },
        ]}
      />

      <div
        id="operations-panels"
        role="tabpanel"
        aria-label={section === 'usage' ? 'Usage' : 'Audit log'}
        className="space-y-5"
      >
        <div className={cn(section === 'usage' ? undefined : 'hidden')}>
          <Card className="rounded-2xl border-agency-line bg-agency-panel shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-agency-ink">
            <Gauge className="h-4 w-4" />
            Plan usage
            {usage ? (
              <Badge variant="outline" className="text-xs capitalize">
                {usage.plan.tierId}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription className="text-xs text-agency-muted">
            Usage is counted by the workspace, not by device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-5 pt-0">
          {usageLoading ? (
            <div className="flex items-center justify-center py-6 text-agency-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading usage...
            </div>
          ) : usage ? (
            <>
              <UsageBar
                label="Seats"
                icon={<Users className="h-3.5 w-3.5" />}
                used={seats}
                cap={seatCap}
                usedText={String(seats)}
                capText={String(seatCap)}
                level={usage.levels.seats}
              />
              <UsageBar
                label="Exports this month"
                icon={<FileDown className="h-3.5 w-3.5" />}
                used={exportsUsed}
                cap={exportsCap}
                usedText={String(exportsUsed)}
                capText={String(exportsCap)}
                level={usage.levels.exports}
              />
              <UsageBar
                label="Storage"
                icon={<HardDrive className="h-3.5 w-3.5" />}
                used={storageUsed}
                cap={storageCapMb * 1024 * 1024}
                usedText={formatMb(storageUsed)}
                capText={`${storageCapMb} MB`}
                level={usage.levels.storage}
              />
            </>
          ) : (
            <p className="py-4 text-center text-xs text-agency-muted">
              Usage is unavailable right now.
            </p>
          )}
        </CardContent>
      </Card>
        </div>

        <div className={cn(section === 'audit' ? undefined : 'hidden')}>
          <Card className="rounded-2xl border-agency-line bg-agency-panel shadow-none">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-agency-ink">
              <ScrollText className="h-4 w-4" />
              Audit log
              <Badge variant="outline" className="text-xs">
                {total}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-agency-muted">
              Append-only record of who did what in this agency.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <AgencySegmented
              ariaLabel="Audit action filter"
              value={actionFilter}
              onChange={handleFilterChange}
              options={AUDIT_FILTERS.map((filter) => ({
                value: filter.value,
                label: filter.label,
              }))}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
          {auditLoading ? (
            <div className="flex items-center justify-center py-8 text-agency-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading audit log...
            </div>
          ) : entries.length === 0 ? (
            <p className="py-8 text-center text-xs text-agency-muted">
              No audit events yet. Export requests, archive actions and share
              activity will appear here.
            </p>
          ) : (
            <DataTable
              rows={entries}
              columns={auditColumns}
              getRowKey={(entry) => entry._id}
              scrollLabel="Agency audit log"
              mobileLabel="Agency audit log"
              minWidth="640px"
              tableClassName="text-xs"
              stickySurfaceClassName="bg-agency-panel"
              headClassName="sticky top-0 z-10 bg-agency-panel"
              headRowClassName="border-b border-agency-line"
              rowClassName="border-b border-agency-line align-top transition-colors last:border-0 hover:bg-agency-soft/60"
              containerClassName="max-h-[min(32rem,calc(100dvh-24rem))] overflow-y-auto rounded-lg border border-agency-line"
            />
          )}
          {!auditLoading && entries.length > 0 ? (
            <AdminPagination
              page={auditPage}
              totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              total={total}
              noun="entry"
              nounPlural="entries"
              loading={auditLoading}
              onChange={setAuditPage}
              className="rounded-lg border border-agency-line"
            />
          ) : null}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
};

export default AgencyOperations;
