import React, { useState } from 'react';
import { Building2, KeyRound, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAgencyAuth } from '@/context/AgencyAuthContext';
import { toast } from 'sonner';

interface AgencyPasswordChangeProps {
  /**
   * First-login mode: the account was provisioned with a temporary password and
   * every other agency route is blocked until it is replaced.
   */
  forced?: boolean;
}

/**
 * Agency password form. It calls only `/api/agency/auth/password`, so the
 * personal password is never involved, and the server invalidates every other
 * agency session by bumping that account's `tokenVersion`.
 */
const AgencyPasswordChange: React.FC<AgencyPasswordChangeProps> = ({ forced = false }) => {
  const { agency, user, changePassword, logout } = useAgencyAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Your new password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from the current one.');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Your agency password has been updated.');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'We could not update your password. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <form className="space-y-4" onSubmit={submit}>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="current-password">
          {forced ? 'Temporary password' : 'Current password'}
        </Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="current-password"
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          className="h-11"
        />
        <p className="text-xs text-slate-500">At least 6 characters.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          className="h-11"
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Set new password
      </Button>
    </form>
  );

  if (!forced) {
    return (
      <Card className="border-slate-200 dark:border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-teal-600" />
            Agency password
          </CardTitle>
          <CardDescription>
            This changes only your agency account. Your personal TravelAI
            password stays the same.
          </CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            {agency?.name ?? 'TravelAI'} <span className="text-teal-600">Agency</span>
          </span>
        </div>

        <Card className="border-slate-200 shadow-sm dark:border-slate-800">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl">Set your agency password</CardTitle>
            <CardDescription>
              {user?.email ? `${user.email} was provisioned with a temporary password. ` : ''}
              Choose a new password to open the workspace. Your personal account
              is not affected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {form}
            <Button
              type="button"
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => void logout()}
              disabled={submitting}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgencyPasswordChange;
