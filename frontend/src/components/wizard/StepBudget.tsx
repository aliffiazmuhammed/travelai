import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Check, Backpack, Coffee, Gem, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepBudgetProps {
  budgetPerPerson: number;
  totalTravelers: number;
  onChange: (value: number) => void;
}

interface BudgetTier {
  id: string;
  name: string;
  min: number;
  max: number;
  preset: number;
  icon: LucideIcon;
  tagline: string;
}

const BUDGET_TIERS: BudgetTier[] = [
  {
    id: "backpacker",
    name: "Shoestring / Backpacker",
    min: 3000,
    max: 8000,
    preset: 6000,
    icon: Backpack,
    tagline: "Social hostels, street eats & local public transit",
  },
  {
    id: "moderate",
    name: "Balanced & Comfortable",
    min: 8001,
    max: 20000,
    preset: 15000,
    icon: Coffee,
    tagline: "Cozy 3★ hotels, authentic dining & app cabs / autos",
  },
  {
    id: "premium",
    name: "Premium Vacation",
    min: 20001,
    max: 45000,
    preset: 30000,
    icon: Gem,
    tagline: "Boutique 4★ stays, private car hire & premier cafes",
  },
  {
    id: "luxury",
    name: "Luxury / Heritage",
    min: 45001,
    max: 150000,
    preset: 60000,
    icon: Crown,
    tagline: "5★ heritage palaces, private chauffeur & bespoke tours",
  },
];

export const StepBudget: React.FC<StepBudgetProps> = ({
  budgetPerPerson,
  totalTravelers,
  onChange,
}) => {
  const [isTotalMode, setIsTotalMode] = useState(false);

  // Get active tier
  const activeTier =
    BUDGET_TIERS.find(
      (tier) => budgetPerPerson >= tier.min && budgetPerPerson <= tier.max
    ) || (budgetPerPerson < 8000 ? BUDGET_TIERS[0] : BUDGET_TIERS[3]);

  const totalBudget = budgetPerPerson * Math.max(1, totalTravelers);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, "");
    const num = parseInt(rawVal, 10) || 0;
    if (isTotalMode) {
      onChange(Math.max(1000, Math.round(num / Math.max(1, totalTravelers))));
    } else {
      onChange(Math.max(1000, num));
    }
  };

  const handleSliderChange = (vals: number[]) => {
    const val = vals[0] ?? 15000;
    onChange(val);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          What&rsquo;s the travel budget?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          A rough number is fine — we allocate it realistically
        </p>
      </div>

      {/* Mode Switch (Per Person vs Total Group) */}
      <div className="flex">
        <div className="inline-flex items-center rounded-full border border-border/80 bg-muted/60 p-1">
          <button
            type="button"
            aria-pressed={!isTotalMode}
            onClick={() => setIsTotalMode(false)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              !isTotalMode
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Per person
          </button>
          <button
            type="button"
            aria-pressed={isTotalMode}
            onClick={() => setIsTotalMode(true)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              isTotalMode
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Total for {totalTravelers} {totalTravelers === 1 ? "person" : "people"}
          </button>
        </div>
      </div>

      {/* Main Budget Display & Input */}
      <div className="space-y-5 rounded-2xl border border-border/80 px-4 py-6 sm:px-6">
        <div className="text-center">
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-display text-2xl font-semibold text-muted-foreground sm:text-3xl">
              ₹
            </span>
            <Input
              type="text"
              aria-label={isTotalMode ? "Total trip budget" : "Budget per person"}
              value={(isTotalMode ? totalBudget : budgetPerPerson).toLocaleString("en-IN")}
              onChange={handleInputChange}
              className="h-14 max-w-[260px] border-none bg-transparent p-0 text-center font-display text-3xl font-semibold tracking-tight text-primary shadow-none focus-visible:ring-0 sm:text-4xl"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isTotalMode
              ? `(approx. ₹${budgetPerPerson.toLocaleString("en-IN")} per person)`
              : totalTravelers > 1
              ? `(approx. ₹${totalBudget.toLocaleString("en-IN")} total for ${totalTravelers} travelers)`
              : "Standard estimated budget"}
          </p>
        </div>

        {/* Interactive Slider */}
        <div className="space-y-2 px-1">
          <Slider
            min={3000}
            max={100000}
            step={1000}
            value={[budgetPerPerson]}
            onValueChange={handleSliderChange}
            className="py-4"
          />
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
            <span>₹3,000 (Shoestring)</span>
            <span>₹25,000 (Popular)</span>
            <span>₹1,00,000+ (Luxury)</span>
          </div>
        </div>
      </div>

      {/* Preset Budget Tiers */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Recommended budget tiers
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BUDGET_TIERS.map((tier) => {
            const isSelected = activeTier?.id === tier.id;
            const TierIcon = tier.icon;
            return (
              <button
                key={tier.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onChange(tier.preset)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <TierIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">
                        {tier.name}
                      </span>
                      <span className="block text-xs font-medium text-primary">
                        ~₹{tier.preset.toLocaleString("en-IN")} / person
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
                <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                  {tier.tagline}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
