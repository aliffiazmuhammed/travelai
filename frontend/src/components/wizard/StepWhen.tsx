import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarIcon,
  AlertCircle,
  Zap,
  Leaf,
  Umbrella,
  Mountain,
  Map,
  Sun,
  Backpack,
} from "lucide-react";
import { addDays, differenceInCalendarDays, isBefore, startOfToday } from "date-fns";
import { formatDate, formatDateShort, formatDateWithWeekday } from "@/lib/date";
import { cn } from "@/lib/utils";

interface StepWhenProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

export const StepWhen: React.FC<StepWhenProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const today = startOfToday();

  // Calculate duration in days
  const durationDays =
    startDate && endDate
      ? differenceInCalendarDays(endDate, startDate) + 1
      : 0;

  const isInvalidDateRange =
    startDate && endDate && isBefore(endDate, startDate);

  // Quick Preset Helper
  const applyPreset = (daysCount: number) => {
    const baseStart = startDate && !isBefore(startDate, today) ? startDate : today;
    const computedEnd = addDays(baseStart, daysCount - 1);
    onStartDateChange(baseStart);
    onEndDateChange(computedEnd);
  };

  const presets = [
    { label: "Weekend Getaway", days: 3, icon: Zap },
    { label: "5-Day Recharge", days: 5, icon: Leaf },
    { label: "1-Week Vacation", days: 7, icon: Umbrella },
    { label: "10-Day Deep Dive", days: 10, icon: Mountain },
    { label: "2-Week Explorer", days: 14, icon: Map },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          When are you going?
        </h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Pick exact dates, or start from a rough preset
        </p>
      </div>

      {/* Quick Presets */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">
          Quick duration presets
        </p>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isSelected = durationDays === preset.days;
            const PresetIcon = preset.icon;
            return (
              <button
                key={preset.days}
                type="button"
                aria-pressed={isSelected}
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-4 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/80 bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground"
                )}
              >
                <PresetIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{preset.label}</span>
                <span className="font-normal opacity-70">({preset.days}d)</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Pickers */}
      <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-6 sm:grid-cols-2">
        {/* Start Date */}
        <div className="space-y-1.5">
          <Label
            htmlFor="start-date"
            className="text-xs font-medium text-muted-foreground"
          >
            Departure / start date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="start-date"
                variant="outline"
                className={cn(
                  "h-14 w-full justify-start rounded-2xl border-border/80 bg-card px-4 text-left text-sm font-normal shadow-xs",
                  !startDate && "text-muted-foreground",
                  startDate && "border-primary/40 bg-primary/5"
                )}
              >
                <CalendarIcon className="mr-3 h-5 w-5 shrink-0 text-primary" />
                {startDate ? (
                  <span>
                    <span className="block font-semibold text-foreground">
                      {formatDateWithWeekday(startDate)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Trip begins
                    </span>
                  </span>
                ) : (
                  <span>Select start date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl p-0 shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => {
                  onStartDateChange(date);
                  if (date && endDate && isBefore(endDate, date)) {
                    onEndDateChange(addDays(date, 3));
                  }
                }}
                disabled={(date) => isBefore(date, today)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* End Date */}
        <div className="space-y-1.5">
          <Label
            htmlFor="end-date"
            className="text-xs font-medium text-muted-foreground"
          >
            Return / end date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="end-date"
                variant="outline"
                className={cn(
                  "h-14 w-full justify-start rounded-2xl border-border/80 bg-card px-4 text-left text-sm font-normal shadow-xs",
                  !endDate && "text-muted-foreground",
                  endDate && "border-primary/40 bg-primary/5"
                )}
              >
                <CalendarIcon className="mr-3 h-5 w-5 shrink-0 text-primary" />
                {endDate ? (
                  <span>
                    <span className="block font-semibold text-foreground">
                      {formatDateWithWeekday(endDate)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      Trip concludes
                    </span>
                  </span>
                ) : (
                  <span>Select return date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl p-0 shadow-xl" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={onEndDateChange}
                disabled={(date) =>
                  startDate ? isBefore(date, startDate) : isBefore(date, today)
                }
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Validation Error or Duration Confirmation */}
      {isInvalidDateRange ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>End date must be on or after the start date.</span>
        </div>
      ) : durationDays > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {durationDays} {durationDays === 1 ? "day" : "days"} /{" "}
              {durationDays > 1 ? durationDays - 1 : 1}{" "}
              {durationDays > 1 ? "nights" : "night"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {startDate && formatDateShort(startDate)} – {endDate && formatDate(endDate)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground">
            {durationDays <= 3 ? (
              <>
                <Zap className="h-3 w-3" aria-hidden="true" /> Short break
              </>
            ) : durationDays <= 7 ? (
              <>
                <Sun className="h-3 w-3" aria-hidden="true" /> Ideal holiday
              </>
            ) : (
              <>
                <Backpack className="h-3 w-3" aria-hidden="true" /> Extended adventure
              </>
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
};
