import React from "react";
import { Button } from "@/components/ui/button";
import { User, Users, Heart, UsersRound, Plus, Minus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupOption {
  type: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultAdults: number;
}

const GROUP_OPTIONS: GroupOption[] = [
  {
    type: "Solo",
    title: "Solo Explorer",
    description: "Tailored for one curious soul with complete flexibility & hidden gems",
    icon: <User className="h-5 w-5 text-primary" />,
    defaultAdults: 1,
  },
  {
    type: "Couple",
    title: "Couple / Duo",
    description: "Romantic spots, scenic views, intimate dining & memorable stays",
    icon: <Heart className="h-5 w-5 text-primary" />,
    defaultAdults: 2,
  },
  {
    type: "Family",
    title: "Family Vacation",
    description: "Comfortable pacing, kid-friendly spots, safety & spacious accommodations",
    icon: <Users className="h-5 w-5 text-primary" />,
    defaultAdults: 2,
  },
  {
    type: "Friends",
    title: "Friends Getaway",
    description: "Thrilling activities, lively nightlife, group adventures & sharing tips",
    icon: <UsersRound className="h-5 w-5 text-primary" />,
    defaultAdults: 4,
  },
];

interface StepWhoProps {
  groupType: string;
  adultsCount: number;
  childrenCount: number;
  onGroupTypeChange: (type: string) => void;
  onAdultsChange: (count: number) => void;
  onChildrenChange: (count: number) => void;
}

export const StepWho: React.FC<StepWhoProps> = ({
  groupType,
  adultsCount,
  childrenCount,
  onGroupTypeChange,
  onAdultsChange,
  onChildrenChange,
}) => {
  const handleSelectGroup = (option: GroupOption) => {
    onGroupTypeChange(option.type);
    if (option.type === "Solo") {
      onAdultsChange(1);
      onChildrenChange(0);
    } else if (adultsCount === 1 && option.type !== "Solo") {
      onAdultsChange(option.defaultAdults);
    }
  };

  const totalTravelers = adultsCount + childrenCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Who&rsquo;s coming along?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          We tune the pace, stays and food tips to your group
        </p>
      </div>

      {/* Group Type */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GROUP_OPTIONS.map((option) => {
          const isSelected = groupType === option.type;
          return (
            <button
              key={option.type}
              type="button"
              aria-pressed={isSelected}
              onClick={() => handleSelectGroup(option)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
                isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    {option.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">
                      {option.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {option.type}
                    </span>
                  </span>
                </div>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/80 bg-background"
                  )}
                >
                  {isSelected && (
                    <Check className="h-3 w-3 stroke-[3]" aria-hidden="true" />
                  )}
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Traveler Counts */}
      <div className="divide-y divide-border/60 rounded-2xl border border-border/80">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <span className="text-xs font-semibold text-muted-foreground">
            Traveler details
          </span>
          <span className="text-xs font-semibold text-foreground">
            {totalTravelers} {totalTravelers === 1 ? "traveler" : "travelers"}
          </span>
        </div>

        {/* Adults Counter */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Adults</p>
            <p className="text-xs text-muted-foreground">Age 13 and above</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Remove one adult"
              disabled={adultsCount <= 1}
              onClick={() => onAdultsChange(Math.max(1, adultsCount - 1))}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-6 text-center text-sm font-semibold text-foreground">
              {adultsCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add one adult"
              disabled={adultsCount >= 20}
              onClick={() => onAdultsChange(adultsCount + 1)}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Children Counter */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Children</p>
            <p className="text-xs text-muted-foreground">Age 0 - 12 years</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Remove one child"
              disabled={childrenCount <= 0}
              onClick={() => onChildrenChange(Math.max(0, childrenCount - 1))}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-6 text-center text-sm font-semibold text-foreground">
              {childrenCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Add one child"
              disabled={childrenCount >= 10}
              onClick={() => onChildrenChange(childrenCount + 1)}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
