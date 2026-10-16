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

export const WizardProgress: React.FC<WizardProgressProps> = ({
  steps,
  currentStep,
  onStepClick,
  canNavigateToStep,
}) => {
  const progressPercent = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <div className="w-full mb-8">
      {/* Top Progress Track */}
      <div className="relative mb-6">
        <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step Pills */}
      <div className="flex items-center justify-between relative">
        {steps.map((step) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isClickable = canNavigateToStep(step.id);

          return (
            <button
              key={step.id}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step.id)}
              className={cn(
                "flex flex-col items-center group transition-all text-center focus:outline-none",
                !isClickable && "cursor-not-allowed opacity-50"
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm transition-all duration-300 shadow-sm mb-1.5",
                  isCompleted && "bg-primary text-primary-foreground shadow-md scale-95",
                  isCurrent && "bg-primary text-primary-foreground ring-2 sm:ring-4 ring-primary/20 scale-105 sm:scale-110 shadow-md",
                  !isCompleted && !isCurrent && "bg-card border border-border/80 text-muted-foreground group-hover:border-primary/50"
                )}
              >
                {isCompleted ? (
                  <Check className="w-3.5 h-3.5 sm:w-5 sm:h-5 stroke-[2.5]" />
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium transition-colors hidden sm:block",
                  isCurrent ? "text-primary font-bold" : "text-muted-foreground",
                  isCompleted && "text-foreground"
                )}
              >
                {step.title}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors sm:hidden",
                  isCurrent ? "text-primary font-bold" : "text-muted-foreground"
                )}
              >
                {step.shortTitle}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
