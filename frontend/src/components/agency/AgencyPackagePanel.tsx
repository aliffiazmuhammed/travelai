import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Eye,
  ImagePlus,
  Loader2,
  Lock,
  Save,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AgencyPackageCard from '@/components/directory/AgencyPackageCard';
import { useAgencyAssetUrl } from '@/hooks/useAgencyAssetUrl';
import { api } from '@/services/api';
import type { AgencyAsset, AgencyPackage, AgencyPackageInput } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * M9 D4 — the package builder inside the agency trip view.
 *
 * A package is created once from a trip: the server copies the title, nights
 * and highlights, and from then on the package is edited here and never reads
 * the trip again. The client mirrors the server's readiness rule (title +
 * summary) only to disable the publish button; the server re-checks it.
 */

const TITLE_MAX = 120;
const SUMMARY_MAX = 280;
const NIGHTS_MAX = 60;
const LIST_ITEM_MAX = 80;
const HIGHLIGHTS_MAX = 6;
const INCLUSIONS_MAX = 12;
const COVER_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface PackageDraft {
  title: string;
  summary: string;
  nights: string;
  price: string;
  highlights: string[];
  inclusions: string[];
}

function draftFromPackage(pkg: AgencyPackage): PackageDraft {
  return {
    title: pkg.title,
    summary: pkg.summary,
    nights: String(pkg.nights),
    price: pkg.pricePerPerson === null ? '' : String(pkg.pricePerPerson),
    highlights: [...pkg.highlights],
    inclusions: [...pkg.inclusions],
  };
}

function snapshotOf(draft: PackageDraft): string {
  return JSON.stringify(draft);
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

function missingRequirements(draft: PackageDraft): string[] {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push('Give the package a title.');
  if (!draft.summary.trim()) missing.push('Write a one-line summary for the card.');
  return missing;
}

function parsePrice(value: string): number | null | 'invalid' {
  if (!value.trim()) return null;
  const price = Number(value);
  if (!Number.isInteger(price) || price < 0) return 'invalid';
  return price;
}

function parseNights(value: string): number | 'invalid' {
  const nights = Number(value);
  if (!Number.isInteger(nights) || nights < 0 || nights > NIGHTS_MAX) {
    return 'invalid';
  }
  return nights;
}

/** Chips with type-and-Enter entry, capped like the server list. */
const PackageListEditor: React.FC<{
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  maxItems: number;
  disabled: boolean;
  onChange: (values: string[]) => void;
}> = ({ id, label, hint, placeholder, values, maxItems, disabled, onChange }) => {
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    let next = values;
    for (const part of parts) {
      if (part.length > LIST_ITEM_MAX) {
        toast.error(`Keep each entry under ${LIST_ITEM_MAX} characters.`);
        continue;
      }
      if (next.some((entry) => entry.toLowerCase() === part.toLowerCase())) {
        continue;
      }
      if (next.length >= maxItems) {
        toast.error(`Add at most ${maxItems} entries.`);
        break;
      }
      next = [...next, part];
    }
    if (next !== values) onChange(next);
    setText('');
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {value}
            {disabled ? null : (
              <button
                type="button"
                onClick={() => onChange(values.filter((entry) => entry !== value))}
                className="rounded-full p-0.5 text-slate-400 transition-colors hover:text-destructive"
                aria-label={`Remove ${value}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {disabled ? null : (
          <input
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                add(event.currentTarget.value);
              } else if (
                event.key === 'Backspace' &&
                !event.currentTarget.value &&
                values.length > 0
              ) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={(event) => {
              if (event.target.value.trim()) add(event.target.value);
            }}
            maxLength={LIST_ITEM_MAX}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-slate-400"
            placeholder={values.length ? 'Add another' : placeholder}
          />
        )}
      </div>
      <p className="text-[11px] text-slate-500">{hint}</p>
    </div>
  );
};

interface AgencyPackagePanelProps {
  agencyId: string;
  tripId: string;
  tripTitle: string;
  /** Archived trips are read-only, so they cannot source a new package. */
  archived: boolean;
  /** Planner and above can edit; admins and owners publish and delete. */
  canEdit: boolean;
  canManage: boolean;
}

const AgencyPackagePanel: React.FC<AgencyPackagePanelProps> = ({
  agencyId,
  tripId,
  tripTitle,
  archived,
  canEdit,
  canManage,
}) => {
  const [pkg, setPkg] = useState<AgencyPackage | null>(null);
  const [draft, setDraft] = useState<PackageDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    'create' | 'save' | 'publish' | 'unpublish' | 'delete' | 'cover' | null
  >(null);

  // `undefined` means "leave the saved cover alone"; null removes it.
  const [coverChoice, setCoverChoice] = useState<string | null | undefined>(
    undefined
  );
  const [uploadedCover, setUploadedCover] = useState<AgencyAsset | null>(null);
  const savedCover = useAgencyAssetUrl(pkg?.coverUrl);
  const uploadedCoverUrl = useAgencyAssetUrl(uploadedCover?.url);
  const coverUrl =
    coverChoice === undefined
      ? savedCover
      : coverChoice === null
        ? null
        : uploadedCoverUrl;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.listAgencyPackages(agencyId);
      const match =
        (result.packages || []).find((entry) => entry.tripId === tripId) ?? null;
      setPkg(match);
      if (match) {
        const next = draftFromPackage(match);
        setDraft(next);
        setSavedSnapshot(snapshotOf(next));
      } else {
        setDraft(null);
        setSavedSnapshot('');
      }
      setCoverChoice(undefined);
      setUploadedCover(null);
    } catch (error) {
      setLoadError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [agencyId, tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback((next: AgencyPackage) => {
    setPkg(next);
    const fresh = draftFromPackage(next);
    setDraft(fresh);
    setSavedSnapshot(snapshotOf(fresh));
    setCoverChoice(undefined);
    setUploadedCover(null);
  }, []);

  const update = (patch: Partial<PackageDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const dirty = draft ? snapshotOf(draft) !== savedSnapshot : false;
  const coverDirty = coverChoice !== undefined;
  const missing = draft ? missingRequirements(draft) : [];
  const ready = missing.length === 0;
  const published = pkg?.state === 'published';
  const editable = canEdit && !busy;

  const preview = useMemo(() => {
    if (!draft) return null;
    const price = parsePrice(draft.price);
    const nights = Number(draft.nights);
    return {
      title: draft.title,
      summary: draft.summary,
      nights: Number.isFinite(nights) ? Math.max(0, nights) : 0,
      pricePerPerson: price === 'invalid' ? null : price,
      currency: pkg?.currency || 'INR',
      coverUrl,
      highlights: draft.highlights,
      inclusions: draft.inclusions,
    };
  }, [draft, pkg?.currency, coverUrl]);

  const handleCreate = async () => {
    if (!agencyId || !tripId || busy) return;
    setBusy('create');
    try {
      const result = await api.createAgencyPackage(agencyId, { tripId });
      apply(result.package);
      toast.success('Package draft created from this trip.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const persist = async (): Promise<AgencyPackage | null> => {
    if (!agencyId || !pkg || !draft) return null;
    const price = parsePrice(draft.price);
    if (price === 'invalid') {
      toast.error('Enter a per-person price in whole rupees, or leave it blank.');
      return null;
    }
    const nights = parseNights(draft.nights);
    if (nights === 'invalid') {
      toast.error(`Nights must be a whole number between 0 and ${NIGHTS_MAX}.`);
      return null;
    }
    if (!ready) {
      toast.error(missing[0] ?? 'Finish the package before saving.');
      return null;
    }

    const payload: AgencyPackageInput = {
      title: draft.title,
      summary: draft.summary,
      nights,
      fromPricePerPerson: price,
      highlights: draft.highlights,
      inclusions: draft.inclusions,
    };
    if (coverDirty) payload.coverAssetId = coverChoice ?? null;

    try {
      const result = await api.updateAgencyPackage(agencyId, pkg.id, payload);
      apply(result.package);
      return result.package;
    } catch (error) {
      toast.error(messageOf(error));
      return null;
    }
  };

  const handleSave = async () => {
    if ((!dirty && !coverDirty) || busy) return;
    setBusy('save');
    try {
      const saved = await persist();
      if (saved) {
        toast.success(
          saved.state === 'published'
            ? 'Package updated — the public card changed too.'
            : 'Package saved.'
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    if (!agencyId || !pkg || busy) return;
    setBusy('publish');
    try {
      // Publishing reads the saved row on the server, so flush edits first.
      if (dirty || coverDirty) {
        const saved = await persist();
        if (!saved) return;
      }
      const result = await api.publishAgencyPackage(agencyId, pkg.id);
      apply(result.package);
      toast.success('Package is live on your public profile.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const handleUnpublish = async () => {
    if (!agencyId || !pkg || busy) return;
    setBusy('unpublish');
    try {
      const result = await api.unpublishAgencyPackage(agencyId, pkg.id);
      apply(result.package);
      toast.success('Package hidden from your public profile.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!agencyId || !pkg || busy) return;
    setBusy('delete');
    try {
      await api.deleteAgencyPackage(agencyId, pkg.id);
      setPkg(null);
      setDraft(null);
      setSavedSnapshot('');
      setCoverChoice(undefined);
      setUploadedCover(null);
      toast.success('Package deleted. The trip itself is untouched.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const handleCoverFile = async (file: File | undefined) => {
    if (!file || !agencyId || busy) return;
    if (!COVER_MIME_TYPES.includes(file.type)) {
      toast.error('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      toast.error('Cover images must be smaller than 2 MB.');
      return;
    }
    setBusy('cover');
    try {
      const result = await api.uploadAgencyAsset(agencyId, file, { kind: 'image' });
      setUploadedCover(result.asset);
      setCoverChoice(result.asset._id);
      toast.success('Cover uploaded. Save to put it on the card.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-3xl border-border/70">
        <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading this trip's package...
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="rounded-3xl border-destructive/30 bg-destructive/5">
        <CardContent className="space-y-3 p-8 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
          <p className="text-sm font-bold text-foreground">
            We couldn't load this trip's package
          </p>
          <p className="text-xs text-muted-foreground">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-bold"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!pkg || !draft) {
    return (
      <Card className="rounded-3xl border-dashed border-border/80 bg-card/60">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-600/10 text-teal-700 dark:text-teal-300">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">
              Turn this trip into a package
            </h3>
            <p className="mx-auto max-w-md text-xs text-muted-foreground">
              We copy the title, nights and highlights, then you set the public
              summary, price and inclusions. From that moment the package is a
              snapshot: later edits to the trip never change it.
            </p>
          </div>
          {archived ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Archived trips can't start a package.
            </p>
          ) : canEdit ? (
            <Button
              type="button"
              variant="hero"
              size="sm"
              className="rounded-xl text-xs font-bold"
              disabled={busy === 'create'}
              onClick={() => void handleCreate()}
            >
              {busy === 'create' ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create package from “{tripTitle || 'this trip'}”
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Planners, admins and owners can create the package.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="rounded-3xl border-border/70">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-bold">Public package</CardTitle>
            <Badge
              className={cn(
                'text-[10px]',
                published
                  ? 'bg-teal-600 text-white hover:bg-teal-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              {published ? 'Published' : 'Draft'}
            </Badge>
            {busy ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Working...
              </span>
            ) : null}
          </div>
          <CardDescription className="text-xs">
            This card is a snapshot. Re-saving or deleting the trip will not
            change it.
            {published
              ? ' It appears on your public profile while that page is published.'
              : ''}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pb-5">
          <div className="space-y-2">
            <Label htmlFor="package-title">Title</Label>
            <Input
              id="package-title"
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              maxLength={TITLE_MAX}
              disabled={!editable}
              placeholder="Western ghats in the monsoon"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="package-summary">Card summary</Label>
            <Textarea
              id="package-summary"
              value={draft.summary}
              onChange={(event) => update({ summary: event.target.value })}
              maxLength={SUMMARY_MAX}
              rows={3}
              disabled={!editable}
              placeholder="Five nights of waterfalls, forts and slow roads, with small groups and local guides."
            />
            <p className="text-[11px] text-slate-500">
              One or two lines. This is the first thing a traveller reads, and
              publishing needs it.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="package-nights">Nights</Label>
              <Input
                id="package-nights"
                type="number"
                min={0}
                max={NIGHTS_MAX}
                step={1}
                value={draft.nights}
                onChange={(event) => update({ nights: event.target.value })}
                disabled={!editable}
              />
              <p className="text-[11px] text-slate-500">
                A day trip is 0 nights.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="package-price">From, per person (₹)</Label>
              <Input
                id="package-price"
                type="number"
                min={0}
                step={1}
                value={draft.price}
                onChange={(event) => update({ price: event.target.value })}
                disabled={!editable}
                placeholder="Leave blank for price on request"
              />
              <p className="text-[11px] text-slate-500">
                Whole rupees. Blank shows “price on request”.
              </p>
            </div>
          </div>

          <PackageListEditor
            id="package-highlights"
            label="Highlights"
            hint={`Up to ${HIGHLIGHTS_MAX}. Enter or comma adds a line.`}
            placeholder="Kaas plateau in bloom"
            values={draft.highlights}
            maxItems={HIGHLIGHTS_MAX}
            disabled={!editable}
            onChange={(values) => update({ highlights: values })}
          />

          <PackageListEditor
            id="package-inclusions"
            label="What's included"
            hint={`Up to ${INCLUSIONS_MAX}. Keep each entry short.`}
            placeholder="Stay, breakfast, guide..."
            values={draft.inclusions}
            maxItems={INCLUSIONS_MAX}
            disabled={!editable}
            onChange={(values) => update({ inclusions: values })}
          />

          <div className="space-y-2">
            <Label htmlFor="package-cover">Cover image</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-bold"
                disabled={!editable}
                onClick={() =>
                  document.getElementById('package-cover-file')?.click()
                }
              >
                {busy === 'cover' ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload image
              </Button>
              {coverUrl || coverChoice === null ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-xs font-bold text-muted-foreground"
                  disabled={!editable}
                  onClick={() => {
                    setUploadedCover(null);
                    setCoverChoice(null);
                  }}
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
              <input
                id="package-cover-file"
                type="file"
                accept={COVER_MIME_TYPES.join(',')}
                className="hidden"
                onChange={(event) => {
                  void handleCoverFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500">
              JPEG, PNG or WebP up to 2 MB. Images come from your agency asset
              library, so you can reuse them elsewhere.
            </p>
          </div>

          {missing.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-bold">Before you can publish</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {missing.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {editable ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <Button
                type="button"
                size="sm"
                className="rounded-xl text-xs font-bold"
                disabled={(!dirty && !coverDirty) || busy !== null}
                onClick={() => void handleSave()}
              >
                {busy === 'save' ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                )}
                Save
              </Button>

              {canManage ? (
                published ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-bold"
                    disabled={busy !== null}
                    onClick={() => void handleUnpublish()}
                  >
                    {busy === 'unpublish' ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs font-bold"
                    disabled={busy !== null}
                    onClick={() => void handlePublish()}
                    title={ready ? undefined : missing.join(' ')}
                  >
                    {busy === 'publish' ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Publish
                  </Button>
                )
              ) : null}

              {canManage ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto rounded-xl text-xs font-bold text-muted-foreground hover:text-destructive"
                      disabled={busy !== null}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete package
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-3xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this package?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The public card disappears immediately. The trip itself
                        is untouched, and you can create a new package from it
                        later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl text-xs font-bold">
                        Keep it
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-destructive text-xs font-bold text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => void handleDelete()}
                      >
                        Delete package
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          ) : (
            <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
              Planners, admins and owners can edit this package.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Eye className="h-3.5 w-3.5" />
          Live preview
        </p>
        {preview ? <AgencyPackageCard package={preview} /> : null}
        <p className="text-[11px] text-slate-500">
          The preview updates as you type. Travellers see this after you publish
          and your public profile is live.
        </p>
      </div>
    </div>
  );
};

export default AgencyPackagePanel;
