import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Eye,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import type {
  PlatformAgencyInput,
  PlatformAgencyList,
  PlatformAgencyProfileFilter,
  PlatformAgencyStatusFilter,
  PlatformOwnerPreview,
  PlatformPlanTier,
  PlatformProvisionResult,
} from '@/types';
import { toast } from 'sonner';
import AdminAgencyDetail from './AdminAgencyDetail';
import AdminTemporaryPassword from './AdminTemporaryPassword';
import { formatAdminDate } from './accountMeta';

/**
 * `/admin/agencies` (PA3/PA4).
 *
 * Provisioning a tenant creates three separate rows: the Agency, the owner's
 * agency-realm account, and the owner membership. The directory below lists
 * identity/plan metadata only and opens the PA4 drawer for lifecycle, plan,
 * member and audit operations. Nothing here converts a personal or platform
 * account, and no tenant content is read.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WizardStep = 1 | 2 | 3;

interface ProvisionForm {
  name: string;
  slug: string;
  planTierId: string;
  ownerEmail: string;
  ownerName: string;
  contactName: string;
  contactEmail: string;
  renewalDate: string;
  notes: string;
}

const emptyForm: ProvisionForm = {
  name: '',
  slug: '',
  planTierId: '',
  ownerEmail: '',
  ownerName: '',
  contactName: '',
  contactEmail: '',
  renewalDate: '',
  notes: '',
};

function suggestSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

const AdminAgencies: React.FC = () => {
  const [plans, setPlans] = useState<PlatformPlanTier[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [list, setList] = useState<PlatformAgencyList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<PlatformAgencyStatusFilter>('all');
  const [profileFilter, setProfileFilter] =
    useState<PlatformAgencyProfileFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<ProvisionForm>(emptyForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Deep link from the platform audit console (`?agency=<id>`).
  useEffect(() => {
    const requested = searchParams.get('agency');
    if (requested) setDetailId(requested);
  }, [searchParams]);

  const [preview, setPreview] = useState<PlatformOwnerPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [provisioned, setProvisioned] = useState<PlatformProvisionResult | null>(null);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
    workspace: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAgencyPlanTiers()
      .then((result) => {
        if (cancelled) return;
        setPlans(result.tiers);
        const preferred = result.tiers.find((tier) => tier.isDefault) ?? result.tiers[0];
        if (preferred) {
          setForm((current) =>
            current.planTierId ? current : { ...current, planTierId: preferred.tierId }
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPlansError(err instanceof Error ? err.message : 'Could not load plan tiers.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the directory search so every keystroke is not a cross-tenant scan.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    api
      .listAdminAgencies({
        q: debouncedSearch,
        status: statusFilter,
        profile: profileFilter,
        planTierId: planFilter,
        page,
        limit: 25,
      })
      .then((result) => {
        if (!cancelled) setList(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setListError(
            err instanceof Error ? err.message : 'Could not load the agency directory.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, statusFilter, profileFilter, planFilter, page, listReloadKey]);

  // Owner-realm preview while the operator types. Debounced, cancelled on blur
  // of the dialog so a stale response cannot overwrite a reopened wizard.
  useEffect(() => {
    if (!open || !isEmail(form.ownerEmail)) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    const timer = window.setTimeout(() => {
      api
        .previewAgencyOwner(form.ownerEmail.trim().toLowerCase())
        .then((result) => {
          if (!cancelled) setPreview(result.preview);
        })
        .catch((err) => {
          if (!cancelled) {
            setPreview(null);
            setPreviewError(
              err instanceof Error ? err.message : 'Could not check this email.'
            );
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, form.ownerEmail]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.tierId === form.planTierId),
    [plans, form.planTierId]
  );

  const resetWizard = () => {
    setForm({
      ...emptyForm,
      planTierId: plans.find((plan) => plan.isDefault)?.tierId ?? plans[0]?.tierId ?? '',
    });
    setSlugEdited(false);
    setStep(1);
    setFormError(null);
    setPreview(null);
    setPreviewError(null);
  };

  const openWizard = () => {
    resetWizard();
    setOpen(true);
  };

  const update = (patch: Partial<ProvisionForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    if (formError) setFormError(null);
  };

  const stepOneValid = () => {
    if (form.name.trim().length < 2) {
      setFormError('Enter an agency name (2 characters or more).');
      return false;
    }
    const slug = form.slug.trim();
    if (slug && (slug.length < 3 || slug.length > 40 || !SLUG_PATTERN.test(slug))) {
      setFormError(
        'Use 3–40 characters for the workspace slug: lowercase letters, numbers and single dashes.'
      );
      return false;
    }
    if (!form.planTierId) {
      setFormError('Choose a plan tier.');
      return false;
    }
    return true;
  };

  const stepTwoValid = () => {
    if (!isEmail(form.ownerEmail)) {
      setFormError('Enter a valid owner email address.');
      return false;
    }
    if (form.ownerName.trim().length > 40) {
      setFormError('Owner name must be 40 characters or fewer.');
      return false;
    }
    if (form.contactEmail.trim() && !isEmail(form.contactEmail)) {
      setFormError('Enter a valid billing email address or leave it blank.');
      return false;
    }
    if (preview?.blocked) {
      setFormError(preview.blockedReason ?? 'This email cannot own a new workspace.');
      return false;
    }
    return true;
  };

  const goNext = () => {
    setFormError(null);
    if (step === 1 && !stepOneValid()) return;
    if (step === 2 && !stepTwoValid()) return;
    setStep((current) => (current === 1 ? 2 : 3));
  };

  const goBack = () => {
    setFormError(null);
    setStep((current) => (current === 3 ? 2 : 1));
  };

  const submit = async () => {
    setFormError(null);
    if (!stepOneValid() || !stepTwoValid()) return;

    const billing = {
      ...(form.contactName.trim() ? { contactName: form.contactName.trim() } : {}),
      ...(form.contactEmail.trim()
        ? { contactEmail: form.contactEmail.trim().toLowerCase() }
        : {}),
      ...(form.renewalDate ? { renewalDate: form.renewalDate } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    const input: PlatformAgencyInput = {
      name: form.name.trim(),
      ...(form.slug.trim() ? { slug: form.slug.trim().toLowerCase() } : {}),
      planTierId: form.planTierId,
      ownerEmail: form.ownerEmail.trim().toLowerCase(),
      ...(form.ownerName.trim() ? { ownerName: form.ownerName.trim() } : {}),
      ...(Object.keys(billing).length > 0 ? { billing } : {}),
    };

    setSubmitting(true);
    try {
      const result = await api.provisionAgency(input);
      setProvisioned(result);
      setOpen(false);
      resetWizard();
      setListReloadKey((key) => key + 1);
      if (result.temporaryPassword) {
        setCredential({
          email: result.owner.email,
          password: result.temporaryPassword,
          workspace: result.owner.workspace,
        });
      } else {
        toast.success('Agency provisioned and the existing workspace account attached.');
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not provision this agency.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="h-5 w-5 text-indigo-400" />
            Agencies
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Provision a paying tenant and hand its owner a separate agency login. No
            personal account is converted or attached.
          </p>
        </div>
        <Button
          type="button"
          className="bg-indigo-500 text-white hover:bg-indigo-400"
          onClick={openWizard}
          disabled={plans.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Provision agency
        </Button>
      </div>

      {plansError ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{plansError}</p>
        </div>
      ) : null}

      {provisioned ? (
        <Card className="border-emerald-900/70 bg-emerald-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {provisioned.agency.name} is live
            </CardTitle>
            <CardDescription className="text-emerald-200/70">
              {provisioned.owner.created
                ? 'The owner account was created in the agency realm with a one-time password.'
                : 'An existing workspace account for this tenant was attached as owner.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Summary label="Workspace" value={provisioned.agency.slug} mono />
              <Summary label="Owner" value={provisioned.owner.email} />
              <Summary label="Plan" value={provisioned.agency.plan.tierId} />
              <Summary label="Provisioned" value={formatAdminDate(provisioned.agency.provisionedAt)} />
            </div>

            {provisioned.warnings.length > 0 ? (
              <ul className="space-y-1.5 rounded-xl border border-amber-900/60 bg-amber-950/20 px-3.5 py-3 text-xs text-amber-200/90">
                {provisioned.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="bg-indigo-500 text-white hover:bg-indigo-400">
                <Link
                  to={`/agency/login?workspace=${encodeURIComponent(provisioned.agency.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open workspace login
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setProvisioned(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-800 bg-slate-900/60">
          <CardContent className="grid gap-4 p-5 md:grid-cols-3">
            <Point
              icon={<UserRound className="h-4 w-4 text-indigo-400" />}
              title="A separate agency account"
              body="The owner signs in with the workspace slug and their agency email. A personal account with the same email stays exactly as it is."
            />
            <Point
              icon={<KeyRound className="h-4 w-4 text-amber-400" />}
              title="One-time password"
              body="New owner accounts are created with a temporary password and must replace it at first sign-in before the workspace opens."
            />
            <Point
              icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
              title="One workspace per account"
              body="An agency account belongs to exactly one tenant. An email already used in another workspace is rejected; use a different owner email."
            />
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-800 bg-slate-900/60">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-indigo-400" />
              All agencies
            </CardTitle>
            <CardDescription>
              {list
                ? `${list.counts.all} tenant${list.counts.all === 1 ? '' : 's'} · ${list.counts.active} active · ${list.counts.suspended} suspended`
                : 'Fetching tenants…'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, slug or billing"
                aria-label="Search agencies"
                className="h-9 w-56 border-slate-700 bg-slate-950 pl-9 text-sm text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value as PlatformAgencyStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter by status"
                className="h-9 w-32 border-slate-700 bg-slate-950 text-slate-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={profileFilter}
              onValueChange={(value) => {
                setProfileFilter(value as PlatformAgencyProfileFilter);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter by directory state"
                className="h-9 w-36 border-slate-700 bg-slate-950 text-slate-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directory</SelectItem>
                <SelectItem value="published">Listed</SelectItem>
                <SelectItem value="hidden">Hidden by ops</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={planFilter}
              onValueChange={(value) => {
                setPlanFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger
                aria-label="Filter by plan"
                className="h-9 w-32 border-slate-700 bg-slate-950 text-slate-200"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {plans.map((plan) => (
                  <SelectItem key={plan.tierId} value={plan.tierId}>
                    {plan.tierId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
              onClick={() => setListReloadKey((key) => key + 1)}
              disabled={listLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {listError ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-900 bg-rose-950/40 p-3.5 text-sm text-rose-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{listError}</p>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-semibold">Agency</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Members</th>
                  <th className="px-3 py-2 font-semibold">Renewal</th>
                  <th className="px-3 py-2 font-semibold">Last activity</th>
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading && (list?.agencies.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading agencies…
                      </span>
                    </td>
                  </tr>
                ) : (list?.agencies.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-sm text-slate-400">
                      {search || statusFilter !== 'all' || planFilter !== 'all'
                        ? 'No agencies match these filters.'
                        : 'No agencies yet. Provision the first tenant to get started.'}
                    </td>
                  </tr>
                ) : (
                  list!.agencies.map((agency) => (
                    <tr
                      key={agency._id}
                      className="border-b border-slate-800/70 align-top last:border-0 hover:bg-slate-900/70"
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-200">{agency.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{agency.slug}</p>
                      </td>
                      <td className="px-3 py-3">
                        <AgencyStatusPill status={agency.status} />
                      </td>
                      <td className="px-3 py-3">
                        <p className="break-all text-xs text-slate-300">
                          {agency.owner?.email ?? 'No owner'}
                        </p>
                        {agency.ownerCount > 1 ? (
                          <p className="text-[11px] text-slate-500">
                            +{agency.ownerCount - 1} more owner
                            {agency.ownerCount - 1 === 1 ? '' : 's'}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge
                          variant="outline"
                          className="border-slate-700 text-[10px] uppercase tracking-wide text-slate-300"
                        >
                          {agency.plan.tierId}
                        </Badge>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {agency.plan.seats} seats · {agency.plan.monthlyExports} exports
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-300">
                        {agency.memberCount} / {agency.plan.seats}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                        {formatAdminDate(agency.billing?.renewalDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">
                        {formatAdminDate(agency.lastActivityAt)}
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          Created {formatAdminDate(agency.createdAt)}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                          onClick={() => setDetailId(agency._id)}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
            <p className="text-xs text-slate-500">
              {list
                ? `${list.total} tenant${list.total === 1 ? '' : 's'} · page ${list.page} of ${list.totalPages}`
                : 'Loading tenants…'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!list || list.page <= 1 || listLoading}
              >
                Previous
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={() => setPage((value) => value + 1)}
                disabled={!list || list.page >= list.totalPages || listLoading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!submitting) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-400" />
              Provision agency
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Step {step} of 3 —{' '}
              {step === 1 ? 'tenant details' : step === 2 ? 'owner access' : 'review and create'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((value) => (
              <div
                key={value}
                className={`h-1.5 flex-1 rounded-full ${
                  value <= step ? 'bg-indigo-500' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>

          {formError ? (
            <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-3.5 py-3 text-sm text-rose-200">
              {formError}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agency-name" className="text-slate-300">
                  Agency name
                </Label>
                <Input
                  id="agency-name"
                  value={form.name}
                  maxLength={80}
                  onChange={(event) => {
                    const name = event.target.value;
                    update({
                      name,
                      ...(slugEdited ? {} : { slug: suggestSlug(name) }),
                    });
                  }}
                  placeholder="Northwind Travel"
                  className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency-slug" className="text-slate-300">
                  Workspace slug
                </Label>
                <Input
                  id="agency-slug"
                  value={form.slug}
                  maxLength={40}
                  onChange={(event) => {
                    setSlugEdited(true);
                    update({ slug: event.target.value.toLowerCase() });
                  }}
                  placeholder="auto from the name"
                  className="border-slate-700 bg-slate-950 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                />
                <p className="text-xs text-slate-500">
                  Permanent login handle: {form.slug || 'generated on create'} ·
                  /agency/login?workspace={form.slug || '…'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency-plan" className="text-slate-300">
                  Plan
                </Label>
                <Select
                  value={form.planTierId}
                  onValueChange={(value) => update({ planTierId: value })}
                >
                  <SelectTrigger
                    id="agency-plan"
                    className="border-slate-700 bg-slate-950 text-slate-200"
                  >
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.tierId} value={plan.tierId}>
                        {plan.tierId} — {plan.seats} seats · {plan.monthlyExports}{' '}
                        exports/mo · {plan.storageMb} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan ? (
                  <p className="text-xs text-slate-500">
                    {selectedPlan.seats} seats, {selectedPlan.monthlyExports} exports per
                    month, {selectedPlan.storageMb} MB storage. Limits can be overridden
                    from the agency drawer after creation.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="owner-email" className="text-slate-300">
                    Owner email
                  </Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={form.ownerEmail}
                    onChange={(event) => update({ ownerEmail: event.target.value })}
                    placeholder="owner@example.com"
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-name" className="text-slate-300">
                    Owner name <span className="text-slate-500">(optional)</span>
                  </Label>
                  <Input
                    id="owner-name"
                    value={form.ownerName}
                    maxLength={40}
                    onChange={(event) => update({ ownerName: event.target.value })}
                    placeholder="Priya Nair"
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                {!isEmail(form.ownerEmail) ? (
                  <p className="text-xs text-slate-500">
                    Enter the owner email to check the three realms before creating
                    anything.
                  </p>
                ) : previewLoading ? (
                  <p className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking personal, agency and platform accounts…
                  </p>
                ) : previewError ? (
                  <p className="text-xs text-rose-300">{previewError}</p>
                ) : preview ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          preview.personalAccount
                            ? 'border-sky-800 bg-sky-950/40 text-[10px] text-sky-300'
                            : 'border-slate-800 text-[10px] text-slate-600'
                        }
                      >
                        Personal {preview.personalAccount ? 'exists' : 'none'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          preview.platformAccount
                            ? 'border-indigo-800 bg-indigo-950/40 text-[10px] text-indigo-300'
                            : 'border-slate-800 text-[10px] text-slate-600'
                        }
                      >
                        Platform {preview.platformAccount ? 'exists' : 'none'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          preview.otherAgency
                            ? 'border-rose-900 bg-rose-950/40 text-[10px] text-rose-300'
                            : 'border-slate-800 text-[10px] text-slate-600'
                        }
                      >
                        {preview.otherAgency
                          ? `Agency: ${preview.otherAgency.workspace}`
                          : 'Agency: none'}
                      </Badge>
                    </div>

                    {preview.blocked ? (
                      <p className="text-xs text-rose-300">{preview.blockedReason}</p>
                    ) : null}

                    {preview.warnings.map((warning) => (
                      <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-200/90">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {warning}
                      </p>
                    ))}

                    {!preview.blocked && preview.warnings.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        This email has no personal, agency or platform account yet.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-800 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Billing contact (optional)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={form.contactName}
                    maxLength={120}
                    onChange={(event) => update({ contactName: event.target.value })}
                    placeholder="Billing contact name"
                    aria-label="Billing contact name"
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                  <Input
                    type="email"
                    value={form.contactEmail}
                    maxLength={160}
                    onChange={(event) => update({ contactEmail: event.target.value })}
                    placeholder="billing@example.com"
                    aria-label="Billing email"
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                  <Input
                    type="date"
                    value={form.renewalDate}
                    onChange={(event) => update({ renewalDate: event.target.value })}
                    aria-label="Renewal date"
                    className="border-slate-700 bg-slate-950 text-slate-100"
                  />
                  <Input
                    value={form.notes}
                    maxLength={2000}
                    onChange={(event) => update({ notes: event.target.value })}
                    placeholder="Notes (renewal terms, PO number…)"
                    aria-label="Billing notes"
                    className="border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Summary label="Agency" value={form.name} />
                <Summary label="Workspace" value={form.slug || 'auto'} mono />
                <Summary
                  label="Plan"
                  value={
                    selectedPlan
                      ? `${selectedPlan.tierId} — ${selectedPlan.seats} seats`
                      : form.planTierId
                  }
                />
                <Summary label="Owner" value={`${form.ownerEmail}${form.ownerName ? ` (${form.ownerName})` : ''}`} />
              </div>

              {form.contactName || form.contactEmail || form.renewalDate || form.notes ? (
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">
                    Billing
                  </p>
                  <p className="mt-1">
                    {[form.contactName, form.contactEmail].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {form.renewalDate ? <p>Renews {form.renewalDate}</p> : null}
                  {form.notes ? <p className="mt-1 text-slate-500">{form.notes}</p> : null}
                </div>
              ) : null}

              {preview?.warnings.length ? (
                <ul className="space-y-1.5 rounded-xl border border-amber-900/60 bg-amber-950/20 px-3.5 py-3 text-xs text-amber-200/90">
                  {preview.warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}

              <p className="text-xs text-slate-500">
                Creating will make a new tenant, a new agency-realm owner account (when
                this email has no account in this workspace yet) and an owner
                membership. If any step fails, the rows created by this request are
                removed.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                onClick={goBack}
                disabled={submitting}
              >
                Back
              </Button>
            ) : null}
            {step < 3 ? (
              <Button
                type="button"
                className="bg-indigo-500 text-white hover:bg-indigo-400"
                onClick={goNext}
              >
                Continue
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-indigo-500 text-white hover:bg-indigo-400"
                onClick={() => void submit()}
                disabled={submitting || preview?.blocked === true}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Provision agency
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAgencyDetail
        open={detailId !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDetailId(null);
            if (searchParams.has('agency')) {
              const nextParams = new URLSearchParams(searchParams);
              nextParams.delete('agency');
              setSearchParams(nextParams, { replace: true });
            }
          }
        }}
        agencyId={detailId}
        plans={plans}
        onChanged={() => setListReloadKey((key) => key + 1)}
      />

      <AdminTemporaryPassword
        open={credential !== null}
        onOpenChange={(next) => {
          if (!next) setCredential(null);
        }}
        email={credential?.email ?? ''}
        temporaryPassword={credential?.password ?? ''}
        workspace={credential?.workspace}
        description="The agency owner was created with this one-time password. Share it securely; it is shown once and must be changed before the workspace opens."
      />
    </div>
  );
};

const AgencyStatusPill: React.FC<{ status: 'active' | 'suspended' }> = ({ status }) => (
  <Badge
    variant="outline"
    className={
      status === 'active'
        ? 'border-emerald-800 bg-emerald-950/40 text-[10px] uppercase tracking-wide text-emerald-300'
        : 'border-rose-900 bg-rose-950/40 text-[10px] uppercase tracking-wide text-rose-300'
    }
  >
    {status}
  </Badge>
);

const Summary: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </p>
    <p
      className={`mt-0.5 break-all text-sm text-slate-200 ${
        mono ? 'font-mono text-xs' : ''
      }`}
    >
      {value}
    </p>
  </div>
);

const Point: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({
  icon,
  title,
  body,
}) => (
  <div className="space-y-1.5">
    <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
      {icon}
      {title}
    </p>
    <p className="text-xs leading-5 text-slate-500">{body}</p>
  </div>
);

export default AdminAgencies;
