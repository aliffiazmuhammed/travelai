import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
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
import { api } from '@/services/api';
import type {
  AgencyAsset,
  AgencyTemplate,
  AgencyTemplateAssetSelection,
  AgencyTemplateAudience,
} from '@/types';
import { toast } from 'sonner';

export const MAX_TEMPLATE_BYTES = 512 * 1024;
const MAX_DAY_ASSETS = 30;
const NONE_VALUE = '__none__';

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assetKindLabel(asset: AgencyAsset): string {
  if (asset.kind === 'font') return 'Font';
  if (asset.kind === 'logo') return 'Logo';
  if (asset.kind === 'mascot') return 'Mascot';
  return 'Image';
}

function assetOptionLabel(asset: AgencyAsset): string {
  const name = asset.fontFamily?.trim() || asset.originalName?.trim();
  const suffix = name ? ` · ${name}` : '';
  return `${assetKindLabel(asset)}${suffix}`;
}

interface AssetSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  assets: AgencyAsset[];
  noneLabel: string;
  disabled?: boolean;
}

const AssetSelect: React.FC<AssetSelectProps> = ({
  label,
  value,
  onChange,
  assets,
  noneLabel,
  disabled,
}) => (
  <div className="space-y-1.5">
    {label ? (
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>
    ) : null}
    <Select
      value={value || NONE_VALUE}
      onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger className="h-9 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>
        {assets.map((asset) => (
          <SelectItem key={asset._id} value={asset._id}>
            {assetOptionLabel(asset)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

interface DayAssetRow {
  day: number;
  assetId: string;
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
 * A6d: upload a custom template or the next version of one. The asset choices
 * are explicit snapshots; logo, mascot and fonts fall back to current
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
  const [logoAssetId, setLogoAssetId] = useState('');
  const [mascotAssetId, setMascotAssetId] = useState('');
  const [headingFontAssetId, setHeadingFontAssetId] = useState('');
  const [bodyFontAssetId, setBodyFontAssetId] = useState('');
  const [coverAssetId, setCoverAssetId] = useState('');
  const [dayAssets, setDayAssets] = useState<DayAssetRow[]>([]);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = useMemo(
    () => assets.filter((asset) => asset.kind !== 'font'),
    [assets]
  );
  const fonts = useMemo(
    () => assets.filter((asset) => asset.kind === 'font'),
    [assets]
  );

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setAudience(template?.audience ?? 'client');
    setFile(null);
    setLogoAssetId('');
    setMascotAssetId('');
    setHeadingFontAssetId('');
    setBodyFontAssetId('');
    setCoverAssetId('');
    setDayAssets([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, template?._id, template?.audience, template?.description, template?.name]);

  const chooseFile = (selected: File | null) => {
    if (selected && selected.size > MAX_TEMPLATE_BYTES) {
      toast.error('Templates must be smaller than 512 KB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFile(null);
      return;
    }
    setFile(selected);
  };

  const nextUnusedDay = (rows: DayAssetRow[]): number | null => {
    const used = new Set(rows.map((row) => row.day));
    for (let day = 1; day <= MAX_DAY_ASSETS; day += 1) {
      if (!used.has(day)) return day;
    }
    return null;
  };

  const addDayAsset = () => {
    const day = nextUnusedDay(dayAssets);
    if (day === null) {
      toast.error(`At most ${MAX_DAY_ASSETS} day images can be mapped.`);
      return;
    }
    setDayAssets((prev) => [...prev, { day, assetId: '' }]);
  };

  const updateDayAsset = (index: number, patch: Partial<DayAssetRow>) => {
    setDayAssets((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  };

  const buildSelection = (): AgencyTemplateAssetSelection | undefined => {
    const selection: AgencyTemplateAssetSelection = {};
    if (logoAssetId) selection.logoAssetId = logoAssetId;
    if (mascotAssetId) selection.mascotAssetId = mascotAssetId;
    if (headingFontAssetId) {
      selection.headingFontAssetId = headingFontAssetId;
    }
    if (bodyFontAssetId) selection.bodyFontAssetId = bodyFontAssetId;
    if (coverAssetId) selection.coverAssetId = coverAssetId;

    const mappedDays = dayAssets
      .filter((row) => row.assetId)
      .map((row) => ({ day: row.day, assetId: row.assetId }));
    if (mappedDays.length > 0) selection.dayAssets = mappedDays;

    return Object.keys(selection).length > 0 ? selection : undefined;
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

    const seenDays = new Set<number>();
    for (const row of dayAssets) {
      if (!Number.isInteger(row.day) || row.day < 1 || row.day > MAX_DAY_ASSETS) {
        toast.error('Day numbers must be between 1 and 30.');
        return;
      }
      if (seenDays.has(row.day)) {
        toast.error('Each itinerary day can only map to one image.');
        return;
      }
      seenDays.add(row.day);
      if (!row.assetId) {
        toast.error('Choose an image for every day you added.');
        return;
      }
    }

    setSaving(true);
    try {
      const selectedAssets = buildSelection();
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

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Asset mapping</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Assets are copied into this version. Later changes in Settings
                  never alter an approved proposal.
                </p>
              </div>
              <Link
                to="/agency/settings"
                className="text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Manage brand assets
              </Link>
            </div>

            {assetsLoading ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-4 text-xs text-slate-500 dark:border-slate-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading brand assets...
              </div>
            ) : (
              <>
                <div className="grid gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:col-span-2">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Images
                  </div>
                  <AssetSelect
                    label="Logo"
                    value={logoAssetId}
                    onChange={setLogoAssetId}
                    assets={images}
                    noneLabel="Current branding logo"
                    disabled={saving}
                  />
                  <AssetSelect
                    label="Mascot"
                    value={mascotAssetId}
                    onChange={setMascotAssetId}
                    assets={images}
                    noneLabel="Current branding mascot"
                    disabled={saving}
                  />
                  <AssetSelect
                    label="Cover image"
                    value={coverAssetId}
                    onChange={setCoverAssetId}
                    assets={images}
                    noneLabel="No cover image"
                    disabled={saving}
                  />
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:col-span-2 sm:mt-1">
                    <Type className="h-3.5 w-3.5" />
                    Fonts
                  </div>
                  <AssetSelect
                    label="Heading font"
                    value={headingFontAssetId}
                    onChange={setHeadingFontAssetId}
                    assets={fonts}
                    noneLabel="Current branding heading font"
                    disabled={saving}
                  />
                  <AssetSelect
                    label="Body font"
                    value={bodyFontAssetId}
                    onChange={setBodyFontAssetId}
                    assets={fonts}
                    noneLabel="Current branding body font"
                    disabled={saving}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Day images
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        One image per itinerary position, matched as Day 1,
                        Day 2, and so on.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDayAsset}
                      disabled={saving || dayAssets.length >= MAX_DAY_ASSETS}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add day
                    </Button>
                  </div>

                  {dayAssets.length === 0 ? (
                    <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      No day images mapped. Add one for each day the template
                      shows a photo.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {dayAssets.map((row, index) => (
                        <div
                          key={`${index}-${row.day}`}
                          className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-2"
                        >
                          <Select
                            value={String(row.day)}
                            onValueChange={(value) =>
                              updateDayAsset(index, { day: Number(value) })
                            }
                            disabled={saving}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from(
                                { length: MAX_DAY_ASSETS },
                                (_, dayIndex) => dayIndex + 1
                              ).map((day) => (
                                <SelectItem key={day} value={String(day)}>
                                  Day {day}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <AssetSelect
                            label=""
                            value={row.assetId}
                            onChange={(assetId) =>
                              updateDayAsset(index, { assetId })
                            }
                            assets={images}
                            noneLabel="Choose an image"
                            disabled={saving}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-slate-400 hover:text-destructive"
                            onClick={() =>
                              setDayAssets((prev) =>
                                prev.filter((_, rowIndex) => rowIndex !== index)
                              )
                            }
                            disabled={saving}
                            aria-label={`Remove day ${row.day} image`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {!assetsLoading && images.length === 0 && fonts.length === 0 ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                No brand assets are available yet. Upload images and fonts in{' '}
                <Link to="/agency/settings" className="underline">
                  Settings
                </Link>{' '}
                or use the current branding fallbacks.
              </p>
            ) : null}
          </div>
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
