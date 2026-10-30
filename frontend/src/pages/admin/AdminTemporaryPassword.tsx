import React, { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface AdminTemporaryPasswordProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  temporaryPassword: string;
  workspace?: string;
  /** Explains where the credential is used (workspace login vs admin login). */
  description?: string;
}

/**
 * One-time credential hand-off (PA2). The server never stores the temporary
 * password in plaintext and cannot show it again, so the console makes the
 * "shown once" contract explicit and offers copy-to-clipboard.
 */
const AdminTemporaryPassword: React.FC<AdminTemporaryPasswordProps> = ({
  open,
  onOpenChange,
  email,
  temporaryPassword,
  workspace,
  description,
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      toast.success('Temporary password copied.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy automatically. Select the password and copy it manually.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark max-w-md rounded-2xl border-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
              <KeyRound className="h-4 w-4" aria-hidden />
            </span>
            Temporary password
          </DialogTitle>
          <DialogDescription className="leading-6">
            {description ??
              'Share this credential securely. It is shown once and must be changed at first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <dl className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Account
              </dt>
              <dd className="mt-0.5 break-all text-sm">{email}</dd>
            </div>
            {workspace ? (
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Workspace
                </dt>
                <dd className="mt-0.5 truncate text-sm">{workspace}</dd>
              </div>
            ) : null}
          </dl>

          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              One-time password
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-amber-500/20 bg-background px-2.5 py-2 font-mono text-sm text-amber-200">
                {temporaryPassword}
              </code>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 border-amber-500/30 bg-background text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                onClick={() => void copy()}
                aria-label="Copy temporary password"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
            {workspace ? (
              <p className="mt-2 text-xs text-amber-200/70">
                Sign in at{' '}
                <code className="rounded bg-background/60 px-1 py-0.5">/agency/login</code> with
                this workspace slug.
              </p>
            ) : null}
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            This value is not stored and cannot be shown again. A first sign-in is
            forced through a password change before the account can do anything else.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="bg-indigo-500 text-white hover:bg-indigo-400 focus-visible:ring-indigo-400"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminTemporaryPassword;
