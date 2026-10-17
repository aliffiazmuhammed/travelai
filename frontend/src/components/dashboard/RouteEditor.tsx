import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Route, Save, CalendarDays } from "lucide-react";
import { formatDistance, pathLengthKm } from "@/lib/geo";
import { ROUTE_COLORS, ROUTE_MODES } from "@/lib/routeStyle";
import type { CustomRoute, RouteInput, RouteTravelMode } from "@/types/trip";

interface RouteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing route when editing. */
  route?: CustomRoute | null;
  /** Points of a freshly drawn route when creating. */
  draftPoints?: [number, number][] | null;
  /** Total trip days (for the day selector). */
  days: number;
  onSave: (payload: RouteInput) => Promise<void> | void;
}

const UNASSIGNED = "__unassigned__";

export const RouteEditor: React.FC<RouteEditorProps> = ({
  open,
  onOpenChange,
  route,
  draftPoints,
  days,
  onSave,
}) => {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<RouteTravelMode>("drive");
  const [day, setDay] = useState<string>(UNASSIGNED);
  const [color, setColor] = useState(ROUTE_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(route?.name || "");
    setMode(route?.mode || "drive");
    setDay(route?.day != null ? String(route.day) : UNASSIGNED);
    setColor(route?.color || ROUTE_COLORS[0]);
    setError(null);
    setSaving(false);
  }, [open, route]);

  const points = route?.points || draftPoints || [];
  const distanceKm = points.length >= 2 ? pathLengthKm(points) : 0;
  const dayOptions = Array.from({ length: Math.max(days, 0) }, (_, i) => i + 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please give this route a name.");
      return;
    }
    if (points.length < 2) {
      setError("A route needs at least two points.");
      return;
    }

    const payload: RouteInput = {
      name: name.trim(),
      mode,
      color,
      day: day !== UNASSIGNED ? Number(day) : null,
      points,
    };

    try {
      setSaving(true);
      await onSave(payload);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this route.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md w-[94vw] sm:w-full p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            {route ? "Edit Route" : "Save Drawn Route"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {points.length} point{points.length === 1 ? "" : "s"}
            {distanceKm > 0 ? ` · ${formatDistance(distanceKm)} long` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="route-name" className="text-xs font-bold">
              Route Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="route-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sunrise detour to the viewpoint"
              className="h-10 text-sm rounded-xl"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Travel Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as RouteTravelMode)}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTE_MODES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-primary" /> Trip Day
              </Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="h-10 text-sm rounded-xl">
                  <SelectValue placeholder="Any day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Any day</SelectItem>
                  {dayOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      Day {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold">Colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ROUTE_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Use colour ${option}`}
                  onClick={() => setColor(option)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === option
                      ? "ring-2 ring-offset-2 ring-primary scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-destructive bg-destructive/10 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs font-semibold h-10"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="hero"
              disabled={saving}
              className="rounded-xl text-xs font-bold h-10 gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save Route"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RouteEditor;
