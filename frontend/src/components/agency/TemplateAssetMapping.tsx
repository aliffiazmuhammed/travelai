import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Loader2, Plus, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  AgencyAsset,
  AgencyTemplateAssetSelection,
} from '@/types';

/**
 * A6d/A6f asset snapshot picker. Both upload flows choose the same things:
 * logo, mascot, cover, fonts and one image per itinerary position. The choices
 * are copied into the new version, so later library edits never rewrite an
 * approved proposal.
 */

export const MAX_DAY_ASSETS = 30;
const NONE_VALUE = '__none__';

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

/** Drops empty picks so the server never sees meaningless keys. */
export function trimAssetSelection(
  selection: AgencyTemplateAssetSelection
): AgencyTemplateAssetSelection | undefined {
  const trimmed: AgencyTemplateAssetSelection = {};
  if (selection.logoAssetId) trimmed.logoAssetId = selection.logoAssetId;
  if (selection.mascotAssetId) trimmed.mascotAssetId = selection.mascotAssetId;
  if (selection.headingFontAssetId) {
    trimmed.headingFontAssetId = selection.headingFontAssetId;
  }
  if (selection.bodyFontAssetId) {
    trimmed.bodyFontAssetId = selection.bodyFontAssetId;
  }
  if (selection.coverAssetId) trimmed.coverAssetId = selection.coverAssetId;

  const mappedDays = (selection.dayAssets ?? []).filter((row) => row.assetId);
  if (mappedDays.length > 0) trimmed.dayAssets = mappedDays;

  return Object.keys(trimmed).length > 0 ? trimmed : undefined;
}

/** Returns a user-facing message for the first problem, or null. */
export function validateAssetSelection(
  selection: AgencyTemplateAssetSelection
): string | null {
  const seenDays = new Set<number>();
  for (const row of selection.dayAssets ?? []) {
    if (!Number.isInteger(row.day) || row.day < 1 || row.day > MAX_DAY_ASSETS) {
      return `Day numbers must be between 1 and ${MAX_DAY_ASSETS}.`;
    }
    if (seenDays.has(row.day)) {
      return 'Each itinerary day can only map to one image.';
    }
    seenDays.add(row.day);
    if (!row.assetId) return 'Choose an image for every day you added.';
  }
  return null;
}

interface TemplateAssetMappingProps {
  assets: AgencyAsset[];
  assetsLoading?: boolean;
  disabled?: boolean;
  value: AgencyTemplateAssetSelection;
  onChange: (next: AgencyTemplateAssetSelection) => void;
}

const TemplateAssetMapping: React.FC<TemplateAssetMappingProps> = ({
  assets,
  assetsLoading = false,
  disabled = false,
  value,
  onChange,
}) => {
  const images = useMemo(
    () => assets.filter((asset) => asset.kind !== 'font'),
    [assets]
  );
  const fonts = useMemo(
    () => assets.filter((asset) => asset.kind === 'font'),
    [assets]
  );
  const dayAssets = value.dayAssets ?? [];

  const patch = (next: Partial<AgencyTemplateAssetSelection>) =>
    onChange({ ...value, ...next });

  const nextUnusedDay = (): number | null => {
    const used = new Set(dayAssets.map((row) => row.day));
    for (let day = 1; day <= MAX_DAY_ASSETS; day += 1) {
      if (!used.has(day)) return day;
    }
    return null;
  };

  return (
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
              value={value.logoAssetId ?? ''}
              onChange={(logoAssetId) => patch({ logoAssetId })}
              assets={images}
              noneLabel="Current branding logo"
              disabled={disabled}
            />
            <AssetSelect
              label="Mascot"
              value={value.mascotAssetId ?? ''}
              onChange={(mascotAssetId) => patch({ mascotAssetId })}
              assets={images}
              noneLabel="Current branding mascot"
              disabled={disabled}
            />
            <AssetSelect
              label="Cover image"
              value={value.coverAssetId ?? ''}
              onChange={(coverAssetId) => patch({ coverAssetId })}
              assets={images}
              noneLabel="No cover image"
              disabled={disabled}
            />
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:col-span-2 sm:mt-1">
              <Type className="h-3.5 w-3.5" />
              Fonts
            </div>
            <AssetSelect
              label="Heading font"
              value={value.headingFontAssetId ?? ''}
              onChange={(headingFontAssetId) => patch({ headingFontAssetId })}
              assets={fonts}
              noneLabel="Current branding heading font"
              disabled={disabled}
            />
            <AssetSelect
              label="Body font"
              value={value.bodyFontAssetId ?? ''}
              onChange={(bodyFontAssetId) => patch({ bodyFontAssetId })}
              assets={fonts}
              noneLabel="Current branding body font"
              disabled={disabled}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Day images
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  One image per itinerary position, matched as Day 1, Day 2,
                  and so on.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const day = nextUnusedDay();
                  if (day === null) return;
                  patch({ dayAssets: [...dayAssets, { day, assetId: '' }] });
                }}
                disabled={disabled || dayAssets.length >= MAX_DAY_ASSETS}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add day
              </Button>
            </div>

            {dayAssets.length === 0 ? (
              <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No day images mapped. Add one for each day the template shows a
                photo.
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
                      onValueChange={(next) =>
                        patch({
                          dayAssets: dayAssets.map((entry, rowIndex) =>
                            rowIndex === index
                              ? { ...entry, day: Number(next) }
                              : entry
                          ),
                        })
                      }
                      disabled={disabled}
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
                        patch({
                          dayAssets: dayAssets.map((entry, rowIndex) =>
                            rowIndex === index ? { ...entry, assetId } : entry
                          ),
                        })
                      }
                      assets={images}
                      noneLabel="Choose an image"
                      disabled={disabled}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-slate-400 hover:text-destructive"
                      onClick={() =>
                        patch({
                          dayAssets: dayAssets.filter(
                            (_, rowIndex) => rowIndex !== index
                          ),
                        })
                      }
                      disabled={disabled}
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
  );
};

export default TemplateAssetMapping;
