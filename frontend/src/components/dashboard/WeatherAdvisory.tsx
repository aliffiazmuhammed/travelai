import React from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Snowflake,
  Sun,
  Wind,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeWeather, hasSignificantRisk, riskMeta } from "@/lib/weather";
import type { DailyWeather } from "@/types/trip";

/** Maps a WMO weather code to an icon (falls back to partly cloudy). */
function weatherIcon(day: DailyWeather): React.ReactNode {
  const code = day.weatherCode;
  const className = "w-3.5 h-3.5";

  if (code == null) {
    return day.riskLevel === "high" || day.riskLevel === "moderate" ? (
      <CloudRain className={className} />
    ) : (
      <CloudSun className={className} />
    );
  }

  if (code === 0) return <Sun className={className} />;
  if (code >= 1 && code <= 2) return <CloudSun className={className} />;
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} />;
  if (code >= 71 && code <= 77) return <Snowflake className={className} />;
  if (code >= 80 && code <= 82) return <CloudRainWind className={className} />;
  if (code >= 95) return <CloudLightning className={className} />;
  return <CloudSun className={className} />;
}

/** Compact per-day weather chip with risk colouring. */
export const WeatherBadge: React.FC<{ day?: DailyWeather; className?: string }> = ({
  day,
  className,
}) => {
  if (!day) return null;

  const meta = riskMeta(day.riskLevel);
  const summary = describeWeather(day);

  return (
    <Badge
      variant="outline"
      title={day.advisories.join("\n")}
      className={cn(
        "text-[10px] px-2 py-0 gap-1 font-semibold border",
        meta.badgeClass,
        className
      )}
    >
      {weatherIcon(day)}
      {summary && <span>{summary}</span>}
      <span className="font-bold uppercase tracking-wide">{meta.label}</span>
      {day.windKph != null && day.windKph >= 35 && <Wind className="w-3 h-3" />}
      {day.source === "seasonal" && (
        <span className="text-[9px] font-bold opacity-70">seasonal</span>
      )}
    </Badge>
  );
};

/**
 * Advisory list for days with meaningful risk. Renders nothing for calm days so
 * the timeline stays uncluttered.
 */
export const WeatherAdvisoryPanel: React.FC<{ day?: DailyWeather }> = ({ day }) => {
  if (!day || !hasSignificantRisk(day)) return null;

  const meta = riskMeta(day.riskLevel);

  return (
    <div
      className={cn(
        "mt-3 p-3 rounded-2xl border flex items-start gap-2.5 text-xs",
        day.riskLevel === "high"
          ? "bg-destructive/5 border-destructive/25"
          : "bg-amber-500/5 border-amber-400/30"
      )}
    >
      <AlertTriangle
        className={cn(
          "w-4 h-4 shrink-0 mt-0.5",
          day.riskLevel === "high" ? "text-destructive" : "text-amber-500"
        )}
      />
      <div className="space-y-1 min-w-0">
        <p className={cn("font-bold", day.riskLevel === "high" ? "text-destructive" : "text-amber-700 dark:text-amber-300")}>
          Weather advisory · {meta.label}
        </p>
        <ul className="space-y-0.5 text-muted-foreground font-medium">
          {day.advisories.map((advisory, index) => (
            <li key={index}>• {advisory}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default WeatherBadge;
