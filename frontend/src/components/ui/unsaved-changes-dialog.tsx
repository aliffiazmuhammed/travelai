import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { UnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

/**
 * The three-way exit for a dirty editor: Save and leave, discard, or stay.
 * Rendered next to the editor that owns the guard.
 */
export function UnsavedChangesDialog({
  guard,
  canSave = true,
}: {
  guard: UnsavedChangesGuard;
  /** False for read-only surfaces or an editor with nothing persistable. */
  canSave?: boolean;
}) {
  return (
    <AlertDialog
      open={guard.blocked}
      onOpenChange={(open) => {
        if (!open && !guard.saving) guard.stay();
      }}
    >
      <AlertDialogContent className="rounded-2xl border-border bg-card text-card-foreground">
        <AlertDialogHeader className="space-y-3">
          <span
            aria-hidden
            className="grid h-11 w-11 place-items-center rounded-full bg-warning/10 text-warning-ink"
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <AlertDialogTitle className="text-xl font-semibold leading-tight">
            Leave without saving?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            This page has unsaved changes. Save them first, discard them, or stay
            here and keep editing.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {guard.error ? (
          <p
            role="alert"
            className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {guard.error}
          </p>
        ) : null}

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={guard.stay}
            disabled={guard.saving}
          >
            Stay
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={guard.discard}
            disabled={guard.saving}
            className="text-muted-foreground hover:text-destructive"
          >
            Discard changes
          </Button>
          {canSave ? (
            <Button
              type="button"
              onClick={() => void guard.saveAndLeave()}
              disabled={guard.saving}
            >
              {guard.saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save and leave
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
