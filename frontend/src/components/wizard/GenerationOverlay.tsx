import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    title: "Destination Climate & Advisory",
    icon: <MapPin className="w-4 h-4 text-primary" />,
  },
  {
    stage: 2,
    title: "Day-by-Day Activity Scheduling",
    icon: <Calendar className="w-4 h-4 text-blue-500" />,
  },
  {
    stage: 3,
    title: "Stays & Regional Culinary Hotspots",
    icon: <Utensils className="w-4 h-4 text-orange-500" />,
  },
  {
    stage: 4,
    title: "Budget Optimization & Local Transit",
    icon: <IndianRupee className="w-4 h-4 text-emerald-500" />,
  },
  {
    stage: 5,
    title: "Safety, Permits & Connectivity",
    icon: <ShieldCheck className="w-4 h-4 text-purple-500" />,
  },
];

const TRAVEL_TIPS = [
  "💡 Pro Tip: Most mountain towns in India prefer offline UPI or cash due to patchy mobile connectivity at high passes.",
  "✨ AI Insight: Scheduling morning temple visits avoids tourist queues and midday heat.",
  "🛺 Transit Tip: Always verify auto-rickshaw meter rates or negotiate before beginning local rides.",
  "🍲 Foodie Tip: Look for bustling local dhabas with high local footfall for the freshest, safest regional dishes.",
  "🎒 Packing Tip: Layering is essential for North Indian hill stations as temperatures swing drastically between day and night.",
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

  // Rotate travel tips every 5 seconds
  useEffect(() => {
    if (!isOpen || error) return;
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TRAVEL_TIPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isOpen, error]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden p-5 sm:p-7 rounded-3xl bg-card border border-border/80 shadow-2xl text-center space-y-3.5 sm:space-y-4">
        {/* Subtle Background Glow - clipped inside container so it never triggers scrollbars */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-accent/20 rounded-full blur-3xl" />
        </div>

        {/* Close / Cancel Button if error */}
        {error && (
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground bg-muted/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Animated Central Visual */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          {error ? (
            <div className="w-20 h-20 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center shadow-inner">
              <AlertCircle className="w-10 h-10 animate-bounce" />
            </div>
          ) : progress >= 100 ? (
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-md animate-fade-in">
              <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Outer Pulsing Ring */}
              <div className="absolute inset-0 w-24 h-24 rounded-full border-2 border-primary/30 animate-ping opacity-30" />
              {/* Rotating Gradient Border */}
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary via-accent to-secondary p-1 shadow-lg animate-spin [animation-duration:6s]">
                <div className="w-full h-full bg-card rounded-xl flex items-center justify-center" />
              </div>
              <Compass className="absolute w-8 h-8 text-primary animate-pulse" />
            </div>
          )}
        </div>

        {/* Main Status Text */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Travel Assistant</span>
          </div>

          <h3 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
            {error
              ? "Itinerary Generation Paused"
              : progress >= 100
              ? "Itinerary Ready!"
              : `Synthesizing Your ${days}-Day Trip`}
          </h3>

          <p className="text-xs sm:text-sm text-muted-foreground font-medium px-4">
            {error ? error : statusMessage || `Planning activities for ${destination}...`}
          </p>
        </div>

        {/* Live Progress Bar */}
        {!error && (
          <div className="space-y-2 max-w-sm mx-auto">
            <div className="flex justify-between items-center text-xs font-bold text-muted-foreground px-1">
              <span>Progress</span>
              <span className="text-primary">{Math.min(100, Math.max(10, progress))}%</span>
            </div>
            <Progress
              value={Math.min(100, Math.max(10, progress))}
              className="h-2.5 rounded-full bg-muted/60"
            />
          </div>
        )}

        {/* Progressive Stages List */}
        {!error && (
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/60 text-left space-y-2.5">
            {STAGES.map((s) => {
              const isPast = stage > s.stage || progress >= 100;
              const isCurrent = stage === s.stage && progress < 100;

              return (
                <div
                  key={s.stage}
                  className={cn(
                    "flex items-center justify-between text-xs py-1 px-2 rounded-lg transition-all",
                    isCurrent && "bg-primary/10 font-bold text-foreground",
                    isPast && "text-muted-foreground",
                    !isPast && !isCurrent && "opacity-40 text-muted-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0">{s.icon}</span>
                    <span className={cn(isCurrent ? "text-primary" : "")}>
                      {s.title}
                    </span>
                  </div>
                  <div>
                    {isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-border" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rotating Travel Tip Box */}
        {!error && progress < 100 && (
          <div className="p-3 bg-card/60 border border-border/60 rounded-xl text-[11px] text-muted-foreground italic transition-all duration-300">
            {TRAVEL_TIPS[tipIndex]}
          </div>
        )}

        {/* Actions for Error State */}
        {error && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="rounded-xl h-11 text-xs font-semibold"
            >
              Back to Wizard
            </Button>
            <Button
              type="button"
              variant="hero"
              onClick={onRetry}
              className="rounded-xl h-11 text-xs font-bold gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Generation</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
