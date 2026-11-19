import React, { useState, useEffect } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Compass,
  Sparkles,
  MapPin,
  Calendar,
  Utensils,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Square,
  Wallet,
  Sunrise,
  CarTaxiFront,
  Backpack,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface GenerationOverlayProps {
  isOpen: boolean;
  destination: string;
  days: number;
  stage: number;
  progress: number;
  statusMessage: string;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

const STAGES = [
  {
    stage: 1,
    title: "Destination climate & advisory",
    icon: <MapPin className="h-4 w-4" />,
  },
  {
    stage: 2,
    title: "Day-by-day activity scheduling",
    icon: <Calendar className="h-4 w-4" />,
  },
  {
    stage: 3,
    title: "Stays & regional culinary hotspots",
    icon: <Utensils className="h-4 w-4" />,
  },
  {
    stage: 4,
    title: "Budget optimisation & local transit",
    icon: <IndianRupee className="h-4 w-4" />,
  },
  {
    stage: 5,
    title: "Safety, permits & connectivity",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
];

const TRAVEL_TIPS = [
  {
    icon: Wallet,
    text: "Most mountain towns in India prefer offline UPI or cash — mobile connectivity is patchy at high passes.",
  },
  {
    icon: Sunrise,
    text: "Scheduling morning temple visits avoids tourist queues and midday heat.",
  },
  {
    icon: CarTaxiFront,
    text: "Always verify auto-rickshaw meter rates or agree the fare before starting a local ride.",
  },
  {
    icon: Utensils,
    text: "Busy local dhabas with a steady local crowd usually serve the freshest regional food.",
  },
  {
    icon: Backpack,
    text: "Layers matter in the northern hills — temperatures swing sharply between day and night.",
  },
];

export const GenerationOverlay: React.FC<GenerationOverlayProps> = ({
  isOpen,
  destination,
  days,
  stage,
  progress,
  statusMessage,
  error,
  onRetry,
  onCancel,
}) => {
  const [tipIndex, setTipIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  // Rotate travel tips every 5 seconds; reduced motion keeps one tip still.
  useEffect(() => {
    if (!isOpen || error || reducedMotion) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TRAVEL_TIPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isOpen, error, reducedMotion]);

  const clampedProgress = Math.min(100, Math.max(10, progress));
  const isStreaming = !error && progress < 100;

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        // Escape and the close control both take the cancel path.
        if (!open) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-background/80 backdrop-blur-md",
            !reducedMotion && "animate-fade-in"
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-x-hidden overflow-y-auto rounded-3xl border border-border/70 bg-card p-5 text-center shadow-card sm:p-8"
        >
        {(error || isStreaming) && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={isStreaming ? "Stop generating and close" : "Close"}
            className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* State Visual */}
        <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
          {error ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-8 w-8" aria-hidden="true" />
            </div>
          ) : progress >= 100 ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent-ink">
              <CheckCircle2 className="h-8 w-8 stroke-[2.5]" aria-hidden="true" />
            </div>
          ) : (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 rounded-full border border-primary/20 opacity-40",
                  !reducedMotion && "animate-ping"
                )}
              />
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Compass
                  className={cn("h-8 w-8", !reducedMotion && "animate-pulse")}
                  aria-hidden="true"
                />
              </div>
            </>
          )}
        </div>

        {/* Status Copy */}
        <div className="mt-4 space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            AI travel assistant
          </p>

          <DialogPrimitive.Title className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {error
              ? "Itinerary generation paused"
              : progress >= 100
              ? "Your itinerary is ready"
              : `Synthesizing your ${days}-day trip`}
          </DialogPrimitive.Title>

          <p
            aria-live="polite"
            className="px-2 text-sm leading-relaxed text-muted-foreground"
          >
            {error
              ? error
              : statusMessage || `Planning activities for ${destination}...`}
          </p>
        </div>

        {/* Progress */}
        {!error && (
          <div className="mx-auto mt-4 max-w-sm space-y-2">
            <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground">
              <span>Progress</span>
              <span className="text-primary">{clampedProgress}%</span>
            </div>
            <Progress value={clampedProgress} className="h-2 rounded-full bg-muted/60" />
          </div>
        )}

        {/* Stages */}
        {!error && (
          <ol className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 text-left">
            {STAGES.map((s) => {
              const isPast = stage > s.stage || progress >= 100;
              const isCurrent = stage === s.stage && progress < 100;

              return (
                <li
                  key={s.stage}
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-2.5 text-xs transition-colors",
                    isCurrent && "bg-primary/5 font-semibold text-foreground",
                    isPast && "text-muted-foreground",
                    !isPast && !isCurrent && "text-muted-foreground/60"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "shrink-0",
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      {s.icon}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </span>
                  <span className="shrink-0">
                    {isPast ? (
                      <CheckCircle2
                        className="h-4 w-4 text-accent-ink"
                        aria-hidden="true"
                      />
                    ) : isCurrent ? (
                      <span
                        className={cn(
                          "block h-2 w-2 rounded-full bg-primary",
                          !reducedMotion && "animate-ping"
                        )}
                      />
                    ) : (
                      <span className="block h-1.5 w-1.5 rounded-full bg-border" />
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {/* Rotating Travel Tip */}
        {isStreaming && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-border/60 bg-muted/30 p-3 text-left text-xs text-muted-foreground">
            {React.createElement(TRAVEL_TIPS[tipIndex].icon, {
              className: "mt-px h-4 w-4 shrink-0 text-primary",
              "aria-hidden": true,
            })}
            <span className="leading-relaxed">{TRAVEL_TIPS[tipIndex].text}</span>
          </div>
        )}

        {/* Cancel is always available while streaming, and it really stops. */}
        {isStreaming && (
          <div className="mt-5 space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-10 rounded-xl text-xs font-semibold gap-2"
            >
              <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Stop generating</span>
            </Button>
            <p className="px-2 text-xs leading-relaxed text-muted-foreground">
              Stopping cancels the request on our servers. Nothing is saved, and
              you can change any answer before trying again.
            </p>
          </div>
        )}

        {/* Error Actions */}
        {error && (
          <div className="mt-5 space-y-2">
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="h-11 rounded-xl text-xs font-semibold"
              >
                Back to the wizard
              </Button>
              <Button
                type="button"
                variant="hero"
                onClick={onRetry}
                className="h-11 rounded-xl text-xs font-bold gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry generation</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              No trip was created. Retrying continues this same attempt.
            </p>
          </div>
        )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
