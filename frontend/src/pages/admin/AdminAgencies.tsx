import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { AdminEmptyState, AdminLoadingPanel } from '@/components/admin/AdminEmptyState';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminSegmented } from '@/components/admin/AdminSegmented';
import {
  AdminTableFrame,
  adminTableHeadClass,
  adminTableRowClass,
} from '@/components/admin/AdminTableFrame';
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
import AdminTemporaryPassword from './AdminTemporaryPassword';
import {
  AgencyStatusBadge,
  formatAdminDate,
  TierBadge,
} from './accountMeta';

/**
 * `/admin/agencies` (PA3/PA4).
 *
 * Provisioning a tenant creates three separate rows: the Agency, the owner's
 * agency-realm account, and the owner membership. The directory below lists
 * identity/plan metadata only and links into the record page for lifecycle,
 * plan, member and audit operations. Nothing here converts a personal or
 * platform account, and no tenant content is read.
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [plans, setPlans] = useState<PlatformPlanTier[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [list, setList] = useState<PlatformAgencyList | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listReloadKey, setListReloadKey] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlatformAgencyStatusFilter>('all');
  const [profileFilter, setProfileFilter] = useState<PlatformAgencyProfileFilter>('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<ProvisionForm>(emptyForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [preview, setPreview] = useState<PlatformOwnerPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [provisioned, setProvisioned] = useState<PlatformProvisionResult | null>(null);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
    workspace: string;
  } | null>(null);

  // Old audit links pointed at `?agency=<id>`; the record is a page now.
  useEffect(() => {
    const legacy = searchParams.get('agency');
    if (legacy) {
      navigate(`/admin/agencies/${encodeURIComponent(legacy)}`, { replace: true });
    }
  }, [searchParams, navigate]);

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

  // `?provision=1` from the console jump menu opens the wizard directly.
  const requestedProvision = searchParams.get('provision');
  useEffect(() => {
    if (requestedProvision !== '1') return;
    openWizard();
    setSearchParams(
      (params) => {
        const copy = new URLSearchParams(params);
        copy.delete('provision');
        return copy;
      },
      { replace: true }
    );
    // Opening the wizard is a one-shot read of the URL, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedProvision]);

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

  const counts = list?.counts;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Agencies"
        description="Provision a paying tenant and hand its owner a separate agency login. No personal account is converted or attached."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full px-3 text-xs"
              onClick={() => setListReloadKey((key) => key + 1)}
              disabled={listLoading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`}
                aria-hidden
              />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5 rounded-full bg-indigo-500 px-3 text-xs text-white hover:bg-indigo-400"
              onClick={openWizard}
              disabled={plans.length === 0}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Provision agency
            </Button>
          </>
        }
      />

      {plansError ? (
        <AdminNotice tone="error" title="Plan tiers did not load">
          Provisioning is disabled until tiers are available. {plansError}
        </AdminNotice>
      ) : null}

      {provisioned ? (
        <AdminNotice
          tone="success"
          title={`${provisioned.agency.name} is live`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-indigo-500 px-3 text-xs text-white hover:bg-indigo-400"
              >
                <Link
                  to={`/agency/login?workspace=${encodeURIComponent(provisioned.agency.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Workspace login
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-full px-3 text-xs"
              >
                <Link to={`/admin/agencies/${provisioned.agency._id}`}>Open record</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setProvisioned(null)}
              >
                Dismiss
              </Button>
            </div>
          }
        >
          <div className="space-y-1.5">
            <p>
              {provisioned.owner.created
                ? 'The owner account was created in the agency realm with a one-time password.'
                : 'An existing workspace account for this tenant was attached as owner.'}
            </p>
            <p className="font-mono text-[11px]">
              {provisioned.agency.slug} · {provisioned.owner.email} ·{' '}
              {provisioned.agency.plan.tierId}
            </p>
            {provisioned.warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4">
                {provisioned.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </AdminNotice>
      ) : null}

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AdminSegmented
          ariaLabel="Filter agencies by status"
          value={statusFilter}
          options={[
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'active', label: 'Active', count: counts?.active },
            { value: 'suspended', label: 'Suspended', count: counts?.suspended },
          ]}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, slug or billing"
              aria-label="Search agencies"
              className="h-9 w-full rounded-full pl-9 text-sm sm:w-60"
            />
          </div>
          <Select
            value={profileFilter}
            onValueChange={(value) => {
              setProfileFilter(value as PlatformAgencyProfileFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36 rounded-full" aria-label="Filter by directory state">
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
            <SelectTrigger className="h-9 w-32 rounded-full" aria-label="Filter by plan">
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
        </div>
      </div>

      {listError ? (
        <AdminNotice tone="error" title="The agency directory did not load">
          {listError}
        </AdminNotice>
      ) : null}

      <AdminTableFrame
        title="All agencies"
        description="Open a tenant for plan, members, public-directory state and audit."
        minWidth="940px"
        footer={
          <AdminPagination
            page={list?.page ?? page}
            totalPages={list?.totalPages ?? 1}
            total={list?.total}
            noun="tenant"
            loading={listLoading}
            onChange={setPage}
          />
        }
      >
        <thead>
          <tr>
            <th className={adminTableHeadClass}>Agency</th>
            <th className={adminTableHeadClass}>Status</th>
            <th className={adminTableHeadClass}>Owner</th>
            <th className={adminTableHeadClass}>Plan</th>
            <th className={adminTableHeadClass}>Members</th>
            <th className={adminTableHeadClass}>Renewal</th>
            <th className={adminTableHeadClass}>Last activity</th>
            <th className={`${adminTableHeadClass} text-right`}>Open</th>
          </tr>
        </thead>
        <tbody>
          {listLoading && (list?.agencies.length ?? 0) === 0 ? (
            <tr>
              <td colSpan={8}>
                <AdminLoadingPanel label="Loading agencies…" />
              </td>
            </tr>
          ) : (list?.agencies.length ?? 0) === 0 ? (
            <tr>
              <td colSpan={8}>
                <AdminEmptyState
                  icon={Building2}
                  title={
                    search || statusFilter !== 'all' || planFilter !== 'all'
                      ? 'No agencies match these filters'
                      : 'No agencies yet'
                  }
                  description={
                    search || statusFilter !== 'all' || planFilter !== 'all'
                      ? 'Try a different status, plan or search term.'
                      : 'Provision the first tenant to get started.'
                  }
                />
              </td>
            </tr>
          ) : (
            list!.agencies.map((agency) => (
              <tr key={agency._id} className={adminTableRowClass}>
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/agencies/${agency._id}`}
                    className="group block rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="block font-medium group-hover:text-indigo-300 group-hover:underline group-hover:underline-offset-2">
                      {agency.name}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {agency.slug}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AgencyStatusBadge status={agency.status} />
                </td>
                <td className="px-4 py-3">
                  <p className="break-all text-xs">{agency.owner?.email ?? 'No owner'}</p>
                  {agency.ownerCount > 1 ? (
                    <p className="text-[11px] text-muted-foreground">
                      +{agency.ownerCount - 1} more owner{agency.ownerCount - 1 === 1 ? '' : 's'}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <TierBadge tier={agency.plan.tierId} />
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {agency.plan.seats} seats · {agency.plan.monthlyExports} exports
                  </p>
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">
                  {agency.memberCount} / {agency.plan.seats}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatAdminDate(agency.billing?.renewalDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {formatAdminDate(agency.lastActivityAt)}
                  <p className="mt-0.5 text-[11px]">
                    Created {formatAdminDate(agency.createdAt)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Link to={`/admin/agencies/${agency._id}`}>
                        Manage
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableFrame>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!submitting) setOpen(next);
        }}
      >
        <DialogContent className="dark max-h-[88vh] overflow-y-auto rounded-2xl border-border bg-card text-card-foreground sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/15 text-indigo-300">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
              Provision agency
            </DialogTitle>
            <DialogDescription>
              Step {step} of 3 —{' '}
              {step === 1 ? 'tenant details' : step === 2 ? 'owner access' : 'review and create'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2" aria-hidden>
            {[1, 2, 3].map((value) => (
              <div
                key={value}
                className={`h-1.5 flex-1 rounded-full ${
                  value <= step ? 'bg-indigo-500' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {formError ? <AdminNotice tone="error">{formError}</AdminNotice> : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agency-name">Agency name</Label>
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
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency-slug">Workspace slug</Label>
                <Input
                  id="agency-slug"
                  value={form.slug}
                  maxLength={40}
                  onChange={(event) => {
                    setSlugEdited(true);
                    update({ slug: event.target.value.toLowerCase() });
                  }}
                  placeholder="auto from the name"
                  className="h-10 font-mono text-sm"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Permanent login handle: {form.slug || 'generated on create'} ·{' '}
                  <code className="rounded bg-muted px-1 py-0.5">
                    /agency/login?workspace={form.slug || '…'}
                  </code>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agency-plan">Plan</Label>
                <Select
                  value={form.planTierId}
                  onValueChange={(value) => update({ planTierId: value })}
                >
                  <SelectTrigger id="agency-plan" className="h-10">
                    <SelectValue placeholder="Choose a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.tierId} value={plan.tierId}>
                        {plan.tierId} — {plan.seats} seats · {plan.monthlyExports} exports/mo ·{' '}
                        {plan.storageMb} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {selectedPlan.seats} seats, {selectedPlan.monthlyExports} exports per
                    month, {selectedPlan.storageMb} MB storage. Limits can be overridden from
                    the record page after creation.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="owner-email">Owner email</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={form.ownerEmail}
                    onChange={(event) => update({ ownerEmail: event.target.value })}
                    placeholder="owner@example.com"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-name">
                    Owner name <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="owner-name"
                    value={form.ownerName}
                    maxLength={40}
                    onChange={(event) => update({ ownerName: event.target.value })}
                    placeholder="Priya Nair"
                    className="h-10"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3">
                {!isEmail(form.ownerEmail) ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    Enter the owner email to check the three realms before creating anything.
                  </p>
                ) : previewLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Checking personal, agency and platform accounts…
                  </p>
                ) : previewError ? (
                  <AdminNotice tone="error">{previewError}</AdminNotice>
                ) : preview ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RealmChip
                        label={`Personal ${preview.personalAccount ? 'exists' : 'none'}`}
                        tone={preview.personalAccount ? 'sky' : 'muted'}
                      />
                      <RealmChip
                        label={`Platform ${preview.platformAccount ? 'exists' : 'none'}`}
                        tone={preview.platformAccount ? 'indigo' : 'muted'}
                      />
                      <RealmChip
                        label={
                          preview.otherAgency
                            ? `Agency: ${preview.otherAgency.workspace}`
                            : 'Agency: none'
                        }
                        tone={preview.otherAgency ? 'rose' : 'muted'}
                      />
                    </div>

                    {preview.blocked ? (
                      <p className="text-xs text-rose-300">{preview.blockedReason}</p>
                    ) : null}

                    {preview.warnings.map((warning) => (
                      <p key={warning} className="text-xs leading-5 text-amber-200/90">
                        {warning}
                      </p>
                    ))}

                    {!preview.blocked && preview.warnings.length === 0 ? (
                      <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        This email has no personal, agency or platform account yet.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  Billing contact (optional)
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={form.contactName}
                    maxLength={120}
                    onChange={(event) => update({ contactName: event.target.value })}
                    placeholder="Billing contact name"
                    aria-label="Billing contact name"
                    className="h-9"
                  />
                  <Input
                    type="email"
                    value={form.contactEmail}
                    maxLength={160}
                    onChange={(event) => update({ contactEmail: event.target.value })}
                    placeholder="billing@example.com"
                    aria-label="Billing email"
                    className="h-9"
                  />
                  <Input
                    type="date"
                    value={form.renewalDate}
                    onChange={(event) => update({ renewalDate: event.target.value })}
                    aria-label="Renewal date"
                    className="h-9"
                  />
                  <Input
                    value={form.notes}
                    maxLength={2000}
                    onChange={(event) => update({ notes: event.target.value })}
                    placeholder="Notes (renewal terms, PO number…)"
                    aria-label="Billing notes"
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-2">
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
                <Summary
                  label="Owner"
                  value={`${form.ownerEmail}${form.ownerName ? ` (${form.ownerName})` : ''}`}
                />
              </div>

              {form.contactName || form.contactEmail || form.renewalDate || form.notes ? (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5">
                  <p className="font-semibold text-muted-foreground">Billing</p>
                  <p className="mt-1">
                    {[form.contactName, form.contactEmail].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {form.renewalDate ? <p>Renews {form.renewalDate}</p> : null}
                  {form.notes ? (
                    <p className="mt-1 text-muted-foreground">{form.notes}</p>
                  ) : null}
                </div>
              ) : null}

              {preview?.warnings.length ? (
                <AdminNotice tone="warning" title="Before you create this tenant">
                  <ul className="list-disc space-y-1 pl-4">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AdminNotice>
              ) : null}

              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Creating makes a tenant, a new agency-realm owner account (when this email
                has no account in this workspace yet) and an owner membership. If any step
                fails, the rows created by this request are removed.
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {step > 1 ? (
              <Button
                type="button"
                variant="outline"
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
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Provision agency
              </Button>
            )}
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
        description="The agency owner was created with this one-time password. Share it securely; it is shown once and must be changed before the workspace opens."
      />
    </div>
  );
};

const RealmChip: React.FC<{
  label: string;
  tone: 'sky' | 'indigo' | 'rose' | 'muted';
}> = ({ label, tone }) => {
  const tones: Record<'sky' | 'indigo' | 'rose' | 'muted', string> = {
    sky: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
    indigo: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
    rose: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
    muted: 'border-border text-muted-foreground',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}
    >
      {label}
    </span>
  );
};

const Summary: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p
      className={`mt-0.5 break-all text-sm text-foreground/90 ${mono ? 'font-mono text-xs' : ''}`}
    >
      {value}
    </p>
  </div>
);

export default AdminAgencies;
