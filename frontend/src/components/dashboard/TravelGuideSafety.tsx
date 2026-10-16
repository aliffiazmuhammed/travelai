import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Bus,
  Car,
  CloudRain,
  ShieldAlert,
  Wifi,
  Sparkles,
  Ticket,
  CheckCircle2,
  AlertTriangle,
  HeartHandshake,
  Compass,
} from "lucide-react";
import type { ItineraryData } from "@/types/trip";

interface TravelGuideSafetyProps {
  guide: ItineraryData["local_transport"];
  weather: ItineraryData["weather_advisory"];
  footnotes: ItineraryData["footnotes_safety_tips"];
}

export const TravelGuideSafety: React.FC<TravelGuideSafetyProps> = ({
  guide,
  weather,
  footnotes,
}) => {
  // Interactive packing items state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (item: string) => {
    setCheckedItems((prev) => ({ ...prev, [item]: !prev[item] }));
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: Weather Forecast & Packing Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weather Forecast Card */}
        <Card className="rounded-3xl border border-border/70 shadow-card bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-blue-500" />
              <span>Climate & Weather Forecast</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Anticipated seasonal conditions for your travel window
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-900 dark:text-blue-100 leading-relaxed">
              {weather.expected_weather}
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Seasonal Highlights & Conditions
              </h5>
              <ul className="space-y-1.5 text-xs text-foreground/85">
                {weather.seasonal_highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>

            {weather.risks && weather.risks.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Weather Advisory: {weather.risks.join("; ")}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interactive Packing Checklist */}
        <Card className="rounded-3xl border border-border/70 shadow-card bg-card/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Packing Essentials Checklist</span>
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {Object.values(checkedItems).filter(Boolean).length} of{" "}
                {weather.packing_tips.length} packed
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Tap items to check them off as you prepare your luggage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {weather.packing_tips.map((item, idx) => {
              const isChecked = !!checkedItems[item];

              return (
                <div
                  key={idx}
                  onClick={() => toggleItem(item)}
                  className={`flex items-start gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                    isChecked
                      ? "bg-emerald-500/10 border-emerald-500/30 line-through text-muted-foreground opacity-80"
                      : "bg-muted/30 border-border/60 hover:bg-muted/60 text-foreground"
                  }`}
                >
                  <Checkbox checked={isChecked} className="mt-0.5 rounded-md" />
                  <span className="text-xs font-medium leading-relaxed select-none">
                    {item}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2: Local Transport & Transit Protocols */}
      <Card className="rounded-3xl border border-border/70 shadow-card bg-card/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Bus className="w-4 h-4 text-primary" />
            <span>Local Transport & Getting Around</span>
          </CardTitle>
          <CardDescription className="text-xs">
            How to navigate locally between sights, stations, and stays
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Walking / Pedestrian
              </span>
              <p className="text-xs font-semibold text-foreground">{guide.walking}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Auto-Rickshaws
              </span>
              <p className="text-xs font-semibold text-foreground">{guide.auto_rickshaw}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Local Buses
              </span>
              <p className="text-xs font-semibold text-foreground">{guide.local_buses}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Shared Cabs & Taxis
              </span>
              <p className="text-xs font-semibold text-foreground">{guide.shared_cabs}</p>
            </div>
          </div>

          {/* Transport Tips List */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold uppercase tracking-wider text-primary">
              Transit Best Practices
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-foreground/80">
              {guide.tips.map((tip, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2.5 rounded-xl bg-primary/5 border border-primary/10"
                >
                  <Car className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3: Safety, Permits & Cultural Etiquette */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Safety First */}
        <Card className="rounded-3xl border border-destructive/20 bg-destructive/5 shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-4 h-4" />
              <span>Safety First</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-foreground/85">
              {footnotes.safety.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Cultural Etiquette */}
        <Card className="rounded-3xl border border-purple-500/20 bg-purple-500/5 shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <HeartHandshake className="w-4 h-4" />
              <span>Cultural Etiquette</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-foreground/85">
              {footnotes.cultural_etiquette.map((c, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Permits & Connectivity */}
        <Card className="rounded-3xl border border-primary/20 bg-primary/5 shadow-xs">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-primary">
              <Ticket className="w-4 h-4" />
              <span>Permits & Connectivity</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* Permits */}
            <div className="space-y-1">
              <span className="font-bold text-foreground">Permit Status: </span>
              <p className="text-muted-foreground">
                {footnotes.permits.rohtang_pass_required
                  ? `Permit Required. ${footnotes.permits.apply_online}`
                  : "No special permits required for general tourist zones."}
              </p>
            </div>

            {/* Mobile Connectivity */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <Wifi className="w-3.5 h-3.5 text-blue-500" />
                <span>Network Coverage</span>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">WiFi: </span>
                  <span>{footnotes.connectivity.wifi}</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Mobile: </span>
                  <span>{footnotes.connectivity.mobile_networks}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
