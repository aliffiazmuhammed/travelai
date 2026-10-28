import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Building2,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Receipt,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/services/api';
import { useAgency } from '@/context/AgencyContext';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { useAgencyAssetUrl } from '@/hooks/useAgencyAssetUrl';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import type { AgencyAsset, AgencyAssetKind, AgencyBranding } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AgencyPasswordChange from './AgencyPasswordChange';
import DirectoryProfileEditor from '@/components/agency/DirectoryProfileEditor';

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const FONT_ACCEPT = '.woff,.woff2,.ttf,.otf';
const IMAGE_MAX_MB = 2;
const FONT_MAX_MB = 5;
const DEFAULT_PRIMARY = '#0f766e';
const DEFAULT_ACCENT = '#f59e0b';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toTermLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function assetKindLabel(kind: AgencyAssetKind): string {
  if (kind === 'logo') return 'Logo';
  if (kind === 'mascot') return 'Mascot';
  if (kind === 'font') return 'Font';
  return 'Image';
}

const AssetThumb: React.FC<{
  url: string;
  alt: string;
  className?: string;
}> = ({ url, alt, className }) => {
  const resolved = useAgencyAssetUrl(url);
  if (!resolved) {
    return (
      <div
        className={cn(
          'grid place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800',
          className
        )}
      >
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return <img src={resolved} alt={alt} className={cn('object-cover', className)} />;
};

const AgencySettings: React.FC = () => {
  const navigate = useNavigate();
  const { activeAgency, activeAgencyId, canManage, replaceAgency, loading } =
    useAgency();
  const {
    user,
    agency: sessionAgency,
    updateProfile,
    logout,
  } = useAgencyAuth();

  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [fontHeading, setFontHeading] = useState('');
  const [fontBody, setFontBody] = useState('');
  const [defaultInclusions, setDefaultInclusions] = useState('');
  const [defaultExclusions, setDefaultExclusions] = useState('');
  const [defaultTerms, setDefaultTerms] = useState('');
  const [saving, setSaving] = useState(false);

  const [assets, setAssets] = useState<AgencyAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState('');
  const [licenseNote, setLicenseNote] = useState('');
  const [accountName, setAccountName] = useState(user?.name ?? '');
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    setAccountName(user?.name ?? '');
  }, [user?.name]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const mascotInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  // Rehydrate on mount / when switching tenants, but never when an upload
  // refreshes the agency object mid-edit.
  const hydratedAgencyRef = useRef<string | null>(null);

  const logoPreview = useAgencyAssetUrl(activeAgency?.branding.logoUrl);
  const mascotPreview = useAgencyAssetUrl(activeAgency?.branding.mascotUrl);

  useEffect(() => {
    if (!activeAgency) return;
    if (hydratedAgencyRef.current === activeAgency._id) return;
    hydratedAgencyRef.current = activeAgency._id;
    setName(activeAgency.name);
    setGstin(activeAgency.gstin ?? '');
    setWebsite(activeAgency.branding.website ?? '');
    setContactEmail(activeAgency.branding.contactEmail ?? '');
    setContactPhone(activeAgency.branding.contactPhone ?? '');
    setAddress(activeAgency.branding.address ?? '');
    setPrimaryColor(activeAgency.branding.primaryColor ?? DEFAULT_PRIMARY);
    setAccentColor(activeAgency.branding.accentColor ?? DEFAULT_ACCENT);
    setFontHeading(activeAgency.branding.fontHeading ?? '');
    setFontBody(activeAgency.branding.fontBody ?? '');
    setDefaultInclusions((activeAgency.defaultTerms?.inclusions ?? []).join('\n'));
    setDefaultExclusions((activeAgency.defaultTerms?.exclusions ?? []).join('\n'));
    setDefaultTerms((activeAgency.defaultTerms?.terms ?? []).join('\n'));
  }, [activeAgency]);

  useEffect(() => {
    if (!activeAgencyId) return;
    let cancelled = false;
    setAssetsLoading(true);
    setAssetsError(null);
    api
      .getAgencyAssets(activeAgencyId)
      .then((result) => {
        if (!cancelled) setAssets(result.assets ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAssets([]);
        setAssetsError(
          err instanceof Error
            ? err.message
            : 'We could not load the brand asset library.'
        );
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgencyId]);

  if (loading && !activeAgency) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agency settings...
      </div>
    );
  }
  if (!activeAgencyId || !activeAgency) {
    return <Navigate to="/agency" replace />;
  }

  const images = assets.filter((asset) => asset.kind !== 'font');
  const fonts = assets.filter((asset) => asset.kind === 'font');
  const previewPrimary = HEX_COLOUR.test(primaryColor.trim())
    ? primaryColor.trim()
    : DEFAULT_PRIMARY;
  const previewAccent = HEX_COLOUR.test(accentColor.trim())
    ? accentColor.trim()
    : DEFAULT_ACCENT;
  const initial = name.trim().slice(0, 1).toUpperCase() || 'A';

  const uploadAsset = async (file: File, kind: AgencyAssetKind) => {
    if (!activeAgencyId) return;
    const maxMb = kind === 'font' ? FONT_MAX_MB : IMAGE_MAX_MB;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(
        `${kind === 'font' ? 'Fonts' : 'Images'} must be smaller than ${maxMb} MB.`
      );
      return;
    }
    if (kind === 'font' && (!fontFamily.trim() || !licenseNote.trim())) {
      toast.error('Add the font family and licence note before uploading.');
      return;
    }

    setBusy(kind);
    try {
      const result = await api.uploadAgencyAsset(activeAgencyId, file, {
        kind,
        ...(kind === 'font'
          ? { fontFamily: fontFamily.trim(), licenseNote: licenseNote.trim() }
          : {}),
      });
      setAssets((prev) => [
        result.asset,
        ...prev.filter((asset) => asset._id !== result.asset._id),
      ]);
      if (result.agency) replaceAgency(result.agency);
      if (kind === 'font') {
        setFontFamily('');
        setLicenseNote('');
      }
      toast.success(
        kind === 'logo'
          ? 'Agency logo updated.'
          : kind === 'mascot'
            ? 'Agency mascot updated.'
            : kind === 'font'
              ? 'Font added to the brand library.'
              : 'Image added to the brand library.'
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'We could not upload that file.');
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (input: HTMLInputElement | null) => {
    if (!input) return;
    input.value = '';
    input.click();
  };

  const clearBrandImage = async (kind: 'logo' | 'mascot') => {
    if (!activeAgencyId) return;
    const currentUrl =
      kind === 'logo' ? activeAgency.branding.logoUrl : activeAgency.branding.mascotUrl;
    if (!currentUrl) return;

    setBusy(kind);
    try {
      const asset = assets.find((entry) => entry.url === currentUrl);
      if (asset) {
        const result = await api.deleteAgencyAsset(activeAgencyId, asset._id);
        setAssets((prev) => prev.filter((entry) => entry._id !== asset._id));
        if (result.agency) replaceAgency(result.agency);
      } else {
        // External/legacy URL: clear the pointer without touching the library.
        const result = await api.updateAgency(activeAgencyId, {
          branding: kind === 'logo' ? { logoUrl: '' } : { mascotUrl: '' },
        });
        replaceAgency(result.agency);
      }
      toast.success(kind === 'logo' ? 'Logo removed.' : 'Mascot removed.');
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `We could not remove the ${kind}.`
      );
    } finally {
      setBusy(null);
    }
  };

  const removeAsset = async (asset: AgencyAsset) => {
    if (!activeAgencyId) return;
    const label = asset.originalName || assetKindLabel(asset.kind).toLowerCase();
    if (!window.confirm(`Remove "${label}" from the brand library?`)) return;

    setBusy(asset._id);
    try {
      const result = await api.deleteAgencyAsset(activeAgencyId, asset._id);
      setAssets((prev) => prev.filter((entry) => entry._id !== asset._id));
      if (result.agency) {
        replaceAgency(result.agency);
        // Deleting a font also clears it from the typography settings.
        if (asset.kind === 'font') {
          setFontHeading(result.agency.branding.fontHeading ?? '');
          setFontBody(result.agency.branding.fontBody ?? '');
        }
      }
      toast.success('Brand asset removed.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not remove that asset.'
      );
    } finally {
      setBusy(null);
    }
  };

  const saveAccountName = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingAccount(true);
    try {
      await updateProfile(accountName.trim());
      toast.success('Your agency profile has been updated.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not save your profile.'
      );
    } finally {
      setSavingAccount(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/agency/login', { replace: true });
  };

  const save = async () => {
    if (!canManage || !activeAgencyId) return;
    if (name.trim().length < 2) {
      toast.error('Agency name must be at least 2 characters.');
      return;
    }

    setSaving(true);
    try {
      // Every optional value is sent, including blanks: an empty string is how
      // the API clears a field that previously had a value.
      const branding: Partial<AgencyBranding> = {
        primaryColor: primaryColor.trim(),
        accentColor: accentColor.trim(),
        fontHeading: fontHeading.trim(),
        fontBody: fontBody.trim(),
        website: website.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        address: address.trim(),
      };

      const result = await api.updateAgency(activeAgencyId, {
        name: name.trim(),
        gstin: gstin.trim(),
        branding,
        defaultTerms: {
          inclusions: toTermLines(defaultInclusions),
          exclusions: toTermLines(defaultExclusions),
          terms: toTermLines(defaultTerms),
        },
      });
      replaceAgency(result.agency);
      // Reflect server normalisation (trimming, lowercase email, uppercase GSTIN).
      setName(result.agency.name);
      setGstin(result.agency.gstin ?? '');
      setWebsite(result.agency.branding.website ?? '');
      setContactEmail(result.agency.branding.contactEmail ?? '');
      setContactPhone(result.agency.branding.contactPhone ?? '');
      setAddress(result.agency.branding.address ?? '');
      setPrimaryColor(result.agency.branding.primaryColor ?? DEFAULT_PRIMARY);
      setAccentColor(result.agency.branding.accentColor ?? DEFAULT_ACCENT);
      setFontHeading(result.agency.branding.fontHeading ?? '');
      setFontBody(result.agency.branding.fontBody ?? '');
      setDefaultInclusions((result.agency.defaultTerms?.inclusions ?? []).join('\n'));
      setDefaultExclusions((result.agency.defaultTerms?.exclusions ?? []).join('\n'));
      setDefaultTerms((result.agency.defaultTerms?.terms ?? []).join('\n'));
      toast.success('Agency settings saved.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'We could not save the agency settings.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <input
        ref={logoInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadAsset(file, 'logo');
        }}
      />
      <input
        ref={mascotInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadAsset(file, 'mascot');
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadAsset(file, 'image');
        }}
      />
      <input
        ref={fontInputRef}
        type="file"
        accept={FONT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadAsset(file, 'font');
        }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Agency settings</h1>
            <Badge
              variant="outline"
              className={cn('text-[10px]', agencyRoleBadgeClass(activeAgency.role))}
            >
              {agencyRoleLabel(activeAgency.role)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your brand identity for client pages, quotes and exports, plus your
            personal agency account. Files stay private to this agency; only
            the logo and details you choose in the public profile reach
            travellers.
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => void save()}
            disabled={saving || name.trim().length < 2}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save changes
          </Button>
        ) : null}
      </div>

      {!canManage ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Only owners and admins can edit the agency profile or upload brand
          assets. You can still view the brand preview and asset library.
        </div>
      ) : null}

      <DirectoryProfileEditor />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                Profile
              </CardTitle>
              <CardDescription>
                Shown to your team and used in client-facing documents.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="settings-name">Agency name</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-gstin">GSTIN</Label>
                <Input
                  id="settings-gstin"
                  value={gstin}
                  onChange={(event) => setGstin(event.target.value.toUpperCase())}
                  placeholder="27AAPFU0939F1ZV"
                  maxLength={15}
                  disabled={!canManage}
                  className="font-mono uppercase"
                />
                <p className="text-[11px] text-slate-500">
                  Optional. Printed on quotes and invoices in later milestones.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-website">Website</Label>
                <Input
                  id="settings-website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://..."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email">Contact email</Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="hello@agency.com"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-phone">Contact phone</Label>
                <Input
                  id="settings-phone"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+91 ..."
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="settings-address">Address</Label>
                <Textarea
                  id="settings-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  rows={2}
                  placeholder="Street, city, country"
                  disabled={!canManage}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="h-4 w-4" />
                Logo, mascot and images
              </CardTitle>
              <CardDescription>
                PNG, JPEG or WebP up to {IMAGE_MAX_MB} MB. Uploading a logo or
                mascot makes it the active one immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Agency logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      className="grid h-full w-full place-items-center text-lg font-bold text-white"
                      style={{ backgroundColor: previewPrimary }}
                    >
                      {initial}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Agency logo</div>
                  <p className="text-xs text-slate-500">
                    Used in the agency shell and future client documents.
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pickFile(logoInputRef.current)}
                      disabled={busy === 'logo'}
                    >
                      {busy === 'logo' ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {activeAgency.branding.logoUrl ? 'Replace' : 'Upload'}
                    </Button>
                    {activeAgency.branding.logoUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void clearBrandImage('logo')}
                        disabled={busy === 'logo'}
                        aria-label="Remove logo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {mascotPreview ? (
                    <img
                      src={mascotPreview}
                      alt="Agency mascot"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Sparkles className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Mascot</div>
                  <p className="text-xs text-slate-500">
                    A friendly character for empty states and client pages.
                  </p>
                </div>
                {canManage ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pickFile(mascotInputRef.current)}
                      disabled={busy === 'mascot'}
                    >
                      {busy === 'mascot' ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {activeAgency.branding.mascotUrl ? 'Replace' : 'Upload'}
                    </Button>
                    {activeAgency.branding.mascotUrl ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void clearBrandImage('mascot')}
                        disabled={busy === 'mascot'}
                        aria-label="Remove mascot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Image library</div>
                    <p className="text-xs text-slate-500">
                      Reusable brand photos and textures for later templates.
                    </p>
                  </div>
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pickFile(imageInputRef.current)}
                      disabled={busy === 'image'}
                    >
                      {busy === 'image' ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Add image
                    </Button>
                  ) : null}
                </div>

                {assetsLoading ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading brand assets...
                  </div>
                ) : assetsError ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    {assetsError}
                  </p>
                ) : images.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
                    No images yet. Upload a logo, mascot or reusable image.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((asset) => (
                      <div
                        key={asset._id}
                        className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <AssetThumb
                          url={asset.url}
                          alt={asset.originalName || assetKindLabel(asset.kind)}
                          className="h-24 w-full"
                        />
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <div className="min-w-0">
                            <div className="truncate text-[11px] font-medium">
                              {assetKindLabel(asset.kind)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {formatBytes(asset.bytes)}
                            </div>
                          </div>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => void removeAsset(asset)}
                              disabled={busy === asset._id}
                              className="rounded-md p-1 text-slate-400 transition-colors hover:text-destructive disabled:opacity-50"
                              aria-label={`Remove ${assetKindLabel(asset.kind)}`}
                            >
                              {busy === asset._id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Type className="h-4 w-4" />
                Fonts
              </CardTitle>
              <CardDescription>
                Upload a licensed WOFF, WOFF2, TTF or OTF file up to {FONT_MAX_MB} MB.
                The family name and licence note are kept with the asset.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage ? (
                <div className="grid gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="font-family">Family name</Label>
                    <Input
                      id="font-family"
                      value={fontFamily}
                      onChange={(event) => setFontFamily(event.target.value)}
                      placeholder="e.g. Fraunces"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="font-licence">Licence note</Label>
                    <Input
                      id="font-licence"
                      value={licenseNote}
                      onChange={(event) => setLicenseNote(event.target.value)}
                      placeholder="e.g. OFL 1.1, Adobe licence"
                      maxLength={500}
                    />
                  </div>
                  <Button
                    className="sm:col-span-2"
                    variant="outline"
                    onClick={() => {
                      if (!fontFamily.trim() || !licenseNote.trim()) {
                        toast.error(
                          'Add the font family and licence note before uploading.'
                        );
                        return;
                      }
                      pickFile(fontInputRef.current);
                    }}
                    disabled={busy === 'font'}
                  >
                    {busy === 'font' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Upload font
                  </Button>
                </div>
              ) : null}

              {assetsLoading ? null : fonts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800">
                  No fonts uploaded. Add one to use it in branded exports.
                </p>
              ) : (
                <div className="space-y-2">
                  {fonts.map((font) => (
                    <div
                      key={font._id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">
                            {font.fontFamily}
                          </span>
                          {fontHeading === font.fontFamily ||
                          fontBody === font.fontFamily ? (
                            <Badge variant="secondary" className="text-[10px]">
                              In use
                            </Badge>
                          ) : null}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          {font.originalName || 'Font file'} ·{' '}
                          {formatBytes(font.bytes)} · {font.licenseNote}
                        </div>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => void removeAsset(font)}
                          disabled={busy === font._id}
                          className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-destructive disabled:opacity-50"
                          aria-label={`Remove ${font.fontFamily || 'font'}`}
                        >
                          {busy === font._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4 text-teal-600" />
                Your account
              </CardTitle>
              <CardDescription>
                The name your teammates see inside the agency workspace. This
                account opens {sessionAgency?.name ?? 'this workspace'} only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={saveAccountName}>
                <div className="space-y-2">
                  <Label>Workspace</Label>
                  <Input value={sessionAgency?.name ?? ''} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email ?? ''} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-name">Display name</Label>
                  <Input
                    id="account-name"
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    maxLength={40}
                    placeholder="Your name"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingAccount}>
                    {savingAccount ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void signOut()}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out of agency
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <AgencyPasswordChange />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" />
                Colours and typography
              </CardTitle>
              <CardDescription>
                Used by the agency shell now and by branded exports later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-primary">Primary</Label>
                <div className="flex gap-2">
                  <input
                    id="settings-primary"
                    type="color"
                    value={previewPrimary}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    disabled={!canManage}
                    className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    maxLength={7}
                    disabled={!canManage}
                    className="font-mono"
                    placeholder={DEFAULT_PRIMARY}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-accent">Accent</Label>
                <div className="flex gap-2">
                  <input
                    id="settings-accent"
                    type="color"
                    value={previewAccent}
                    onChange={(event) => setAccentColor(event.target.value)}
                    disabled={!canManage}
                    className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900"
                  />
                  <Input
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    maxLength={7}
                    disabled={!canManage}
                    className="font-mono"
                    placeholder={DEFAULT_ACCENT}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-font-heading">Heading font</Label>
                <Input
                  id="settings-font-heading"
                  list="agency-font-families"
                  value={fontHeading}
                  onChange={(event) => setFontHeading(event.target.value)}
                  placeholder="e.g. Fraunces"
                  maxLength={120}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-font-body">Body font</Label>
                <Input
                  id="settings-font-body"
                  list="agency-font-families"
                  value={fontBody}
                  onChange={(event) => setFontBody(event.target.value)}
                  placeholder="e.g. Inter"
                  maxLength={120}
                  disabled={!canManage}
                />
              </div>
              <datalist id="agency-font-families">
                {fonts.map((font) => (
                  <option key={font._id} value={font.fontFamily} />
                ))}
              </datalist>
              <p className="text-[11px] text-slate-500">
                Pick a family from your uploaded fonts, or type any family name.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" />
                Quote defaults
              </CardTitle>
              <CardDescription>
                Prefilled into every new trip quote. A quote can override each
                list without changing these defaults.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-inclusions">Inclusions</Label>
                <Textarea
                  id="settings-inclusions"
                  rows={3}
                  value={defaultInclusions}
                  onChange={(event) => setDefaultInclusions(event.target.value)}
                  placeholder={'Return airport transfers\nBreakfast daily'}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-exclusions">Exclusions</Label>
                <Textarea
                  id="settings-exclusions"
                  rows={3}
                  value={defaultExclusions}
                  onChange={(event) => setDefaultExclusions(event.target.value)}
                  placeholder={'International flights\nTravel insurance'}
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-quote-terms">Terms</Label>
                <Textarea
                  id="settings-quote-terms"
                  rows={3}
                  value={defaultTerms}
                  onChange={(event) => setDefaultTerms(event.target.value)}
                  placeholder={'50% deposit to confirm\nBalance due 21 days before travel'}
                  disabled={!canManage}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                One entry per line. Up to 30 lines per list, 300 characters each.
                Save changes above to apply them.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Client brand preview
              </CardTitle>
              <CardDescription>
                A quick check of how the brand reads on a shared client page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <div
                  className="h-20"
                  style={{ backgroundColor: previewPrimary }}
                />
                <div className="px-4 pb-4">
                  <div className="-mt-8 flex items-end gap-3">
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm dark:border-slate-950 dark:bg-slate-900">
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span
                          className="grid h-full w-full place-items-center text-lg font-bold text-white"
                          style={{ backgroundColor: previewPrimary }}
                        >
                          {initial}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 pb-1">
                      <div
                        className="truncate text-base font-bold"
                        style={fontHeading.trim() ? { fontFamily: fontHeading.trim() } : undefined}
                      >
                        {name.trim() || activeAgency.name}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: previewAccent }}
                      >
                        {website.trim() || contactEmail.trim() || 'Your tagline here'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {contactPhone.trim() || 'Phone on client documents'}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: previewAccent }}
                      >
                        Powered by TravelAI
                      </span>
                    </div>
                    <div className="truncate">
                      {address.trim() || 'Address from the profile card'}
                    </div>
                    {gstin.trim() ? (
                      <div className="font-mono text-[10px] uppercase">
                        GSTIN {gstin.trim()}
                      </div>
                    ) : null}
                  </div>

                  {mascotPreview ? (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 dark:border-slate-800">
                      <img
                        src={mascotPreview}
                        alt=""
                        className="h-8 w-8 object-contain"
                      />
                      <span className="text-[11px] text-slate-500">
                        Your mascot appears on empty states and client pages.
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgencySettings;
