import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import TemplateAssetMapping, {
  trimAssetSelection,
  validateAssetSelection,
} from '@/components/agency/TemplateAssetMapping';
import { TEMPLATE_SOURCE_MAX_BYTES } from '@/lib/templates';
import { api } from '@/services/api';
import type {
  AgencyAsset,
  AgencyTemplate,
  AgencyTemplateAssetSelection,
  AgencyTemplateAudience,
} from '@/types';
import { toast } from 'sonner';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface TemplateUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  assets: AgencyAsset[];
  assetsLoading?: boolean;
  /** Present when uploading a new version of an existing custom template. */
  template?: AgencyTemplate | null;
  onSaved: (result: {
    template: AgencyTemplate;
    message?: string;
    created: boolean;
  }) => void;
}

/**
 * A6d: upload a custom HTML template or the next version of one. The asset
 * choices are explicit snapshots; logo, mascot and fonts fall back to current
 * branding, while cover and day images must be chosen here.
 */
const TemplateUploadDialog: React.FC<TemplateUploadDialogProps> = ({
  open,
  onOpenChange,
  agencyId,
  assets,
  assetsLoading = false,
  template = null,
  onSaved,
}) => {
  const isVersion = Boolean(template);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] =
    useState<AgencyTemplateAudience>('client');
  const [file, setFile] = useState<File | null>(null);
  const [assetSelection, setAssetSelection] =
    useState<AgencyTemplateAssetSelection>({});
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setAudience(template?.audience ?? 'client');
    setFile(null);
    setAssetSelection({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, template?._id, template?.audience, template?.description, template?.name]);

  const chooseFile = (selected: File | null) => {
    if (selected && selected.size > TEMPLATE_SOURCE_MAX_BYTES) {
      toast.error('Templates must be smaller than 512 KB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Choose an HTML template file first.');
      return;
    }
    if (!isVersion && name.trim().length < 2) {
      toast.error('Give this template a name.');
      return;
    }

    const assetError = validateAssetSelection(assetSelection);
    if (assetError) {
      toast.error(assetError);
      return;
    }

    setSaving(true);
    try {
      const selectedAssets = trimAssetSelection(assetSelection);
      if (template) {
        const result = await api.addAgencyTemplateVersion(
          agencyId,
          template._id,
          { file, assets: selectedAssets }
        );
        toast.success(
          result.message || 'Version uploaded as a draft. Preview it next.'
        );
        onSaved({ template: result.template, message: result.message, created: false });
      } else {
        const result = await api.createAgencyTemplate(agencyId, {
          file,
          name: name.trim(),
          description: description.trim(),
          audience,
          assets: selectedAssets,
        });
        toast.success(
          result.message || 'Template uploaded as a draft. Preview it next.'
        );
        onSaved({ template: result.template, message: result.message, created: true });
      }
    } catch (error) {
      toast.error(
        errorMessage(error, 'We could not upload that template. Please try again.')
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? `Upload a new version of ${template.name}` : 'Upload a custom template'}
          </DialogTitle>
          <DialogDescription>
            {template
              ? 'A new version stays a draft until you preview it against a real trip and activate it. Existing exports keep their pinned version.'
              : 'Upload a self-contained HTML body fragment. It stays a draft until you preview it against a real trip and activate it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!template ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="template-name">Template name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Signature proposal"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-audience">Audience</Label>
                <Select
                  value={audience}
                  onValueChange={(value) =>
                    setAudience(value as AgencyTemplateAudience)
                  }
                >
                  <SelectTrigger id="template-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">
                      Client proposal
                    </SelectItem>
                    <SelectItem value="internal">
                      Internal desk copy
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Client templates never expose cost or markup fields.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What makes this layout different?"
                  rows={2}
                  maxLength={240}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/50">
              <FileText className="h-4 w-4 text-teal-600" />
              <span>
                {template.name} · {template.audience} · v
                {template.activeVersion ?? template.version}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="template-file">HTML template file</Label>
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center dark:border-slate-700">
              <input
                ref={fileInputRef}
                id="template-file"
                type="file"
                accept=".html,.htm,text/html"
                className="sr-only"
                disabled={saving}
                onChange={(event) =>
                  chooseFile(event.target.files?.[0] ?? null)
                }
              />
              <Upload className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {file ? (
                  <>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {file.name}
                    </span>{' '}
                    · {formatBytes(file.size)}
                  </>
                ) : (
                  'One HTML body fragment, up to 512 KB. Scripts, forms, iframes and remote assets are rejected.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {file ? 'Choose a different file' : 'Choose HTML file'}
              </Button>
            </div>
          </div>

          <TemplateAssetMapping
            assets={assets}
            assetsLoading={assetsLoading}
            disabled={saving}
            value={assetSelection}
            onChange={setAssetSelection}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700"
            onClick={() => void handleUpload()}
            disabled={saving || !file}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {template ? 'Upload version' : 'Upload template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateUploadDialog;
