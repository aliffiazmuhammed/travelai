import React, { useState } from 'react';
import { KeyRound, Loader2, LogOut, Mountain, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
          className="h-11 border-agency-line bg-agency-panel"
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
          className="h-11 border-agency-line bg-agency-panel"
        />
        <p className="text-xs text-agency-muted">At least 6 characters.</p>
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
          className="h-11 border-agency-line bg-agency-panel"
        />
      </div>

      <Button
        type="submit"
        className="h-11 w-full rounded-lg bg-agency-accent text-white hover:bg-agency-accent/90"
        disabled={submitting}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Set new password
      </Button>
    </form>
  );

  if (!forced) {
    return (
      <section className="rounded-2xl border border-agency-line bg-agency-panel p-6">
        <header className="mb-5 space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-agency-ink">
            <KeyRound className="h-4 w-4 text-agency-accent" />
            Agency password
          </h2>
          <p className="text-xs leading-5 text-agency-muted">
            This changes only your agency account. Your personal TravelAI
            password stays the same.
          </p>
        </header>
        {form}
      </section>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-agency-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-2.5">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-agency-accent text-white shadow-sm">
            <Mountain className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-agency-ink">
            {agency?.name ?? "TravelAI"}{" "}
            <span className="text-agency-accent">Agency</span>
          </span>
        </div>

        <div className="rounded-2xl border border-agency-line bg-agency-panel p-6 shadow-sm sm:p-8">
          <header className="space-y-1.5">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-agency-ink">
              Set your agency password
            </h1>
            <p className="text-sm leading-6 text-agency-muted">
              {user?.email
                ? `${user.email} was provisioned with a temporary password. `
                : ""}
              Choose a new password to open the workspace. Your personal
              account is not affected.
            </p>
          </header>

          <div className="mt-6">
            {form}
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11 w-full rounded-lg border-agency-line text-agency-ink hover:bg-agency-soft"
              onClick={() => void logout()}
              disabled={submitting}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 border-t border-agency-line pt-5 text-xs text-agency-muted">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Your personal TravelAI password stays the same.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AgencyPasswordChange;
