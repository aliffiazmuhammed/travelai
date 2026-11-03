import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Inbox,
  Loader2,
  Mail,
  Map,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { AgencyEmptyState } from '@/components/agency/AgencyEmptyState';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useAgency } from '@/context/AgencyContext';
import { agencyRoleBadgeClass, agencyRoleLabel, formatAgencyDate } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { AgencyClient } from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const PAGE_SIZE = 10;

type ClientForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
};

const emptyForm: ClientForm = {
  name: '',
  company: '',
  email: '',
  phone: '',
  notes: '',
};

/**
 * Agency client directory (A4). Clients are reusable address-book records; they
 * never receive workspace access. Trip collaborators remain the only way a
 * client can see a trip.
 */
const AgencyClients: React.FC = () => {
  const { activeAgency, activeAgencyId, canManage } = useAgency();
  const role = activeAgency?.role;
  const canPlan = canManage || role === 'planner';

  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [clientPage, setClientPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyClient | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const listRequestRef = useRef(0);

  const loadClients = useCallback(
    async (showSpinner = true) => {
      if (!activeAgencyId) return;
      const requestId = ++listRequestRef.current;
      try {
        if (showSpinner) setLoading(true);
        const result = await api.getAgencyClients(
          activeAgencyId,
          debouncedSearch.trim() || undefined
        );
        if (requestId === listRequestRef.current) {
          setClients(result.clients || []);
        }
      } catch (err) {
        if (showSpinner && requestId === listRequestRef.current) {
          toast.error(errorMessage(err, 'Could not load the client directory.'));
        }
      } finally {
        if (showSpinner && requestId === listRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [activeAgencyId, debouncedSearch]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setClients([]);
    setClientPage(1);
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadClients(true);
  }, [activeAgencyId, loadClients]);

  const clientTotalPages = Math.max(1, Math.ceil(clients.length / PAGE_SIZE));
  const pageClients = clients.slice(
    (clientPage - 1) * PAGE_SIZE,
    clientPage * PAGE_SIZE
  );

  useEffect(() => {
    if (clientPage > clientTotalPages) {
      setClientPage(clientTotalPages);
    }
  }, [clientPage, clientTotalPages]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (client: AgencyClient) => {
    setEditing(client);
    setForm({
      name: client.name,
      company: client.company ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      notes: client.notes ?? '',
    });
    setDialogOpen(true);
  };

  // The ⌘K palette lands here with ?new=1; consume it once and open the form.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    setSearchParams({}, { replace: true });
    if (!canPlan) return;
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }, [canPlan, searchParams, setSearchParams]);

  const saveClient = async () => {
    if (!activeAgencyId) return;
    if (form.name.trim().length < 2) {
      toast.error('Enter the client name first.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        notes: form.notes.trim(),
      };
      if (editing) {
        const result = await api.updateAgencyClient(
          activeAgencyId,
          editing._id,
          payload
        );
        setClients((prev) =>
          prev
            .map((client) =>
              client._id === result.client._id ? result.client : client
            )
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        toast.success('Client updated.');
      } else {
        const result = await api.createAgencyClient(activeAgencyId, payload);
        setClients((prev) =>
          [result.client, ...prev].sort((a, b) => a.name.localeCompare(b.name))
        );
        toast.success('Client added to the directory.');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this client.'));
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async (client: AgencyClient) => {
    if (!activeAgencyId) return;
    if (
      !window.confirm(
        `Remove "${client.name}" from the client directory? Their trips keep the itinerary but are unlinked.`
      )
    ) {
      return;
    }
    setBusyId(client._id);
    try {
      const result = await api.deleteAgencyClient(activeAgencyId, client._id);
      setClients((prev) => prev.filter((entry) => entry._id !== client._id));
      toast.success(result.message || 'Client removed.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove this client.'));
    } finally {
      setBusyId(null);
    }
  };

  if (!activeAgencyId) {
    return (
      <div className="rounded-2xl border border-agency-line bg-agency-panel p-10 text-center text-sm text-agency-muted">
        Create or join an agency to keep a client directory.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AgencyPageHeader
        title="Clients"
        meta={
          <Badge
            variant="outline"
            className={cn('text-[10px]', agencyRoleBadgeClass(role || 'viewer'))}
          >
            {agencyRoleLabel(role || 'viewer')}
          </Badge>
        }
        description="A private address book for the people you quote and plan for. Adding a client never grants workspace access; trip sharing stays trip-scoped."
        actions={
          canPlan ? (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add client
            </Button>
          ) : null
        }
      />

      <section className="overflow-hidden rounded-2xl border border-agency-line bg-agency-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-agency-line px-3 py-2.5">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-agency-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, company or email"
              className="h-9 rounded-xl border-agency-line pl-9"
              maxLength={120}
            />
          </div>
          <span className="text-[11px] tabular-nums text-agency-muted">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-agency-muted hover:text-agency-ink"
          >
            <Link to="/agency/trips">
              <Map className="mr-1.5 h-3.5 w-3.5" />
              Agency trips
            </Link>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-agency-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading clients...
          </div>
        ) : clients.length === 0 ? (
          <div className="p-4">
            <AgencyEmptyState
              icon={BriefcaseBusiness}
              title={search.trim() ? 'No matching clients' : 'No clients yet'}
              body={
                search.trim()
                  ? 'Try a different name, company or email.'
                  : 'Add the people you plan for, then select them while preparing a trip quote.'
              }
              action={
                canPlan && !search.trim() ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add your first client
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table
                containerClassName="max-h-[min(34rem,calc(100dvh-26rem))] overflow-y-auto"
              >
                <TableHeader className="sticky top-0 z-10 bg-agency-panel">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-agency-muted">Client</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-agency-muted">Contact</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-agency-muted">Company</TableHead>
                    <TableHead className="h-10 text-[11px] font-semibold uppercase tracking-[0.06em] text-agency-muted">Added</TableHead>
                    <TableHead className="h-10 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-agency-muted">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageClients.map((client) => (
                    <TableRow
                      key={client._id}
                      className="hover:bg-agency-soft/60"
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-agency-accent-soft text-[11px] font-bold text-agency-accent">
                            {client.name.trim().slice(0, 1).toUpperCase() || 'C'}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-agency-ink">
                              {client.name}
                            </p>
                            {client.sourceEnquiryId ? (
                              <Link
                                to={`/agency/enquiries?enquiry=${client.sourceEnquiryId}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-agency-accent hover:underline"
                              >
                                <Inbox className="h-3 w-3" />
                                Came in through an enquiry
                              </Link>
                            ) : client.notes ? (
                              <p
                                className="max-w-[22rem] truncate text-[11px] text-agency-muted"
                                title={client.notes}
                              >
                                {client.notes}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="space-y-0.5 text-xs text-agency-muted">
                          {client.email ? (
                            <a
                              href={`mailto:${client.email}`}
                              className="flex items-center gap-1.5 hover:text-agency-accent"
                            >
                              <Mail className="h-3 w-3" />
                              {client.email}
                            </a>
                          ) : null}
                          {client.phone ? (
                            <a
                              href={`tel:${client.phone}`}
                              className="flex items-center gap-1.5 hover:text-agency-accent"
                            >
                              <Phone className="h-3 w-3" />
                              {client.phone}
                            </a>
                          ) : null}
                          {!client.email && !client.phone ? (
                            <span className="text-agency-muted/70">—</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-agency-muted">
                        {client.company || '—'}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-agency-muted">
                        {formatAgencyDate(client.createdAt)}
                      </TableCell>
                      <TableCell className="py-3">
                        {canPlan ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(client)}
                              disabled={busyId === client._id}
                              aria-label={`Edit ${client.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void removeClient(client)}
                              disabled={busyId === client._id}
                              aria-label={`Remove ${client.name}`}
                            >
                              {busyId === client._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y divide-agency-line md:hidden">
              {pageClients.map((client) => (
                <div
                  key={client._id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-agency-accent-soft text-sm font-bold text-agency-accent">
                    {client.name.trim().slice(0, 1).toUpperCase() || 'C'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {client.name}
                      </span>
                      {client.company ? (
                        <Badge variant="outline" className="text-[10px]">
                          {client.company}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-agency-muted">
                      {client.email ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {client.email}
                        </span>
                      ) : null}
                      {client.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {client.phone}
                        </span>
                      ) : null}
                      <span>Added {formatAgencyDate(client.createdAt)}</span>
                    </div>
                    {client.sourceEnquiryId ? (
                      <Link
                        to={`/agency/enquiries?enquiry=${client.sourceEnquiryId}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-agency-accent hover:underline"
                      >
                        <Inbox className="h-3 w-3" />
                        Came in through an enquiry
                      </Link>
                    ) : null}
                    {client.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-agency-muted">
                        {client.notes}
                      </p>
                    ) : null}
                  </div>
                  {canPlan ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(client)}
                        disabled={busyId === client._id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit {client.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeClient(client)}
                        disabled={busyId === client._id}
                        aria-label={`Remove ${client.name}`}
                      >
                        {busyId === client._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <AdminPagination
              page={clientPage}
              totalPages={clientTotalPages}
              total={clients.length}
              noun="client"
              onChange={setClientPage}
              className="border-agency-line"
            />
          </>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl sm:rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit client' : 'Add a client'}</DialogTitle>
            <DialogDescription>
              These details are prefilled into trip quotes. The quote keeps its
              own snapshot, so later edits never rewrite an old version.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Client or family name"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-company">Company</Label>
              <Input
                id="client-company"
                value={form.company}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, company: event.target.value }))
                }
                placeholder="Optional"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="client@example.com"
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                placeholder="+91 ..."
                maxLength={40}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={3}
                placeholder="Preferences, billing details or context for the team"
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveClient()}
              disabled={saving || form.name.trim().length < 2}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {editing ? 'Save changes' : 'Add client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgencyClients;
