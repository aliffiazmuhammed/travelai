import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  FileText,
  FileType2,
  LayoutTemplate,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Star,
  Upload,
} from 'lucide-react';
import { AgencyPageHeader } from '@/components/agency/AgencyPageHeader';
import { AgencySegmented } from '@/components/agency/AgencySegmented';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PdfLayoutMapperDialog from '@/components/agency/PdfLayoutMapperDialog';
import PdfTemplateUploadDialog, {
  type PdfTemplateDraft,
} from '@/components/agency/PdfTemplateUploadDialog';
import TemplateManagerDialog from '@/components/agency/TemplateManagerDialog';
import TemplateUploadDialog from '@/components/agency/TemplateUploadDialog';
import { useAgency } from '@/context/AgencyContext';
import {
  templateAudienceLabel,
  templateEngineLabel,
  templateSourceLabel,
  templateStatusClass,
  templateStatusLabel,
  templateVersionNumber,
} from '@/lib/templates';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyAsset,
  AgencyPdfSlotMap,
  AgencyPdfTokenOption,
  AgencyTemplate,
  AgencyTemplateAudience,
  AgencyTemplateListStatus,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const statusFilterLabel: Record<AgencyTemplateListStatus, string> = {
  all: 'All statuses',
  active: 'Active',
  draft: 'Drafts',
  archived: 'Archived',
};

/**
 * A6d: the tenant template gallery. Every member can see active client
 * templates; owners and admins manage uploads, versions, defaults and archive.
 * Template sources and asset snapshots remain private on the server.
 */
const AgencyTemplates: React.FC = () => {
  const { activeAgencyId, canManage } = useAgency();

  const [templates, setTemplates] = useState<AgencyTemplate[]>([]);
  const [assets, setAssets] = useState<AgencyAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<AgencyTemplateListStatus>('all');
  const [audienceFilter, setAudienceFilter] = useState<
    'all' | AgencyTemplateAudience
  >('all');
  const [manageId, setManageId] = useState<string | null>(null);
  const [uploadChoiceOpen, setUploadChoiceOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pdfUploadOpen, setPdfUploadOpen] = useState(false);
  const [pdfDraft, setPdfDraft] = useState<PdfTemplateDraft | null>(null);
  const [pdfTokens, setPdfTokens] = useState<AgencyPdfTokenOption[]>([]);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [defaultingId, setDefaultingId] = useState<string | null>(null);
  const requestRef = useRef(0);

  const loadTemplates = useCallback(
    async (showSpinner = true) => {
      if (!activeAgencyId) return;
      const requestId = ++requestRef.current;
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const result = await api.getAgencyTemplates(
          activeAgencyId,
          canManage ? { status: 'all' } : undefined
        );
        if (requestId === requestRef.current) {
          setTemplates(result.templates ?? []);
        }
      } catch (err) {
        if (requestId === requestRef.current) {
          setTemplates([]);
          setError(
            errorMessage(err, 'We could not load the template gallery.')
          );
        }
      } finally {
        if (showSpinner && requestId === requestRef.current) {
          setLoading(false);
        }
      }
    },
    [activeAgencyId, canManage]
  );

  useEffect(() => {
    setTemplates([]);
    setManageId(null);
    setUploadOpen(false);
    if (!activeAgencyId) {
      setLoading(false);
      return;
    }
    void loadTemplates(true);
  }, [activeAgencyId, loadTemplates]);

  useEffect(() => {
    return () => {
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!activeAgencyId || !canManage) {
      setAssets([]);
      setAssetsLoading(false);
      return;
    }
    let cancelled = false;
    setAssetsLoading(true);
    api
      .getAgencyAssets(activeAgencyId)
      .then((result) => {
        if (!cancelled) setAssets(result.assets ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAssets([]);
        toast.error(
          errorMessage(err, 'We could not load the brand asset library.')
        );
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId, canManage]);

  const updateTemplate = useCallback((updated: AgencyTemplate) => {
    setTemplates((prev) =>
      prev.map((template) =>
        template._id === updated._id ? updated : template
      )
    );
  }, []);

  const refreshTemplates = useCallback(async () => {
    await loadTemplates(false);
  }, [loadTemplates]);

  const visibleTemplates = useMemo(() => {
    if (!canManage) return templates;
    return templates.filter((template) => {
      if (statusFilter !== 'all' && template.status !== statusFilter) {
        return false;
      }
      if (
        audienceFilter !== 'all' &&
        template.audience !== audienceFilter
      ) {
        return false;
      }
      return true;
    });
  }, [templates, canManage, statusFilter, audienceFilter]);

  const managingTemplate =
    templates.find((template) => template._id === manageId) ?? null;

  const startPdfUpload = async (draft: PdfTemplateDraft) => {
    if (!activeAgencyId) return;
    const catalog = await api.getAgencyPdfTokenCatalog(
      activeAgencyId,
      draft.audience
    );
    setPdfTokens(catalog.tokens ?? []);
    setPdfDraft(draft);
    setPdfUploadOpen(false);
  };

  const savePdfTemplate = async (slotMap: AgencyPdfSlotMap) => {
    if (!activeAgencyId || !pdfDraft) return;
    setPdfSaving(true);
    try {
      const result = await api.createAgencyPdfTemplate(activeAgencyId, {
        file: pdfDraft.file,
        name: pdfDraft.name,
        description: pdfDraft.description,
        audience: pdfDraft.audience,
        slotMap,
        assets: pdfDraft.assets,
      });
      toast.success(
        result.message || 'Template uploaded as a draft. Preview it next.'
      );
      setPdfDraft(null);
      await loadTemplates(false);
      setManageId(result.template._id);
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not save that PDF template.')
      );
    } finally {
      setPdfSaving(false);
    }
  };

  const makeDefault = async (template: AgencyTemplate) => {
    if (!activeAgencyId) return;
    setDefaultingId(template._id);
    try {
      await api.setDefaultAgencyTemplate(activeAgencyId, template._id);
      await refreshTemplates();
      toast.success('Default updated for this audience.');
    } catch (err) {
      toast.error(
        errorMessage(err, 'We could not make this the default template.')
      );
    } finally {
      setDefaultingId(null);
    }
  };

  const chooseUpload = (kind: 'html' | 'pdf') => {
    setUploadChoiceOpen(false);
    if (kind === 'html') setUploadOpen(true);
    else setPdfUploadOpen(true);
  };

  if (!activeAgencyId) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Create or join an agency to manage proposal templates.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <AgencyPageHeader
        title="Templates"
        meta={
          <Badge variant="outline" className="text-[10px]">
            {visibleTemplates.length}{' '}
            {visibleTemplates.length === 1 ? 'template' : 'templates'}
          </Badge>
        }
        description="Branded proposal layouts for every trip. Exports pin the template version and quote they used, so later changes never rewrite an existing document."
        actions={
          canManage ? (
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => setUploadChoiceOpen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Upload template
            </Button>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] text-slate-500"
            >
              <Lock className="h-3 w-3" />
              Read-only
            </Badge>
          )
        }
      />

      {canManage ? (
        <div className="flex flex-wrap items-center gap-2">
          <AgencySegmented
            ariaLabel="Template status"
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(value as AgencyTemplateListStatus)
            }
            options={(
              Object.keys(statusFilterLabel) as AgencyTemplateListStatus[]
            ).map((status) => ({
              value: status,
              label: statusFilterLabel[status],
            }))}
          />
          <AgencySegmented
            ariaLabel="Template audience"
            value={audienceFilter}
            onChange={(value) =>
              setAudienceFilter(value as 'all' | AgencyTemplateAudience)
            }
            options={
              [
                { value: 'all', label: 'All audiences' },
                { value: 'client', label: 'Clients' },
                { value: 'internal', label: 'Internal' },
              ] as Array<{ value: 'all' | AgencyTemplateAudience; label: string }>
            }
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadTemplates(true)}
            title="Reload templates"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            You can use active client templates in proposal exports. Uploading,
            previewing, activating and archiving templates is limited to owners
            and admins.
          </span>
        </div>
      )}

      {loading ? (
        <Card className="rounded-xl border-slate-200 dark:border-slate-800">
          <CardContent className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading templates...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="rounded-xl border-rose-200 dark:border-rose-900/60">
          <CardContent className="space-y-3 py-14 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-500" />
            <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadTemplates(true)}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : visibleTemplates.length === 0 ? (
        <Card className="rounded-xl border-dashed border-slate-300 dark:border-slate-700">
          <CardContent className="space-y-3 py-16 text-center">
            <LayoutTemplate className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium">
              {templates.length === 0
                ? 'No templates yet'
                : 'No templates match these filters'}
            </p>
            <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
              {templates.length === 0
                ? canManage
                  ? 'Upload a self-contained HTML template, or keep your own PDF design and map TravelAI data onto it.'
                  : 'Built-in and custom templates will appear here once an admin makes them active.'
                : 'Try another status or audience filter.'}
            </p>
            {canManage && templates.length === 0 ? (
              <Button
                className="bg-teal-600 hover:bg-teal-700"
                size="sm"
                onClick={() => setUploadChoiceOpen(true)}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Upload template
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTemplates.map((template) => {
            const version = templateVersionNumber(template);
            const internal = template.audience === 'internal';
            return (
              <Card
                key={template._id}
                className="flex rounded-xl border-slate-200 dark:border-slate-800"
              >
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-2xl',
                        internal
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          : 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                      )}
                    >
                      {internal ? (
                        <ShieldAlert className="h-5 w-5" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h2 className="text-sm font-semibold">
                          {template.name}
                        </h2>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px]',
                            templateStatusClass(template.status)
                          )}
                        >
                          {templateStatusLabel(template.status)}
                        </Badge>
                        {template.isDefault ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-[9px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          >
                            <Star className="mr-1 h-2.5 w-2.5" />
                            Default
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {template.description ||
                          (internal
                            ? 'Desk copy with internal estimates.'
                            : 'Client-facing proposal document.')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px]">
                      {templateAudienceLabel(template.audience)}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      {templateSourceLabel(template)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px]',
                        template.engine === 'pdf-background'
                          ? 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300'
                          : undefined
                      )}
                    >
                      {templateEngineLabel(template)}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      v{version}
                    </Badge>
                    {template.status === 'active' && template.activeVersion ? (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        active version
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                    {canManage && !template.builtinKey ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setManageId(template._id)}
                      >
                        Manage
                      </Button>
                    ) : null}
                    {canManage &&
                    template.status === 'active' &&
                    !template.isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void makeDefault(template)}
                        disabled={defaultingId === template._id}
                      >
                        {defaultingId === template._id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Star className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Set default
                      </Button>
                    ) : null}
                    {canManage && template.builtinKey ? (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Managed by TravelAI
                      </span>
                    ) : null}
                    {!canManage ? (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <Lock className="h-3 w-3" />
                        Read-only
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canManage ? (
        <>
          <Dialog open={uploadChoiceOpen} onOpenChange={setUploadChoiceOpen}>
            <DialogContent className="rounded-3xl sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Upload a template</DialogTitle>
                <DialogDescription>
                  Bring your own design and map TravelAI data onto it. Both
                  kinds export as proposal documents.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => chooseUpload('html')}
                  className="flex w-full items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50 dark:border-teal-900/60 dark:bg-teal-950/30 dark:hover:border-teal-700 dark:hover:bg-teal-950/50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-600 text-white">
                    <Code2 className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      HTML template
                    </span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                      A self-contained styled page. Edit the source in-app at
                      any time.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => chooseUpload('pdf')}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-accent/50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                    <FileType2 className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                      PDF design
                    </span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">
                      Keep the agency's own PDF and map data slots onto it
                      visually.
                    </span>
                  </span>
                </button>
              </div>
            </DialogContent>
          </Dialog>
          <TemplateUploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            agencyId={activeAgencyId}
            assets={assets}
            assetsLoading={assetsLoading}
            onSaved={async (result) => {
              setUploadOpen(false);
              await loadTemplates(false);
              setManageId(result.template._id);
            }}
          />
          <PdfTemplateUploadDialog
            open={pdfUploadOpen}
            onOpenChange={setPdfUploadOpen}
            assets={assets}
            assetsLoading={assetsLoading}
            onContinue={startPdfUpload}
          />
          {pdfDraft ? (
            <PdfLayoutMapperDialog
              open
              onOpenChange={(next) => {
                if (!next && !pdfSaving) setPdfDraft(null);
              }}
              pdfSource={pdfDraft.file}
              audience={pdfDraft.audience}
              tokens={pdfTokens}
              saving={pdfSaving}
              saveLabel="Save template"
              title={`Map data slots · ${pdfDraft.name}`}
              description="Add text and image boxes over the agency design, bind each one to a TravelAI field, and mark the page that should repeat for each itinerary day."
              onSave={savePdfTemplate}
            />
          ) : null}
          {managingTemplate ? (
            <TemplateManagerDialog
              open
              onOpenChange={(next) => {
                if (!next) setManageId(null);
              }}
              agencyId={activeAgencyId}
              template={managingTemplate}
              assets={assets}
              assetsLoading={assetsLoading}
              onTemplateChanged={updateTemplate}
              onRefreshTemplates={refreshTemplates}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default AgencyTemplates;
