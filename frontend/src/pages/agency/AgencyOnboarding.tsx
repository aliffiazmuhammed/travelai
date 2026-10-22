import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Loader2,
  Palette,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useAgency } from '@/context/AgencyContext';
import { AGENCY_INVITABLE_ROLES, agencyRoleLabel } from '@/lib/agency';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Agency, AgencyInvitableRole } from '@/types';

const STEPS = [
  { id: 1, label: 'Agency', icon: Building2 },
  { id: 2, label: 'Branding', icon: Palette },
  { id: 3, label: 'Team', icon: Users },
] as const;

/**
 * A1 onboarding: tenant, branding basics and an optional first invitation.
 * No trip/client data is created here, so A1 stays a clean tenancy increment.
 */
const AgencyOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { refreshAgencies, agencies } = useAgency();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0f766e');
  const [accentColor, setAccentColor] = useState('#f59e0b');

  const [inviteRole, setInviteRole] = useState<AgencyInvitableRole>('planner');
  const [inviteKind, setInviteKind] = useState<'link' | 'email'>('email');
  const [inviteEmail, setInviteEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [createdAgency, setCreatedAgency] = useState<Agency | null>(null);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = step !== 1 || name.trim().length >= 2;
  const canCreate =
    inviteKind === 'link' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());

  const branding = () => {
    const value: Record<string, string> = {};
    if (website.trim()) value.website = website.trim();
    if (contactEmail.trim()) value.contactEmail = contactEmail.trim();
    if (contactPhone.trim()) value.contactPhone = contactPhone.trim();
    if (address.trim()) value.address = address.trim();
    if (primaryColor) value.primaryColor = primaryColor;
    if (accentColor) value.accentColor = accentColor;
    return value;
  };

  const createAgency = async (withInvite: boolean) => {
    if (!canContinue) {
      setError('Enter an agency name with at least 2 characters.');
      setStep(1);
      return;
    }
    if (withInvite && !canCreate) {
      setError('Enter the email address for the invitation, or switch to a link.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await api.createAgency({
        name: name.trim(),
        branding: branding(),
      });
      setCreatedAgency(result.agency);

      let link = '';
      if (withInvite) {
        const invitation = await api.createAgencyInvite(result.agency._id, {
          role: inviteRole,
          kind: inviteKind,
          ...(inviteKind === 'email' ? { email: inviteEmail.trim() } : {}),
          ttlHours: 168,
        });
        link = invitation.link;
        setInviteLink(link);
      }

      await refreshAgencies(result.agency._id);
      toast.success(
        withInvite
          ? 'Agency created. Your first invitation is ready.'
          : 'Agency created.'
      );

      if (!withInvite) {
        navigate('/agency');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not create the agency. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Invitation link copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed. Select the link and copy it manually.');
    }
  };

  if (createdAgency) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="space-y-5 p-7 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <Check className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{createdAgency.name} is ready</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your agency workspace is separate from your personal trips.
              </p>
            </div>

            {inviteLink ? (
              <div className="space-y-2 text-left">
                <Label>Invitation link</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={inviteLink} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => void copyInvite()}>
                    {copied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  This link is single-use and expires in 7 days. You can create
                  more invitations from Team.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => navigate('/agency')}>
                Go to agency overview
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => navigate('/agency/team')}>
                Manage team
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {agencies.length > 0 ? (
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/agency">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to agency
          </Link>
        </Button>
      ) : null}

      <div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] text-teal-700 dark:text-teal-300">
            A1 · Agency setup
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Create your agency workspace
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Set up the tenant and invite your first teammate. Personal trips and
          chats remain untouched.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((entry, index) => (
          <React.Fragment key={entry.id}>
            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
                step === entry.id
                  ? 'border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                  : step > entry.id
                    ? 'border-teal-200 text-teal-700 dark:border-teal-900 dark:text-teal-400'
                    : 'border-slate-200 text-slate-400 dark:border-slate-800'
              )}
            >
              <entry.icon className="h-3.5 w-3.5" />
              {entry.label}
            </div>
            {index < STEPS.length - 1 ? (
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {step === 1
              ? 'Name your agency'
              : step === 2
                ? 'Add your brand basics'
                : 'Invite your first teammate'}
          </CardTitle>
          <CardDescription>
            {step === 1
              ? 'This is the name your team sees in the switcher and on future client documents.'
              : step === 2
                ? 'These details seed the agency profile. Full custom PDF branding arrives later.'
                : 'An invitation gets someone into this agency only. They keep their own personal workspace too.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="agency-name">Agency name</Label>
                <Input
                  id="agency-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Northstar Travel Studio"
                  maxLength={80}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-website">Website (optional)</Label>
                <Input
                  id="agency-website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-contact-email">Contact email (optional)</Label>
                <Input
                  id="agency-contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="hello@agency.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-contact-phone">Contact phone (optional)</Label>
                <Input
                  id="agency-contact-phone"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="+91 ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-address">Address (optional)</Label>
                <Textarea
                  id="agency-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="City, country"
                  rows={2}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="agency-primary">Primary colour</Label>
                <div className="flex gap-2">
                  <input
                    id="agency-primary"
                    type="color"
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(event) => setPrimaryColor(event.target.value)}
                    maxLength={7}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="agency-accent">Accent colour</Label>
                <div className="flex gap-2">
                  <input
                    id="agency-accent"
                    type="color"
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
                  />
                  <Input
                    value={accentColor}
                    onChange={(event) => setAccentColor(event.target.value)}
                    maxLength={7}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
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
                      {name.trim() || 'Your agency'}
                    </div>
                    <div className="text-xs" style={{ color: accentColor }}>
                      Brand accent preview
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as AgencyInvitableRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENCY_INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {agencyRoleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Invitation type</Label>
                  <Select
                    value={inviteKind}
                    onValueChange={(value) => setInviteKind(value as 'link' | 'email')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email-bound link</SelectItem>
                      <SelectItem value="link">Copyable link</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {inviteKind === 'email' ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="invite-email">Teammate email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="teammate@agency.com"
                    />
                    <p className="text-xs text-slate-500">
                      The link only works for this address. Delivery is manual in
                      v1: copy the link after creating the agency.
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
                You can skip this and invite people later from Team. An invitation
                can never grant ownership.
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((current) => (current > 1 ? ((current - 1) as 1 | 2 | 3) : current))}
              disabled={step === 1 || submitting}
            >
              Back
            </Button>
            <div className="flex flex-wrap gap-2">
              {step === 3 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void createAgency(false)}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Skip for now
                </Button>
              ) : null}
              {step < 3 ? (
                <Button
                  type="button"
                  onClick={() => setStep((current) => (current + 1) as 1 | 2 | 3)}
                  disabled={!canContinue}
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void createAgency(true)}
                  disabled={submitting || !canCreate}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create agency & invite
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyOnboarding;
