import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Sparkles,
  Languages,
  Gauge,
  UtensilsCrossed,
  Mountain,
  Landmark,
  Waves,
  Trees,
  Camera,
  Music,
  ShoppingBag,
  Coffee,
  Footprints,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripLanguage, TravelPace } from "@/types/trip";

interface TravelStyleOption {
  id: string;
  name: string;
  icon: LucideIcon;
  description: string;
  tags: string[];
}

const STYLE_OPTIONS: TravelStyleOption[] = [
  {
    id: "Adventure",
    name: "Adventure & Thrill",
    icon: Mountain,
    description: "Trekking, water sports, paragliding, high passes & river rafting",
    tags: ["Trekking", "Rafting", "Outdoor"],
  },
  {
    id: "Culture",
    name: "Culture & Heritage",
    icon: Landmark,
    description: "Forts, royal palaces, UNESCO temples, heritage walks & folklore",
    tags: ["Heritage", "Monuments", "History"],
  },
  {
    id: "Relaxation",
    name: "Relaxation & Wellness",
    icon: Waves,
    description: "Serene beaches, tranquil backwaters, Ayurvedic massage & slow pace",
    tags: ["Spa", "Beaches", "Peaceful"],
  },
  {
    id: "Food",
    name: "Food & Culinary Trail",
    icon: UtensilsCrossed,
    description: "Authentic local dhabas, street food walks, traditional thalis & cafes",
    tags: ["Street Food", "Regional Thalis", "Cafes"],
  },
  {
    id: "Nature",
    name: "Nature & Wildlife",
    icon: Trees,
    description: "Lush tea gardens, wildlife safaris, misty waterfalls & lakes",
    tags: ["Safaris", "Flora", "Scenic"],
  },
  {
    id: "Photography",
    name: "Photography & Views",
    icon: Camera,
    description: "Breathtaking viewpoints, sunrise spots, vibrant streets & golden hours",
    tags: ["Landscape", "Golden Hour", "Insta-spots"],
  },
  {
    id: "Nightlife",
    name: "Nightlife & Social",
    icon: Music,
    description: "Beach shacks, rooftop lounges, live music & vibrant evening markets",
    tags: ["Music", "Clubs", "Evening Vibe"],
  },
  {
    id: "Shopping",
    name: "Shopping & Souvenirs",
    icon: ShoppingBag,
    description: "Local artisan bazaars, spice markets, textiles & authentic crafts",
    tags: ["Handicrafts", "Spices", "Bazaars"],
  },
];

const LANGUAGE_OPTIONS: { id: TripLanguage; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "bn", label: "Bengali", native: "বাংলা" },
  { id: "te", label: "Telugu", native: "తెలుగు" },
  { id: "mr", label: "Marathi", native: "मराठी" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { id: "ml", label: "Malayalam", native: "മലയാളം" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી" },
];

const PACE_OPTIONS: {
  id: TravelPace;
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  { id: "relaxed", label: "Relaxed", icon: Coffee, description: "Fewer activities, long breaks" },
  { id: "balanced", label: "Balanced", icon: Footprints, description: "Highlights plus downtime" },
  { id: "packed", label: "Action-packed", icon: Zap, description: "See as much as possible" },
];

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Jain", "Halal", "Gluten-free"];

interface StepStyleProps {
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  language: TripLanguage;
  onLanguageChange: (language: TripLanguage) => void;
  pace: TravelPace;
  onPaceChange: (pace: TravelPace) => void;
  dietary: string[];
  onToggleDietary: (item: string) => void;
}

export const StepStyle: React.FC<StepStyleProps> = ({
  selectedInterests,
  onToggleInterest,
  onSelectAll,
  onClearAll,
  language,
  onLanguageChange,
  pace,
  onPaceChange,
  dietary,
  onToggleDietary,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>What travel style inspires you?</span>
          <Sparkles className="w-6 h-6 text-primary" aria-hidden="true" />
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
          const StyleIcon = style.icon;
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
                  <span className="p-2 bg-card rounded-lg border border-border/50 shadow-2xs flex items-center justify-center">
                    <StyleIcon className="w-5 h-5 text-primary" />
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

      {/* Travel Pace */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Travel pace</h3>
          <span className="text-xs text-muted-foreground">— how packed should each day be?</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PACE_OPTIONS.map((option) => {
            const isActive = pace === option.id;
            const PaceIcon = option.icon;
            return (
              <button
                type="button"
                key={option.id}
                onClick={() => onPaceChange(option.id)}
                className={cn(
                  "p-3 rounded-2xl border text-left transition-all duration-200 bg-card",
                  isActive
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between">
                  <PaceIcon className="w-5 h-5 text-primary" />
                  {isActive && <Check className="w-4 h-4 text-primary stroke-[3]" />}
                </div>
                <p className="mt-1 text-sm font-bold text-foreground">{option.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dietary Preferences */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Dietary preferences</h3>
          <span className="text-xs text-muted-foreground">— optional</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((item) => {
            const isActive = dietary.includes(item);
            return (
              <button
                type="button"
                key={item}
                onClick={() => onToggleDietary(item)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Language */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Itinerary language</h3>
          <span className="text-xs text-muted-foreground">— the language of your plan</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = language === option.id;
            return (
              <button
                type="button"
                key={option.id}
                onClick={() => onLanguageChange(option.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full border text-xs font-semibold transition-all flex items-center gap-1.5",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                <span>{option.native}</span>
                {option.native !== option.label && (
                  <span className="text-[10px] opacity-70">{option.label}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
