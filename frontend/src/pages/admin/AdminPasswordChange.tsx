import React, { useState } from 'react';
import { KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { AdminNotice } from '@/components/admin/AdminNotice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatformAuth } from '@/context/PlatformAuthContext';
import { toast } from 'sonner';

interface AdminPasswordChangeProps {
  /** First-login mode: every other admin route stays blocked until replaced. */
  forced?: boolean;
}

/**
 * Platform password form (PA1). Calls only `/api/admin/auth/password`, so no
 * personal or agency credential is involved, and the server bumps this
 * account's `tokenVersion` to invalidate every other platform device.
 */
const AdminPasswordChange: React.FC<AdminPasswordChangeProps> = ({ forced = false }) => {
  const { user, changePassword, logout } = usePlatformAuth();

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
      toast.success('Your platform password has been updated.');
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
      {error ? <AdminNotice tone="error">{error}</AdminNotice> : null}

      <div className="space-y-2">
        <Label htmlFor="admin-current-password">
          {forced ? 'Temporary password' : 'Current password'}
        </Label>
        <Input
          id="admin-current-password"
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
        <Label htmlFor="admin-new-password">New password</Label>
        <Input
          id="admin-new-password"
          type="password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
            if (error) setError(null);
          }}
          autoComplete="new-password"
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">At least 6 characters.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-confirm-password">Confirm new password</Label>
        <Input
          id="admin-confirm-password"
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

      <Button
        type="submit"
        className="h-11 w-full bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:ring-indigo-400"
        disabled={submitting}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
        Set new password
      </Button>
    </form>
  );

  if (!forced) {
    return (
      <Card className="rounded-2xl border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-indigo-400" aria-hidden />
            Platform password
          </CardTitle>
          <CardDescription>
            Changing this affects your platform account only. Personal and agency
            passwords are untouched.
          </CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    );
  }

  return (
    <div className="dark relative isolate grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_32rem_at_50%_-10%,rgba(99,102,241,0.18),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px]"
      />

      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/25">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            TravelAI <span className="text-indigo-400">Platform</span>
          </span>
        </div>

        <Card className="rounded-2xl border-border bg-card shadow-xl shadow-black/20">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl tracking-tight">Set your platform password</CardTitle>
            <CardDescription className="leading-6">
              {user?.email
                ? `${user.email} was bootstrapped with a temporary password. `
                : ''}
              Choose a new one to open the console. Your personal and agency
              accounts are not affected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {form}
            <Button
              type="button"
              variant="ghost"
              className="mt-3 h-10 w-full text-muted-foreground hover:text-foreground"
              onClick={() => void logout()}
              disabled={submitting}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Every credential change is written to the platform audit trail.
        </p>
      </div>
    </div>
  );
};

export default AdminPasswordChange;
