import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    icon: <User className="w-5 h-5 text-indigo-500" />,
    defaultAdults: 1,
  },
  {
    type: "Couple",
    title: "Couple / Duo",
    description: "Romantic spots, scenic views, intimate dining & memorable stays",
    icon: <Heart className="w-5 h-5 text-rose-500" />,
    defaultAdults: 2,
  },
  {
    type: "Family",
    title: "Family Vacation",
    description: "Comfortable pacing, kid-friendly spots, safety & spacious accommodations",
    icon: <Users className="w-5 h-5 text-amber-500" />,
    defaultAdults: 2,
  },
  {
    type: "Friends",
    title: "Friends Getaway",
    description: "Thrilling activities, lively nightlife, group adventures & sharing tips",
    icon: <UsersRound className="w-5 h-5 text-emerald-500" />,
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
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>Who is traveling with you?</span>
          <Users className="w-6 h-6 text-primary" aria-hidden="true" />
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          We tune activity paces, accommodation sizes, and food suggestions based on your traveling group.
        </p>
      </div>

      {/* Group Type Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {GROUP_OPTIONS.map((option) => {
          const isSelected = groupType === option.type;
          return (
            <div
              key={option.type}
              onClick={() => handleSelectGroup(option)}
              className={cn(
                "relative p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200",
                isSelected
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 scale-[1.01]"
                  : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/40"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-card border border-border/60 shadow-2xs">
                    {option.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-sm">
                      {option.title}
                    </h4>
                    <span className="text-xs text-muted-foreground font-medium">
                      {option.type}
                    </span>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pl-1">
                {option.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Traveler Counts Box */}
      <div className="p-6 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground">
            Traveler Details
          </span>
          <Badge variant="secondary" className="font-semibold">
            Total: {totalTravelers} {totalTravelers === 1 ? "Traveler" : "Travelers"}
          </Badge>
        </div>

        {/* Adults Counter */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Adults</h4>
            <p className="text-xs text-muted-foreground">Age 13 and above</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={adultsCount <= 1}
              onClick={() => onAdultsChange(Math.max(1, adultsCount - 1))}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="w-8 text-center font-bold text-base text-foreground">
              {adultsCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={adultsCount >= 20}
              onClick={() => onAdultsChange(adultsCount + 1)}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Children Counter */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Children</h4>
            <p className="text-xs text-muted-foreground">Age 0 - 12 years</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={childrenCount <= 0}
              onClick={() => onChildrenChange(Math.max(0, childrenCount - 1))}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="w-8 text-center font-bold text-base text-foreground">
              {childrenCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={childrenCount >= 10}
              onClick={() => onChildrenChange(childrenCount + 1)}
              className="h-9 w-9 rounded-full border-border/80"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
