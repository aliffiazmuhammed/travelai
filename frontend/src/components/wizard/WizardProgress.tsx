import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStep {
  id: number;
  title: string;
  shortTitle: string;
  iconName?: string;
}

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick: (stepId: number) => void;
  canNavigateToStep: (stepId: number) => boolean;
}

/**
 * Numbered-step rail. Completed steps are filled, the current step is filled
 * in primary with its label below, and steps that are not reachable yet stay
 * muted. On narrow screens the rail scrolls inside its own strip so the page
 * itself never gains a horizontal scrollbar.
 */
export const WizardProgress: React.FC<WizardProgressProps> = ({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
}) => {
  return (
    <nav aria-label="Trip planner steps" className="w-full">
      <ol className="no-scrollbar -mx-1 flex items-start overflow-x-auto px-1">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isClickable = canNavigateToStep(step.id);
          const isLast = index === steps.length - 1;

          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 items-start",
                isLast ? "flex-none" : "flex-1"
              )}
            >
              <button
                type="button"
                disabled={!isClickable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${step.id}: ${step.title}`}
                onClick={() => isClickable && onStepClick(step.id)}
                className={cn(
                  "group flex shrink-0 flex-col items-center gap-2 rounded-xl px-1.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isClickable ? "cursor-pointer" : "cursor-not-allowed"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:h-9 sm:w-9 sm:text-sm",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent &&
                      "bg-primary text-primary-foreground ring-4 ring-primary/15",
                    !isCompleted &&
                      !isCurrent &&
                      "border border-border/80 bg-muted/60 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
                  ) : (
                    <span>{step.id}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium leading-none transition-colors sm:text-xs",
                    isCurrent && "font-semibold text-primary",
                    isCompleted && "text-foreground/80",
                    !isCompleted && !isCurrent && "text-muted-foreground"
                  )}
                >
                  {step.shortTitle}
                </span>
              </button>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-5 h-px min-w-[8px] flex-1 transition-colors sm:mt-[22px]",
                    isCompleted ? "bg-primary/30" : "bg-border/80"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
