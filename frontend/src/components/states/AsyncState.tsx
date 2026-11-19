import React from "react";
import { AlertTriangle, Loader2, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeAsyncError, type AsyncErrorKind } from "@/lib/asyncError";
import { cn } from "@/lib/utils";

const errorIcon = (kind: AsyncErrorKind) => {
  if (kind === "forbidden") return ShieldAlert;
  if (kind === "offline") return WifiOff;
  return AlertTriangle;
};

export const AsyncErrorPanel: React.FC<{
  error: unknown;
  /** Noun phrase such as "your trips" or "the client directory". */
  subject?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}> = ({ error, subject, onRetry, retrying = false, className }) => {
  const copy = describeAsyncError(error, subject);
  const Icon = errorIcon(copy.kind);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{copy.title}</p>
          <p className="max-w-prose text-xs leading-5 text-muted-foreground">
            {copy.description}
          </p>
        </div>
      </div>
      {onRetry && !copy.forbidden ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-xl text-xs font-semibold"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
};

/**
 * The single polite announcement for a list that is still loading. Content
 * skeletons stay `aria-hidden`; the error panel speaks for itself via
 * `role="alert"`, so a transition is announced exactly once.
 */
export const AsyncLiveStatus: React.FC<{ message: string | null }> = ({
  message,
}) => (
  <p role="status" aria-live="polite" className="sr-only">
    {message ?? ""}
  </p>
);
