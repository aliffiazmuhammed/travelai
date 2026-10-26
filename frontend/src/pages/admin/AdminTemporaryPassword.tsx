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
      <DialogContent className="border-slate-800 bg-slate-900 text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            Temporary password
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {description ??
              'Share this credential securely. It is shown once and must be changed at first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Account
            </p>
            <p className="mt-0.5 break-all text-sm text-slate-200">{email}</p>
          </div>

          {workspace ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Workspace
              </p>
              <p className="mt-0.5 text-sm text-slate-200">{workspace}</p>
              <p className="mt-1 text-xs text-slate-500">
                Sign in at <code className="rounded bg-slate-950 px-1 py-0.5">/agency/login</code>{' '}
                with this workspace slug.
              </p>
            </div>
          ) : null}

          <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">
              One-time password
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950 px-2.5 py-2 font-mono text-sm text-amber-200">
                {temporaryPassword}
              </code>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
                onClick={() => void copy()}
                aria-label="Copy temporary password"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            This value is not stored and cannot be shown again. A first sign-in is
            forced through a password change before the account can do anything else.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="bg-indigo-500 text-white hover:bg-indigo-400"
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
