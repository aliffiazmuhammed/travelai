import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  CalendarIcon,
  CalendarDays,
  Clock,
  Sparkles,
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
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <span>When are you planning to travel?</span>
          <CalendarDays className="w-6 h-6 text-primary" aria-hidden="true" />
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          Choose your travel dates or pick a quick duration preset to plan your schedule.
        </p>
      </div>

      {/* Quick Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Quick duration presets</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => {
            const isSelected = durationDays === preset.days;
            const PresetIcon = preset.icon;
            return (
              <Button
                key={preset.days}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  "rounded-full text-xs font-medium h-9 px-4 transition-all",
                  isSelected
                    ? "shadow-sm scale-105"
                    : "border-border/70 hover:border-primary/50 hover:bg-primary/5"
                )}
              >
                <PresetIcon className="mr-1.5 w-3.5 h-3.5" />
                <span>{preset.label}</span>
                <span className="ml-1.5 text-[11px] opacity-80 font-normal">
                  ({preset.days}d)
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Date Pickers Card */}
      <div className="p-6 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start Date */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground tracking-wide">
              Departure / Start Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-13 justify-start text-left font-normal rounded-xl border-border/80 shadow-2xs text-sm",
                    !startDate && "text-muted-foreground",
                    startDate && "border-primary/50 bg-primary/5 font-medium text-foreground"
                  )}
                >
                  <CalendarIcon className="mr-3 h-5 w-5 text-primary shrink-0" />
                  {startDate ? (
                    <div>
                      <div className="font-semibold text-foreground">
                        {formatDateWithWeekday(startDate)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Trip begins
                      </div>
                    </div>
                  ) : (
                    <span>Select start date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl" align="start">
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
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground tracking-wide">
              Return / End Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-13 justify-start text-left font-normal rounded-xl border-border/80 shadow-2xs text-sm",
                    !endDate && "text-muted-foreground",
                    endDate && "border-primary/50 bg-primary/5 font-medium text-foreground"
                  )}
                >
                  <CalendarIcon className="mr-3 h-5 w-5 text-primary shrink-0" />
                  {endDate ? (
                    <div>
                      <div className="font-semibold text-foreground">
                        {formatDateWithWeekday(endDate)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Trip concludes
                      </div>
                    </div>
                  ) : (
                    <span>Select return date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl" align="start">
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

        {/* Validation Error or Duration Confirmation Strip */}
        {isInvalidDateRange ? (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>End date must be on or after the start date.</span>
          </div>
        ) : durationDays > 0 ? (
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-xl gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {durationDays} Days / {durationDays > 1 ? durationDays - 1 : 1} Nights
                </h4>
                <p className="text-xs text-muted-foreground">
                  {startDate && formatDateShort(startDate)} - {endDate && formatDate(endDate)}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="px-3 py-1 text-xs font-semibold gap-1.5">
              {durationDays <= 3 ? (
                <>
                  <Zap className="w-3 h-3" /> Short break
                </>
              ) : durationDays <= 7 ? (
                <>
                  <Sun className="w-3 h-3" /> Ideal holiday
                </>
              ) : (
                <>
                  <Backpack className="w-3 h-3" /> Extended adventure
                </>
              )}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
};
