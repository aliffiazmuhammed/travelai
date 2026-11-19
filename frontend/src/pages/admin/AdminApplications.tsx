import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { ConfirmDestructive } from '@/components/ui/confirm-destructive';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminSegmented,
  type AdminSegmentedOption,
} from '@/components/admin/AdminSegmented';
import {
  AdminTableFrame,
  adminTableHeadClass,
  adminTableRowClass,
} from '@/components/admin/AdminTableFrame';
import AdminTemporaryPassword from './AdminTemporaryPassword';
import { api } from '@/services/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  PlatformAgencyApplicationApproval,
  PlatformAgencyApplicationFilter,
  PlatformAgencyApplicationList,
  PlatformAgencyApplicationRow,
} from '@/types';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin/applications` (PA6).
 *
 * The public form writes an intent row and nothing else. Approval here calls the
 * same provisioning primitive the console uses, so a self-applied agency ends up
 * with the same owner account, membership, plan and audit rows as one the admin
 * created by hand. Because there is no mailer, the one-time password comes back
 * to this page once and the admin passes it on themselves.
 */

const PAGE_SIZE = 25;

const EMPTY_COUNTS: PlatformAgencyApplicationList['counts'] = {
  all: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

const TABS: Array<{ value: PlatformAgencyApplicationFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const STATUS_CHIP: Record<
  PlatformAgencyApplicationRow['status'],
  { label: string; className: string }
> = {
  pending: {
    label: 'Pending',
    className: 'border-warning/40 bg-warning/10 text-warning-ink',
  },
  approved: {
    label: 'Approved',
    className: 'border-success/40 bg-success/10 text-success-ink',
  },
  rejected: {
    label: 'Rejected',
    className: 'border-destructive/40 bg-destructive/10 text-destructive-ink',
  },
};

/** Tells the shell to refresh its sidebar count without a page reload. */
const announceChange = () => window.dispatchEvent(new Event('travelai:applications-changed'));

interface Credential {
  email: string;
  password: string;
  workspace?: string;
}

const AdminApplications: React.FC = () => {
  const [status, setStatus] = useState<PlatformAgencyApplicationFilter>('pending');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PlatformAgencyApplicationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [approving, setApproving] = useState<PlatformAgencyApplicationRow | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);

  const [rejecting, setRejecting] = useState<PlatformAgencyApplicationRow | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [status, debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .listAgencyApplications({
        status,
        q: debouncedQuery || undefined,
        page,
        limit: PAGE_SIZE,
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load the application queue.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, debouncedQuery, page, reloadKey]);

  const counts = data?.counts ?? EMPTY_COUNTS;
  const rows = data?.applications ?? [];

  const columns: DataTableColumn<PlatformAgencyApplicationRow>[] = [
    {
      id: 'agency',
      header: 'Agency',
      mobile: 'primary',
      headClassName: adminTableHeadClass,
      cellClassName: 'max-w-[280px] px-4 py-3',
      cell: (row) => (
        <>
          <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
          {row.note ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              “{row.note}”
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground/70">
              No note about their trips.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      headClassName: adminTableHeadClass,
      cellClassName: 'px-4 py-3',
      cell: (row) => (
        <>
          <p className="text-sm text-foreground">{row.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.phone}</p>
        </>
      ),
    },
    {
      id: 'submitted',
      header: 'Submitted',
      headClassName: adminTableHeadClass,
      cellClassName: 'whitespace-nowrap px-4 py-3 text-xs text-muted-foreground',
      cell: (row) => formatAdminDate(row.submittedAt),
    },
    {
      id: 'status',
      header: 'Status',
      headClassName: adminTableHeadClass,
      cellClassName: 'px-4 py-3',
      cell: (row) => {
        const chip = STATUS_CHIP[row.status];
        return (
          <>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-overline font-semibold',
                chip.className
              )}
            >
              {chip.label}
            </span>
            {row.status !== 'pending' && row.decidedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatAdminDate(row.decidedAt)}
              </p>
            ) : null}
            {row.status === 'rejected' && row.decisionNote ? (
              <p className="mt-1 max-w-[200px] text-xs leading-4 text-muted-foreground">
                {row.decisionNote}
              </p>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'decision',
      header: <span className="sr-only">Decision</span>,
      mobile: 'action',
      sticky: 'right',
      stickyHoverClassName: 'group-hover:bg-muted/40',
      headClassName: `${adminTableHeadClass} text-right`,
      cellClassName: 'px-4 py-3',
      cell: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {row.status === 'pending' ? (
            <>
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-admin-accent text-admin-accent-foreground hover:bg-admin-accent/90"
                onClick={() => openApprove(row)}
              >
                <UserCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => openReject(row)}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Reject
              </Button>
            </>
          ) : row.status === 'approved' && row.agencyId ? (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to={`/admin/agencies/${row.agencyId}`}>
                <Building2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                {row.agencySlug ? `Open ${row.agencySlug}` : 'Open workspace'}
              </Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.status === 'approved' ? 'Workspace removed' : 'No further action'}
            </span>
          )}
        </div>
      ),
    },
  ];

  const segmented = useMemo<Array<AdminSegmentedOption<PlatformAgencyApplicationFilter>>>(
    () =>
      TABS.map((tab) => ({
        ...tab,
        count: tab.value === 'all' ? counts.all : counts[tab.value],
      })),
    [counts]
  );

  const openApprove = (row: PlatformAgencyApplicationRow) => {
    setApproveError(null);
    setApproving(row);
  };

  const runApprove = async () => {
    if (!approving) return;
    try {
      setApproveBusy(true);
      setApproveError(null);
      const result: PlatformAgencyApplicationApproval =
        await api.approveAgencyApplication(approving._id);

      setApproving(null);
      toast.success(result.message);

      if (result.provision?.temporaryPassword) {
        setCredential({
          email: result.application.email,
          password: result.provision.temporaryPassword,
          workspace: result.provision.agency?.slug,
        });
      }

      announceChange();
      reload();
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : 'The workspace could not be created.'
      );
    } finally {
      setApproveBusy(false);
    }
  };

  const openReject = (row: PlatformAgencyApplicationRow) => {
    setRejectError(null);
    setRejectNote('');
    setRejecting(row);
  };

  const runReject = async () => {
    if (!rejecting) return;
    try {
      setRejectBusy(true);
      setRejectError(null);
      await api.rejectAgencyApplication(rejecting._id, rejectNote);
      setRejecting(null);
      toast.success('Application rejected. The row is kept and they can apply again.');
      announceChange();
      reload();
    } catch (err) {
      setRejectError(
        err instanceof Error ? err.message : 'That decision could not be saved.'
      );
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={
          <>
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-admin-accent-ink"
            >
              <Inbox className="h-4 w-4" />
            </span>
            Agency applications
          </>
        }
        description="Requests from the public “join as an agency” form. Approving one creates the workspace, the owner account and a one-time password shown here once. Rejecting keeps the row so history is never lost, and the applicant may apply again."
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
          ariaLabel="Application status"
          value={status}
          options={segmented}
          onChange={(value) => setStatus(value)}
        />
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Agency name, email or phone"
            aria-label="Search applications"
            className="h-9 rounded-full pl-9 text-xs"
          />
        </div>
      </div>

      {error ? (
        <AdminNotice
          tone="error"
          title="Could not load the application queue"
          action={
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              Try again
            </Button>
          }
        >
          {error}
        </AdminNotice>
      ) : null}

      <AdminTableFrame
        title={
          status === 'pending' ? 'Waiting for a decision' : 'Application history'
        }
        description={`${counts.pending} pending · ${counts.approved} approved · ${counts.rejected} rejected`}
        footer={
          <AdminPagination
            page={data?.page ?? page}
            totalPages={data?.totalPages ?? 1}
            total={data?.total}
            noun="application"
            loading={loading}
            onChange={setPage}
            className="border-t-0"
          />
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(row) => row._id}
          scrollLabel="Agency applications table"
          mobileLabel="Agency applications"
          minWidth="960px"
          rowClassName={adminTableRowClass}
          loading={loading}
          loadingContent={<AdminLoadingPanel label="Loading applications…" />}
          emptyContent={
            error ? (
              <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                The queue could not be loaded. Use Try again above.
              </p>
            ) : (
              <AdminEmptyState
                icon={status === 'pending' ? CheckCircle2 : Inbox}
                title={
                  status === 'pending'
                    ? 'No applications are waiting.'
                    : debouncedQuery
                      ? 'Nothing matches that search.'
                      : 'Nothing in this tab yet.'
                }
                description={
                  status === 'pending'
                    ? 'Every new application from /agencies/apply lands here for a decision.'
                    : 'Applications stay on file after a decision, so past ones stay searchable.'
                }
              />
            )
          }
        />
      </AdminTableFrame>

      {/* Approval is the loud action: it creates a tenant and an owner account. */}
      <ConfirmDestructive
        open={approving !== null}
        onOpenChange={(next) => {
          if (!next && !approveBusy) {
            setApproving(null);
            setApproveError(null);
          }
        }}
        tone="warning"
        icon={ShieldCheck}
        title="Create this agency workspace?"
        description="It gets a tenant, an owner account for that address and the default plan. A one-time password is shown to you once — there is no email in this stack, so you pass it on yourself."
        detail={
          approving ? (
            <>
              {approving.name} · {approving.email}
            </>
          ) : null
        }
        error={approveError}
        confirmLabel="Approve and provision"
        onConfirm={runApprove}
        busy={approveBusy}
      />

      <Dialog
        open={rejecting !== null}
        onOpenChange={(next) => {
          if (!next && !rejectBusy) {
            setRejecting(null);
            setRejectError(null);
          }
        }}
      >
        <DialogContent className="rounded-2xl border-border bg-card text-card-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject this application?</DialogTitle>
            <DialogDescription className="leading-6">
              {rejecting?.name} is not contacted by the server. The row stays on
              file with your note, and the same email may apply again later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="reject-note" className="text-xs font-bold">
              Private note (optional)
            </Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              maxLength={500}
              placeholder="Why this one isn't a fit — visible only in this console."
              disabled={rejectBusy}
              className="min-h-[84px] resize-none rounded-xl text-xs"
            />
            <p className="text-right text-xs text-muted-foreground">
              {rejectNote.length}/500
            </p>
          </div>

          {rejectError ? <p className="text-xs text-destructive-ink">{rejectError}</p> : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setRejecting(null)}
              disabled={rejectBusy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void runReject()}
              disabled={rejectBusy}
            >
              {rejectBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminTemporaryPassword
        open={credential !== null}
        onOpenChange={(next) => {
          if (!next) setCredential(null);
        }}
        email={credential?.email ?? ''}
        temporaryPassword={credential?.password ?? ''}
        workspace={credential?.workspace}
        description="The owner account for this applicant was created with this one-time password. Pass it on securely; it is shown once and must be changed before the workspace opens."
      />
    </div>
  );
};

export default AdminApplications;
