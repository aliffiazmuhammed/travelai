import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Loader2,
  Mail,
  Map,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useAgency } from '@/context/AgencyContext';
import { agencyRoleBadgeClass, agencyRoleLabel, formatAgencyDate } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type { AgencyClient } from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgencyClient | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadClients(true);
  }, [activeAgencyId, loadClients]);

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
      <Card className="rounded-3xl border-border/70">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Create or join an agency to keep a client directory.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
            <Badge
              variant="outline"
              className={cn('text-[10px]', agencyRoleBadgeClass(role || 'viewer'))}
            >
              {agencyRoleLabel(role || 'viewer')}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            A private address book for the people you quote and plan for. Adding
            a client never grants workspace access; trip sharing stays
            trip-scoped.
          </p>
        </div>
        {canPlan ? (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add client
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, company or email"
                className="pl-9"
                maxLength={120}
              />
            </div>
            <Badge variant="outline" className="text-[10px] text-slate-500">
              {clients.length} {clients.length === 1 ? 'client' : 'clients'}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/agency/trips">
                <Map className="mr-1.5 h-3.5 w-3.5" />
                Agency trips
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center dark:border-slate-800">
              <BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
              <h3 className="mt-3 text-sm font-semibold">
                {search.trim() ? 'No matching clients' : 'No clients yet'}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
                {search.trim()
                  ? 'Try a different name, company or email.'
                  : 'Add the people you plan for, then select them while preparing a trip quote.'}
              </p>
              {canPlan && !search.trim() ? (
                <Button className="mt-4" size="sm" onClick={openCreate}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add your first client
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {clients.map((client) => (
                <div
                  key={client._id}
                  className="flex flex-wrap items-start gap-3 px-4 py-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-sm font-bold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
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
                    {client.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
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
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
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
