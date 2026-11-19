import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ConfirmDestructiveTone = "destructive" | "warning";

export interface ConfirmDestructiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Says what is about to happen, naming the object — not "Are you sure?" */
  title: React.ReactNode;
  /** States the consequence in plain language. */
  description: React.ReactNode;
  /** A specific verb: "Remove member", "Cancel quote". Never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
  tone?: ConfirmDestructiveTone;
  /** Target chip, email, slug — anything that identifies the exact object. */
  detail?: React.ReactNode;
  /** Extra controls (e.g. a reason field) rendered above the confirmation. */
  children?: React.ReactNode;
  /**
   * Naming the object again in a text field turns a stray click into a
   * deliberate one. Comparison is trimmed and case-insensitive.
   */
  typedConfirmation?: {
    phrase: string;
    label?: string;
    placeholder?: string;
  };
  icon?: LucideIcon;
}

/**
 * The single destructive-action recipe: Radix AlertDialog, named target,
 * stated consequence, specific verb, neutral Cancel. Used in every realm.
 */
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  busy = false,
  error = null,
  tone = "destructive",
  detail,
  children,
  typedConfirmation,
  icon: Icon = tone === "warning" ? AlertTriangle : ShieldAlert,
}: ConfirmDestructiveProps) {
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const working = busy || pending;
  const phraseMatches =
    !typedConfirmation ||
    typed.trim().toLowerCase() === typedConfirmation.phrase.trim().toLowerCase();
  const canConfirm = phraseMatches && !working;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  const toneClasses =
    tone === "warning"
      ? "bg-warning text-warning-foreground hover:bg-warning/90"
      : "bg-destructive text-destructive-foreground hover:bg-destructive/90";
  const iconClasses =
    tone === "warning"
      ? "bg-warning/10 text-warning-ink"
      : "bg-destructive/10 text-destructive";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && working) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="rounded-2xl border-border bg-card text-card-foreground">
        <AlertDialogHeader className="space-y-3">
          <span
            aria-hidden
            className={cn("grid h-11 w-11 place-items-center rounded-full", iconClasses)}
          >
            <Icon className="h-5 w-5" />
          </span>
          <AlertDialogTitle className="text-xl font-semibold leading-tight">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {detail ? (
          <div className="rounded-xl border border-border/70 bg-muted/50 px-3 py-2.5 text-sm text-foreground">
            {detail}
          </div>
        ) : null}

        {children}

        {typedConfirmation ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-destructive-phrase">
              {typedConfirmation.label ?? "Type to confirm"}
            </Label>
            <Input
              id="confirm-destructive-phrase"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={typedConfirmation.placeholder ?? typedConfirmation.phrase}
              autoComplete="off"
              spellCheck={false}
              disabled={working}
              aria-describedby="confirm-destructive-hint"
            />
            <p
              id="confirm-destructive-hint"
              className="break-all text-xs leading-relaxed text-muted-foreground"
            >
              Type <span className="font-semibold text-foreground">{typedConfirmation.phrase}</span>{" "}
              exactly to enable this action.
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>{cancelLabel}</AlertDialogCancel>
          <button
            type="button"
            className={cn(buttonVariants(), toneClasses, "gap-2")}
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {working ? "Working…" : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
