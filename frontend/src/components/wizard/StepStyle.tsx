import React from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface TravelStyleOption {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tags: string[];
}

const STYLE_OPTIONS: TravelStyleOption[] = [
  {
    id: "Adventure",
    name: "Adventure & Thrill",
    emoji: "🏔️",
    description: "Trekking, water sports, paragliding, high passes & river rafting",
    tags: ["Trekking", "Rafting", "Outdoor"],
  },
  {
    id: "Culture",
    name: "Culture & Heritage",
    emoji: "🏛️",
    description: "Forts, royal palaces, UNESCO temples, heritage walks & folklore",
    tags: ["Heritage", "Monuments", "History"],
  },
  {
    id: "Relaxation",
    name: "Relaxation & Wellness",
    emoji: "🧘",
    description: "Serene beaches, tranquil backwaters, Ayurvedic massage & slow pace",
    tags: ["Spa", "Beaches", "Peaceful"],
  },
  {
    id: "Food",
    name: "Food & Culinary Trail",
    emoji: "🍲",
    description: "Authentic local dhabas, street food walks, traditional thalis & cafes",
    tags: ["Street Food", "Regional Thalis", "Cafes"],
  },
  {
    id: "Nature",
    name: "Nature & Wildlife",
    emoji: "🌿",
    description: "Lush tea gardens, wildlife safaris, misty waterfalls & lakes",
    tags: ["Safaris", "Flora", "Scenic"],
  },
  {
    id: "Photography",
    name: "Photography & Views",
    emoji: "📸",
    description: "Breathtaking viewpoints, sunrise spots, vibrant streets & golden hours",
    tags: ["Landscape", "Golden Hour", "Insta-spots"],
  },
  {
    id: "Nightlife",
    name: "Nightlife & Social",
    emoji: "🎉",
    description: "Beach shacks, rooftop lounges, live music & vibrant evening markets",
    tags: ["Music", "Clubs", "Evening Vibe"],
  },
  {
    id: "Shopping",
    name: "Shopping & Souvenirs",
    emoji: "🛍️",
    description: "Local artisan bazaars, spice markets, textiles & authentic crafts",
    tags: ["Handicrafts", "Spices", "Bazaars"],
  },
];

interface StepStyleProps {
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

export const StepStyle: React.FC<StepStyleProps> = ({
  selectedInterests,
  onToggleInterest,
  onSelectAll,
  onClearAll,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>What travel style inspires you?</span>
          <span className="text-2xl">✨</span>
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Choose the experiences that match your vibe. Select one or more to personalize daily activities.
        </p>
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>
            {selectedInterests.length === 0
              ? "Select at least 1 interest"
              : `${selectedInterests.length} selected`}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-primary hover:underline font-semibold"
          >
            Select All
          </button>
          <span className="text-border">•</span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-muted-foreground hover:text-foreground font-semibold"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Grid of Styles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {STYLE_OPTIONS.map((style) => {
          const isSelected = selectedInterests.includes(style.id);
          return (
            <div
              key={style.id}
              onClick={() => onToggleInterest(style.id)}
              className={cn(
                "relative p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 bg-card",
                isSelected
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 scale-[1.01]"
                  : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl p-1 bg-card rounded-lg border border-border/50 shadow-2xs">
                    {style.emoji}
                  </span>
                  <div>
                    <h4 className="font-bold text-foreground text-sm">
                      {style.name}
                    </h4>
                  </div>
                </div>
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center transition-all",
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "border border-border/80 bg-background"
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 pl-0.5">
                {style.description}
              </p>

              <div className="flex flex-wrap gap-1">
                {style.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-2 py-0.5 border-border/60 bg-muted/30"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
