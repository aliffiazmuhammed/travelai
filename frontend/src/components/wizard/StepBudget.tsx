import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, Sparkles, Check } from "lucide-react";
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
  icon: string;
  tagline: string;
  color: string;
}

const BUDGET_TIERS: BudgetTier[] = [
  {
    id: "backpacker",
    name: "Shoestring / Backpacker",
    min: 3000,
    max: 8000,
    preset: 6000,
    icon: "🎒",
    tagline: "Social hostels, street eats & local public transit",
    color: "border-blue-500/40 text-blue-600 bg-blue-500/10",
  },
  {
    id: "moderate",
    name: "Balanced & Comfortable",
    min: 8001,
    max: 20000,
    preset: 15000,
    icon: "☕",
    tagline: "Cozy 3★ hotels, authentic dining & app cabs / autos",
    color: "border-emerald-500/40 text-emerald-600 bg-emerald-500/10",
  },
  {
    id: "premium",
    name: "Premium Vacation",
    min: 20001,
    max: 45000,
    preset: 30000,
    icon: "✨",
    tagline: "Boutique 4★ stays, private car hire & premier cafes",
    color: "border-purple-500/40 text-purple-600 bg-purple-500/10",
  },
  {
    id: "luxury",
    name: "Luxury / Heritage",
    min: 45001,
    max: 150000,
    preset: 60000,
    icon: "👑",
    tagline: "5★ heritage palaces, private chauffeur & bespoke tours",
    color: "border-amber-500/40 text-amber-600 bg-amber-500/10",
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
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>What is your budget?</span>
          <span className="text-2xl">💰</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          AI will allocate expenses realistically across stays, food, permits, activities, and transit.
        </p>
      </div>

      {/* Mode Switch (Per Person vs Total Group) */}
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 bg-muted/80 rounded-full border border-border/80">
          <button
            type="button"
            onClick={() => setIsTotalMode(false)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
              !isTotalMode
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Per Person
          </button>
          <button
            type="button"
            onClick={() => setIsTotalMode(true)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-semibold transition-all",
              isTotalMode
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Total for {totalTravelers} {totalTravelers === 1 ? "Person" : "People"}
          </button>
        </div>
      </div>

      {/* Main Budget Display & Input */}
      <div className="p-6 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl sm:text-4xl font-extrabold text-foreground">
              ₹
            </span>
            <Input
              type="text"
              value={(isTotalMode ? totalBudget : budgetPerPerson).toLocaleString("en-IN")}
              onChange={handleInputChange}
              className="h-16 text-3xl sm:text-4xl font-extrabold text-center max-w-[280px] border-none shadow-none focus-visible:ring-0 bg-transparent text-primary tracking-tight"
            />
          </div>
          <p className="text-xs text-muted-foreground font-medium">
            {isTotalMode
              ? `(approx. ₹${budgetPerPerson.toLocaleString("en-IN")} per person)`
              : totalTravelers > 1
              ? `(approx. ₹${totalBudget.toLocaleString("en-IN")} total for ${totalTravelers} travelers)`
              : "Standard estimated budget"}
          </p>
        </div>

        {/* Interactive Slider */}
        <div className="space-y-2 px-2">
          <Slider
            min={3000}
            max={100000}
            step={1000}
            value={[budgetPerPerson]}
            onValueChange={handleSliderChange}
            className="py-4"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
            <span>₹3,000 (Shoestring)</span>
            <span>₹25,000 (Popular)</span>
            <span>₹1,00,000+ (Luxury)</span>
          </div>
        </div>
      </div>

      {/* Preset Budget Tiers */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Recommended Budget Tiers</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BUDGET_TIERS.map((tier) => {
            const isSelected = activeTier?.id === tier.id;
            return (
              <div
                key={tier.id}
                onClick={() => onChange(tier.preset)}
                className={cn(
                  "p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 bg-card",
                  isSelected
                    ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 scale-[1.01]"
                    : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{tier.icon}</span>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">
                        {tier.name}
                      </h4>
                      <span className="text-[11px] font-semibold text-primary">
                        ~₹{tier.preset.toLocaleString("en-IN")} / person
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug pl-0.5">
                  {tier.tagline}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
