import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  Lock,
  Save,
  Send,
  ShieldAlert,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import DirectoryProfilePreview, {
  type DirectoryProfilePreviewModel,
} from '@/components/directory/DirectoryProfilePreview';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAssetUrl } from '@/hooks/useAgencyAssetUrl';
import { formatAgencyDate } from '@/lib/agency';
import { api } from '@/services/api';
import type {
  AgencyDirectoryCatalog,
  AgencyDirectoryProfile,
  AgencyDirectoryProfilePayload,
} from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * M9 D2 — the agency's public-directory editor.
 *
 * The draft lives in local state so the preview updates before saving. The
 * server stays the source of truth: it trims, dedupes and orders every list on
 * save, and it re-checks publish readiness, so the client mirror below is only
 * a hint for the disabled button.
 */

const ABOUT_MIN = 80;
const ABOUT_MAX = 1200;
const BASE_CITY_MAX = 80;
const LIST_MAX_ITEMS = 12;
const LIST_ITEM_MAX = 60;

interface DirectoryDraft {
  about: string;
  baseCity: string;
  destinations: string[];
  specialties: string[];
  services: string[];
  languages: string[];
  showPhone: boolean;
  showGstin: boolean;
}

function draftFromProfile(profile: AgencyDirectoryProfile): DirectoryDraft {
  return {
    about: profile.about,
    baseCity: profile.baseCity,
    destinations: [...profile.destinations],
    specialties: [...profile.specialties],
    services: [...profile.services],
    languages: [...profile.languages],
    showPhone: profile.showPhone,
    showGstin: profile.showGstin,
  };
}

function snapshotOf(draft: DirectoryDraft): string {
  return JSON.stringify(draft);
}

function messageOf(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

/** Mirrors the server's readiness messages; the server still decides. */
function missingRequirements(draft: DirectoryDraft, hasLogo: boolean): string[] {
  const missing: string[] = [];
  if (draft.about.trim().length < ABOUT_MIN) {
    missing.push(`Write at least ${ABOUT_MIN} characters about your agency.`);
  }
  if (!draft.baseCity.trim()) {
    missing.push('Add the city you plan trips from.');
  }
  if (draft.destinations.length === 0) {
    missing.push('List at least one destination you cover.');
  }
  if (draft.services.length === 0) {
    missing.push('Choose at least one service you offer.');
  }
  if (!hasLogo) {
    missing.push('Upload a logo in Agency settings.');
  }
  return missing;
}

/** Chips with type-and-Enter entry, capped like the server list. */
const TagField: React.FC<{
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}> = ({ id, label, hint, placeholder, values, disabled, onChange }) => {
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
      if (next.length >= LIST_MAX_ITEMS) {
        toast.error(`Add at most ${LIST_MAX_ITEMS} entries.`);
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

const DirectoryProfileEditor: React.FC = () => {
  const { activeAgency, activeAgencyId, canManage } = useAgency();

  const [profile, setProfile] = useState<AgencyDirectoryProfile | null>(null);
  const [catalog, setCatalog] = useState<AgencyDirectoryCatalog | null>(null);
  const [draft, setDraft] = useState<DirectoryDraft | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'unpublish' | null>(
    null
  );

  const logoUrl = useAgencyAssetUrl(activeAgency?.branding.logoUrl);
  const contactPhone = activeAgency?.branding.contactPhone ?? '';
  const gstin = activeAgency?.gstin ?? '';

  const load = useCallback(async () => {
    if (!activeAgencyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api.getAgencyDirectoryProfile(activeAgencyId);
      setProfile(result.profile);
      setCatalog(result.catalog);
      const next = draftFromProfile(result.profile);
      setDraft(next);
      setSavedSnapshot(snapshotOf(next));
    } catch (error) {
      setLoadError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [activeAgencyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback((result: AgencyDirectoryProfilePayload) => {
    setProfile(result.profile);
    const next = draftFromProfile(result.profile);
    setDraft(next);
    setSavedSnapshot(snapshotOf(next));
  }, []);

  const update = (patch: Partial<DirectoryDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const dirty = draft ? snapshotOf(draft) !== savedSnapshot : false;
  const missing = draft
    ? missingRequirements(draft, Boolean(activeAgency?.branding.logoUrl))
    : [];
  const ready = missing.length === 0;
  const underReview = Boolean(profile?.underReview);
  const published = profile?.state === 'published';
  const editable = canManage && !busy;

  const persist = async (): Promise<AgencyDirectoryProfilePayload | null> => {
    if (!activeAgencyId || !draft) return null;
    try {
      const result = await api.saveAgencyDirectoryProfile(activeAgencyId, {
        about: draft.about,
        baseCity: draft.baseCity,
        destinations: draft.destinations,
        specialties: draft.specialties,
        services: draft.services,
        languages: draft.languages,
        showPhone: draft.showPhone,
        showGstin: draft.showGstin,
      });
      apply(result);
      return result;
    } catch (error) {
      toast.error(messageOf(error));
      return null;
    }
  };

  const handleSave = async () => {
    if (!dirty || busy) return;
    setBusy('save');
    try {
      const result = await persist();
      if (result) {
        toast.success(
          result.profile.state === 'published'
            ? 'Changes are live on your public page.'
            : 'Public profile saved.'
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    if (!activeAgencyId || !draft || busy) return;
    setBusy('publish');
    try {
      // Publishing reads the saved row on the server, so flush edits first.
      if (dirty) {
        const saved = await persist();
        if (!saved) return;
      }
      const result = await api.publishAgencyDirectoryProfile(activeAgencyId);
      apply(result);
      toast.success('Your agency is now listed in the directory.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const handleUnpublish = async () => {
    if (!activeAgencyId || busy) return;
    setBusy('unpublish');
    try {
      const result = await api.unpublishAgencyDirectoryProfile(activeAgencyId);
      apply(result);
      toast.success('Your agency is no longer listed.');
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const selectedServices = useMemo(() => {
    if (!draft) return [];
    const selected = new Set(draft.services);
    return (catalog?.services ?? []).filter((service) => selected.has(service.id));
  }, [catalog, draft]);

  const selectedLanguages = useMemo(() => {
    if (!draft) return [];
    const selected = new Set(draft.languages);
    return (catalog?.languages ?? []).filter((entry) => selected.has(entry.code));
  }, [catalog, draft]);

  const preview: DirectoryProfilePreviewModel | null = draft
    ? {
        name: activeAgency?.name ?? '',
        about: draft.about,
        baseCity: draft.baseCity,
        destinations: draft.destinations,
        specialties: draft.specialties,
        services: selectedServices,
        languages: selectedLanguages,
        logoUrl,
        website: activeAgency?.branding.website ?? null,
        contactPhone: draft.showPhone && contactPhone ? contactPhone : null,
        gstin: draft.showGstin && gstin ? gstin : null,
        verified: Boolean(profile?.verified),
      }
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Public directory profile
            </CardTitle>
            <CardDescription>
              How travellers meet your agency when they browse the directory.
              This is separate from your brand settings above.
            </CardDescription>
          </div>
          {profile ? (
            <Badge
              variant={
                underReview ? 'destructive' : published ? 'default' : 'secondary'
              }
            >
              {underReview ? 'Under review' : published ? 'Published' : 'Draft'}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your public profile...
          </div>
        ) : loadError || !draft || !preview ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <p>{loadError ?? 'We could not load your public profile.'}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-5">
              {!canManage ? (
                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Owners and admins publish this page. You can still preview
                  what travellers see.
                </div>
              ) : null}

              {underReview ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Our team is reviewing this profile. You can keep editing, but
                  it cannot be published until the review clears.
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="directory-about">About your agency</Label>
                  <span
                    className={cn(
                      'text-[11px] tabular-nums',
                      draft.about.trim().length < ABOUT_MIN
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                    )}
                  >
                    {draft.about.trim().length}/{ABOUT_MAX}
                  </span>
                </div>
                <Textarea
                  id="directory-about"
                  value={draft.about}
                  onChange={(event) => update({ about: event.target.value })}
                  rows={5}
                  maxLength={ABOUT_MAX}
                  disabled={!editable}
                  placeholder="What kind of trips do you plan, for whom, and what makes your agency different?"
                />
                <p className="text-[11px] text-slate-500">
                  At least {ABOUT_MIN} characters to publish. Plain text; blank
                  lines separate paragraphs.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="directory-city">Base city</Label>
                  <Input
                    id="directory-city"
                    value={draft.baseCity}
                    onChange={(event) => update({ baseCity: event.target.value })}
                    maxLength={BASE_CITY_MAX}
                    disabled={!editable}
                    placeholder="e.g. Pune"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={activeAgency?.branding.website ?? ''}
                    readOnly
                    disabled
                    placeholder="Add a website in Profile above"
                  />
                  <p className="text-[11px] text-slate-500">
                    Comes from your agency profile.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TagField
                  id="directory-destinations"
                  label="Destinations you cover"
                  hint="Press Enter after each one. Up to 12."
                  placeholder="e.g. Ladakh"
                  values={draft.destinations}
                  disabled={!editable}
                  onChange={(destinations) => update({ destinations })}
                />
                <TagField
                  id="directory-specialties"
                  label="Known for"
                  hint="Optional. Up to 12, e.g. slow travel."
                  placeholder="e.g. Honeymoons"
                  values={draft.specialties}
                  disabled={!editable}
                  onChange={(specialties) => update({ specialties })}
                />
              </div>

              <div className="space-y-2">
                <Label>Services you offer</Label>
                <div
                  role="group"
                  aria-label="Services you offer"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {(catalog?.services ?? []).map((service) => (
                    <label
                      key={service.id}
                      htmlFor={`directory-service-${service.id}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                        draft.services.includes(service.id)
                          ? 'border-teal-300 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/30'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                        !editable && 'cursor-default opacity-80'
                      )}
                    >
                      <Checkbox
                        id={`directory-service-${service.id}`}
                        checked={draft.services.includes(service.id)}
                        onCheckedChange={(checked) => {
                          const shouldInclude = checked === true;
                          if (
                            shouldInclude ===
                            draft.services.includes(service.id)
                          ) {
                            return;
                          }
                          update({
                            services: shouldInclude
                              ? [...draft.services, service.id]
                              : draft.services.filter(
                                  (id) => id !== service.id
                                ),
                          });
                        }}
                        disabled={!editable}
                      />
                      {service.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Languages your team works in</Label>
                <div
                  role="group"
                  aria-label="Languages your team works in"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {(catalog?.languages ?? []).map((language) => (
                    <label
                      key={language.code}
                      htmlFor={`directory-language-${language.code}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition-colors',
                        draft.languages.includes(language.code)
                          ? 'border-teal-300 bg-teal-50/60 dark:border-teal-800 dark:bg-teal-950/30'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                        !editable && 'cursor-default opacity-80'
                      )}
                    >
                      <Checkbox
                        id={`directory-language-${language.code}`}
                        checked={draft.languages.includes(language.code)}
                        onCheckedChange={() =>
                          update({
                            languages: toggleValue(
                              draft.languages,
                              language.code
                            ),
                          })
                        }
                        disabled={!editable}
                      />
                      {language.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Contact details</Label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                    <div>
                      <div className="text-sm font-medium">Show my phone number</div>
                      <p className="text-xs text-slate-500">
                        {contactPhone
                          ? 'Travellers can call you straight from your listing.'
                          : 'Add a contact phone in Profile above first.'}
                      </p>
                    </div>
                    <Switch
                      checked={draft.showPhone}
                      onCheckedChange={(checked) => update({ showPhone: checked })}
                      disabled={!editable || !contactPhone}
                      aria-label="Show phone number on the public profile"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                    <div>
                      <div className="text-sm font-medium">Show my GSTIN</div>
                      <p className="text-xs text-slate-500">
                        {gstin
                          ? 'A tax id can reassure corporate travellers.'
                          : 'Add a GSTIN in Profile above first.'}
                      </p>
                    </div>
                    <Switch
                      checked={draft.showGstin}
                      onCheckedChange={(checked) => update({ showGstin: checked })}
                      disabled={!editable || !gstin}
                      aria-label="Show GSTIN on the public profile"
                    />
                  </div>
                </div>
              </div>

              {canManage && !ready ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
                    <AlertCircle className="h-4 w-4" />
                    Before you can publish
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-900 dark:text-amber-100">
                    {missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {canManage ? (
                  <>
                    <Button
                      onClick={() => void handleSave()}
                      disabled={!dirty || busy !== null}
                      variant={published ? 'default' : 'outline'}
                    >
                      {busy === 'save' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      {published ? 'Save changes' : 'Save draft'}
                    </Button>
                    {published ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" disabled={busy !== null}>
                            Unpublish
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Remove your agency from the directory?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Travellers lose access to this page right away.
                              Your profile stays saved, and you can publish it
                              again any time.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it live</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void handleUnpublish()}
                            >
                              Unpublish
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button
                        onClick={() => void handlePublish()}
                        disabled={!ready || underReview || busy !== null}
                      >
                        {busy === 'publish' ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Publish profile
                      </Button>
                    )}
                  </>
                ) : null}
                {dirty ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Unsaved changes
                  </span>
                ) : published ? (
                  <span className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400">
                    <Check className="h-3.5 w-3.5" />
                    Saved changes appear on your public page
                  </span>
                ) : null}
              </div>

              {published && profile?.publishedAt ? (
                <p className="text-[11px] text-slate-500">
                  Published {formatAgencyDate(profile.publishedAt)}.
                </p>
              ) : null}
            </div>

            <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
              <div className="text-xs font-medium text-slate-500">
                What travellers will see
              </div>
              <DirectoryProfilePreview profile={preview} />
              {dirty ? (
                <p className="text-[11px] text-slate-500">
                  This preview follows your edits. Save to make them public.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DirectoryProfileEditor;
