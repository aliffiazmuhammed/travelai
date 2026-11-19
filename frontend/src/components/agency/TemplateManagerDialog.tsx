import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Eye,
  LayoutPanelLeft,
  Loader2,
  RefreshCw,
  Save,
  Star,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDestructive } from '@/components/ui/confirm-destructive';
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
import { formatAgencyDate } from '@/lib/agency';
import {
  templateAudienceLabel,
  templateEngineLabel,
  templateStatusClass,
  templateStatusLabel,
  templateSupportsLayoutEdit,
} from '@/lib/templates';
import { cn } from '@/lib/utils';
import { api } from '@/services/api';
import type {
  AgencyAsset,
  AgencyTemplate,
  AgencyTemplateVersion,
} from '@/types';
import { toast } from 'sonner';
import PdfTemplateLayoutEditorDialog from './PdfTemplateLayoutEditorDialog';
import TemplatePreviewDialog from './TemplatePreviewDialog';
import TemplateSourceEditorDialog from './TemplateSourceEditorDialog';
import TemplateUploadDialog from './TemplateUploadDialog';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TemplateManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  template: AgencyTemplate;
  assets: AgencyAsset[];
  assetsLoading?: boolean;
  onTemplateChanged: (template: AgencyTemplate) => void;
  onRefreshTemplates: () => void | Promise<void>;
}

/**
 * A6d: the custom-template lifecycle. Details can be renamed, versions can be
 * uploaded, previewed and activated, and a template can be archived without
 * affecting exports already pinned to it. The audience default is set from the
 * gallery card instead.
 */
const TemplateManagerDialog: React.FC<TemplateManagerDialogProps> = ({
  open,
  onOpenChange,
  agencyId,
  template,
  assets,
  assetsLoading = false,
  onTemplateChanged,
  onRefreshTemplates,
}) => {
  const [versions, setVersions] = useState<AgencyTemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [detailsName, setDetailsName] = useState(template.name);
  const [detailsDescription, setDetailsDescription] = useState(
    template.description ?? ''
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewVersionNumber, setPreviewVersionNumber] = useState<
    number | null
  >(null);
  const [editVersionNumber, setEditVersionNumber] = useState<number | null>(
    null
  );
  const [layoutVersionNumber, setLayoutVersionNumber] = useState<number | null>(
    null
  );
  const isPdfDesign = templateSupportsLayoutEdit(template);

  const loadVersions = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setVersionsLoading(true);
      setVersionsError(null);
      try {
        const result = await api.getAgencyTemplateVersions(
          agencyId,
          template._id
        );
        setVersions(result.versions ?? []);
        if (result.template) onTemplateChanged(result.template);
      } catch (error) {
        setVersions([]);
        setVersionsError(
          errorMessage(error, 'We could not load this template history.')
        );
      } finally {
        if (showSpinner) setVersionsLoading(false);
      }
    },
    [agencyId, template._id, onTemplateChanged]
  );

  useEffect(() => {
    if (!open) return;
    void loadVersions(true);
  }, [open, loadVersions]);

  useEffect(() => {
    if (!open) return;
    setDetailsName(template.name);
    setDetailsDescription(template.description ?? '');
  }, [open, template._id, template.name, template.description]);

  useEffect(() => {
    if (!open) {
      setUploadOpen(false);
      setPreviewVersionNumber(null);
      setEditVersionNumber(null);
      setLayoutVersionNumber(null);
    }
  }, [open]);

  const previewVersion =
    previewVersionNumber === null
      ? null
      : versions.find((version) => version.version === previewVersionNumber) ??
        null;

  const editVersion =
    editVersionNumber === null
      ? null
      : versions.find((version) => version.version === editVersionNumber) ??
        null;

  const layoutVersion =
    layoutVersionNumber === null
      ? null
      : versions.find((version) => version.version === layoutVersionNumber) ??
        null;

  const saveDetails = async () => {
    const name = detailsName.trim();
    if (name.length < 2) {
      toast.error('Give this template a name.');
      return;
    }
    const payload: { name?: string; description?: string } = {};
    if (name !== template.name) payload.name = name;
    if (detailsDescription.trim() !== (template.description ?? '')) {
      payload.description = detailsDescription.trim();
    }
    if (Object.keys(payload).length === 0) {
      toast.info('No changes to save.');
      return;
    }

    setSavingDetails(true);
    try {
      const result = await api.updateAgencyTemplate(
        agencyId,
        template._id,
        payload
      );
      onTemplateChanged(result.template);
      toast.success('Template details saved.');
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not save those template details.')
      );
    } finally {
      setSavingDetails(false);
    }
  };

  const activateVersion = async (version: AgencyTemplateVersion) => {
    setBusyAction(`activate-${version.version}`);
    try {
      const result = await api.activateAgencyTemplateVersion(
        agencyId,
        template._id,
        version.version
      );
      onTemplateChanged(result.template);
      await loadVersions(false);
      toast.success(`Version ${version.version} is now active.`);
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not activate that template version.')
      );
    } finally {
      setBusyAction(null);
    }
  };

  const archive = async () => {
    setBusyAction('archive');
    try {
      await api.archiveAgencyTemplate(agencyId, template._id);
      toast.success('Template archived. Existing exports are unchanged.');
      setArchiveOpen(false);
      onOpenChange(false);
      await onRefreshTemplates();
    } catch (error) {
      toast.error(errorMessage(error, 'We could not archive that template.'));
    } finally {
      setBusyAction(null);
    }
  };

  const busy = busyAction !== null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy && !savingDetails) onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {template.name}
              <Badge
                variant="outline"
                className={cn('text-xs', templateStatusClass(template.status))}
              >
                {templateStatusLabel(template.status)}
              </Badge>
              {template.isDefault ? (
                <Badge
                  variant="outline"
                  className="border-warning/30 bg-warning/10 text-xs text-warning-ink dark:border-warning/40 dark:bg-warning/20"
                >
                  <Star className="mr-1 h-2.5 w-2.5" />
                  Default
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {templateAudienceLabel(template.audience)} template ·{' '}
              {templateEngineLabel(template)} · version{' '}
              {template.activeVersion ?? template.version} ·{' '}
              {template.builtinKey ? 'Built-in' : 'Custom template'}
            </DialogDescription>
          </DialogHeader>

          {template.status === 'archived' ? (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning-ink dark:border-warning/20 dark:bg-warning/30">
              <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Archived templates cannot be chosen for new exports. Activate a
                previewed version below to restore it.
              </span>
            </div>
          ) : template.status === 'draft' ? (
            <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 p-2.5 text-xs text-info-ink dark:border-info/20 dark:bg-info/30">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                This template is a draft. Preview a version against a real trip,
                then activate it for new exports.
              </span>
            </div>
          ) : null}

          <div className="space-y-2 rounded-2xl border border-border p-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manager-template-name">Name</Label>
                <Input
                  id="manager-template-name"
                  value={detailsName}
                  onChange={(event) => setDetailsName(event.target.value)}
                  maxLength={80}
                  disabled={savingDetails}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="manager-template-description">
                  Description
                </Label>
                <Textarea
                  id="manager-template-description"
                  value={detailsDescription}
                  onChange={(event) =>
                    setDetailsDescription(event.target.value)
                  }
                  rows={2}
                  maxLength={240}
                  disabled={savingDetails}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveDetails()}
                disabled={savingDetails || busy}
              >
                {savingDetails ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save details
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Versions</h3>
                <p className="text-xs text-muted-foreground">
                  Versions are immutable.{' '}
                  {isPdfDesign
                    ? 'Saving a layout creates a new version;'
                    : 'Edit HTML saves a new version;'}{' '}
                  exports pin the version they used.
                </p>
              </div>
              {!isPdfDesign ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUploadOpen(true)}
                  disabled={busy || template.status === 'archived'}
                  title={
                    template.status === 'archived'
                      ? 'Activate a version to restore this template before uploading a new one.'
                      : undefined
                  }
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload version
                </Button>
              ) : null}
            </div>

            {versionsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading versions...
              </div>
            ) : versionsError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive-ink dark:border-destructive/20 dark:bg-destructive/30">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {versionsError}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadVersions(true)}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : versions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                No versions yet.
              </p>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => {
                  const activating =
                    busyAction === `activate-${version.version}`;
                  const isLive =
                    version.active && template.status !== 'archived';
                  return (
                    <div
                      key={version.version}
                      className="rounded-2xl border border-border p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="text-xs">
                              v{version.version}
                            </Badge>
                            {isLive ? (
                              <Badge
                                variant="outline"
                                className="border-agency-accent/30 bg-agency-accent-soft text-xs text-agency-accent-ink"
                              >
                                <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                                Active
                              </Badge>
                            ) : null}
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                version.previewedAt
                                  ? 'border-info/30 bg-info/10 text-info-ink dark:border-info/40 dark:bg-info/20'
                                  : 'border-border text-muted-foreground'
                              )}
                            >
                              {version.previewedAt
                                ? 'Previewed'
                                : 'Not previewed'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {version.pageCount}{' '}
                            {version.pageCount === 1 ? 'page' : 'pages'}
                            {version.sourceBytes
                              ? ` · ${formatBytes(version.sourceBytes)}`
                              : ''}
                            {' · uploaded '}
                            {formatAgencyDate(version.createdAt)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {version.previewedAt
                              ? `Previewed ${formatAgencyDate(version.previewedAt)} against a real trip.`
                              : 'Preview this version against a real trip to unlock activation.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isPdfDesign ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setLayoutVersionNumber(version.version)
                              }
                              disabled={busy || template.status === 'archived'}
                              title={
                                template.status === 'archived'
                                  ? 'Restore this template before editing its layout.'
                                  : 'Move data boxes on this PDF design and save a new version.'
                              }
                            >
                              <LayoutPanelLeft className="mr-1.5 h-3.5 w-3.5" />
                              Edit layout
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setEditVersionNumber(version.version)
                              }
                              disabled={busy || template.status === 'archived'}
                              title={
                                template.status === 'archived'
                                  ? 'Restore this template before editing its source.'
                                  : 'Edit this HTML and save it as a new version.'
                              }
                            >
                              <Code2 className="mr-1.5 h-3.5 w-3.5" />
                              Edit HTML
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPreviewVersionNumber(version.version)
                            }
                            disabled={busy}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            className="bg-agency-accent hover:bg-agency-accent/90"
                            onClick={() => void activateVersion(version)}
                            disabled={busy || isLive || !version.previewedAt}
                            title={
                              !version.previewedAt
                                ? 'Preview this version first.'
                                : version.active && template.status === 'archived'
                                  ? 'Restore this template for new exports.'
                                  : undefined
                            }
                          >
                            {activating ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {isLive
                              ? 'Active version'
                              : version.active
                                ? 'Restore version'
                                : 'Activate'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex-wrap items-center justify-between gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {template.status !== 'archived' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive-ink hover:text-destructive-ink"
                  onClick={() => setArchiveOpen(true)}
                  disabled={busy || savingDetails}
                >
                  {busyAction === 'archive' ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Archive className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Archive
                </Button>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={busy || savingDetails}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        agencyId={agencyId}
        assets={assets}
        assetsLoading={assetsLoading}
        template={template}
        onSaved={async (result) => {
          setUploadOpen(false);
          onTemplateChanged(result.template);
          await onRefreshTemplates();
          await loadVersions(false);
        }}
      />

      {previewVersion ? (
        <TemplatePreviewDialog
          open={previewVersionNumber !== null}
          onOpenChange={(next) => {
            if (!next) setPreviewVersionNumber(null);
          }}
          agencyId={agencyId}
          template={template}
          version={previewVersion}
          onPreviewed={() => loadVersions(false)}
        />
      ) : null}

      {editVersion ? (
        <TemplateSourceEditorDialog
          open
          onOpenChange={(next) => {
            if (!next) setEditVersionNumber(null);
          }}
          agencyId={agencyId}
          template={template}
          version={editVersion}
          onSaved={async (result) => {
            setEditVersionNumber(null);
            onTemplateChanged(result.template);
            await onRefreshTemplates();
            await loadVersions(false);
          }}
        />
      ) : null}

      {layoutVersion ? (
        <PdfTemplateLayoutEditorDialog
          open
          onOpenChange={(next) => {
            if (!next) setLayoutVersionNumber(null);
          }}
          agencyId={agencyId}
          template={template}
          version={layoutVersion}
          onSaved={async (result) => {
            setLayoutVersionNumber(null);
            onTemplateChanged(result.template);
            await onRefreshTemplates();
            await loadVersions(false);
          }}
        />
      ) : null}

      <ConfirmDestructive
        open={archiveOpen}
        onOpenChange={(next) => {
          if (!next && busyAction === 'archive') return;
          setArchiveOpen(next);
        }}
        tone="warning"
        icon={Archive}
        title={`Archive “${template.name}”?`}
        description="Existing exports keep their pinned version, but this template can no longer be chosen for new exports. Archiving cannot be undone."
        confirmLabel="Archive template"
        onConfirm={archive}
        busy={busyAction === 'archive'}
        detail={`Version ${template.version} · ${templateStatusLabel(template.status)}`}
      />
    </>
  );
};

export default TemplateManagerDialog;
