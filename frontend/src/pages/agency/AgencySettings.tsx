import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, Loader2, Lock, Palette, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/services/api';
import { useAgency } from '@/context/AgencyContext';
import { agencyRoleBadgeClass, agencyRoleLabel } from '@/lib/agency';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const AgencySettings: React.FC = () => {
  const {
    activeAgency,
    activeAgencyId,
    canManage,
    replaceAgency,
    loading,
  } = useAgency();

  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0f766e');
  const [accentColor, setAccentColor] = useState('#f59e0b');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeAgency) return;
    setName(activeAgency.name);
    setWebsite(activeAgency.branding.website ?? '');
    setContactEmail(activeAgency.branding.contactEmail ?? '');
    setContactPhone(activeAgency.branding.contactPhone ?? '');
    setAddress(activeAgency.branding.address ?? '');
    setPrimaryColor(activeAgency.branding.primaryColor ?? '#0f766e');
    setAccentColor(activeAgency.branding.accentColor ?? '#f59e0b');
  }, [activeAgency]);

  if (loading && !activeAgency) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading agency settings...
      </div>
    );
  }
  if (!activeAgencyId) {
    return <Navigate to="/agency" replace />;
  }
  if (!activeAgency) {
    return <Navigate to="/agency" replace />;
  }

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const branding: Record<string, string> = {
        primaryColor,
        accentColor,
      };
      if (website.trim()) branding.website = website.trim();
      if (contactEmail.trim()) branding.contactEmail = contactEmail.trim();
      if (contactPhone.trim()) branding.contactPhone = contactPhone.trim();
      if (address.trim()) branding.address = address.trim();

      const result = await api.updateAgency(activeAgencyId, {
        name: name.trim(),
        branding,
      });
      replaceAgency(result.agency);
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
            Profile and brand basics for this tenant. Full PDF template branding
            lands with the export milestones.
          </p>
        </div>
      </div>

      {!canManage ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          Only owners and admins can edit the agency profile. You can still view it.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Profile
            </CardTitle>
            <CardDescription>
              Shown to your team in the agency shell and used in future client
              documents.
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
            <div className="space-y-2">
              <Label htmlFor="settings-address">Address</Label>
              <Textarea
                id="settings-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={2}
                placeholder="City, country"
                disabled={!canManage}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="h-4 w-4" />
              Brand colours
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
                  value={primaryColor}
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
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-accent">Accent</Label>
              <div className="flex gap-2">
                <input
                  id="settings-accent"
                  type="color"
                  value={accentColor}
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
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Preview
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {name.trim().slice(0, 1).toUpperCase() || 'A'}
                </span>
                <div>
                  <div className="text-sm font-semibold">
                    {name.trim() || activeAgency.name}
                  </div>
                  <div className="text-xs" style={{ color: accentColor }}>
                    Brand accent preview
                  </div>
                </div>
              </div>
            </div>

            {canManage ? (
              <Button className="w-full" onClick={() => void save()} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save settings
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgencySettings;
