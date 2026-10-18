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
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Clock, IndianRupee, Save, MapPinned, Type } from "lucide-react";
import type { ActivityItem } from "@/types/trip";

interface ActivityEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 1-based day number this activity belongs to (used for context in the header). */
  day: number;
  activity?: ActivityItem | string | null;
  onSave: (activity: ActivityItem) => void;
}

interface FormState {
  title: string;
  time: string;
  description: string;
  location_name: string;
  approx_cost: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  time: "",
  description: "",
  location_name: "",
  approx_cost: "",
  latitude: "",
  longitude: "",
};

function toFormState(activity?: ActivityItem | string | null): FormState {
  if (activity == null) return { ...EMPTY_FORM };

  if (typeof activity === "string") {
    return { ...EMPTY_FORM, title: activity };
  }

  const coords = activity.coordinates;
  return {
    title: activity.title || activity.name || "",
    time: activity.time || "",
    description: activity.description || "",
    location_name: activity.location_name || activity.location || "",
    approx_cost:
      activity.approx_cost != null && !Number.isNaN(Number(activity.approx_cost))
        ? String(activity.approx_cost)
        : "",
    latitude:
      Array.isArray(coords) && coords[0] != null ? String(coords[0]) : "",
    longitude:
      Array.isArray(coords) && coords[1] != null ? String(coords[1]) : "",
  };
}

export const ActivityEditor: React.FC<ActivityEditorProps> = ({
  open,
  onOpenChange,
  day,
  activity,
  onSave,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the modal opens or the target activity changes
  useEffect(() => {
    if (open) {
      setForm(toFormState(activity));
      setError(null);
    }
  }, [open, activity]);

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Please give the activity a title.");
      return;
    }

    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    const hasValidCoords = !Number.isNaN(lat) && !Number.isNaN(lng);
    const cost = parseFloat(form.approx_cost);

    const payload: ActivityItem = {
      title: form.title.trim(),
      time: form.time.trim() || undefined,
      description: form.description.trim() || undefined,
      location_name: form.location_name.trim() || undefined,
      approx_cost: Number.isNaN(cost) ? undefined : cost,
      coordinates: hasValidCoords ? [lat, lng] : undefined,
    };

    onSave(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg w-[94vw] sm:w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Type className="w-4 h-4 text-primary" />
            Edit Activity
            <span className="text-xs font-semibold text-muted-foreground">
              Day {day}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Update the details for this activity. Leave a field blank to remove it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="activity-title" className="text-xs font-bold">
              Activity Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="activity-title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Trek to Chembra Peak & Heart-Shaped Lake"
              className="h-10 text-sm rounded-xl"
              autoFocus
            />
          </div>

          {/* Time + Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="activity-time" className="text-xs font-bold flex items-center gap-1">
                <Clock className="w-3 h-3 text-primary" /> Time Slot
              </Label>
              <Input
                id="activity-time"
                value={form.time}
                onChange={(e) => update("time", e.target.value)}
                placeholder="Morning (08:30 AM)"
                className="h-10 text-sm rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="activity-cost" className="text-xs font-bold flex items-center gap-1">
                <IndianRupee className="w-3 h-3 text-primary" /> Approx Cost (₹)
              </Label>
              <Input
                id="activity-cost"
                type="number"
                min={0}
                value={form.approx_cost}
                onChange={(e) => update("approx_cost", e.target.value)}
                placeholder="500"
                className="h-10 text-sm rounded-xl"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="activity-location" className="text-xs font-bold flex items-center gap-1">
              <MapPin className="w-3 h-3 text-primary" /> Location Name
            </Label>
            <Input
              id="activity-location"
              value={form.location_name}
              onChange={(e) => update("location_name", e.target.value)}
              placeholder="Kalpetta, Wayanad"
              className="h-10 text-sm rounded-xl"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="activity-desc" className="text-xs font-bold">
              Description
            </Label>
            <Textarea
              id="activity-desc"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="What will travelers do here? Add 1-2 engaging sentences."
              className="text-sm rounded-xl min-h-[80px]"
            />
          </div>

          {/* Coordinates */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold flex items-center gap-1">
              <MapPinned className="w-3 h-3 text-primary" /> Map Coordinates (optional)
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={form.latitude}
                onChange={(e) => update("latitude", e.target.value)}
                placeholder="Latitude"
                title="e.g. 11.5516"
                className="h-10 text-sm rounded-xl"
                inputMode="decimal"
              />
              <Input
                value={form.longitude}
                onChange={(e) => update("longitude", e.target.value)}
                placeholder="Longitude"
                title="e.g. 76.0874"
                className="h-10 text-sm rounded-xl"
                inputMode="decimal"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Used to place this activity pin on the interactive map.
            </p>
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
              className="rounded-xl text-xs font-bold h-10 gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Activity</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityEditor;
