import type { ActivityItem, ItineraryData, StayItem } from "@/types/trip";
import { isValidCoord, type LatLng } from "./geo";

/**
 * Truthful projections for the itinerary map and schedule (C-04).
 *
 * A generated plan is allowed to omit coordinates and times. What it is not
 * allowed to do is invent them: only stored `[lat, lng]` pairs become pins,
 * and a time-of-day label is only shown when the activity carries one.
 */

export interface TripMapPin {
  id: string;
  title: string;
  day: number;
  coords: LatLng;
  type: "activity" | "stay";
  category: string;
}

export interface UnmappedTripItem {
  id: string;
  title: string;
  day: number;
  type: "activity" | "stay";
  location?: string;
  time?: string;
}

export interface TripMapModel {
  pins: TripMapPin[];
  unmapped: UnmappedTripItem[];
}

/** A pin may only be drawn from a stored, in-range coordinate pair. */
export function hasCoordinates(value: unknown): value is LatLng {
  return isValidCoord(value);
}

/** The stored time slot, or null. Never a guessed Morning/Afternoon/etc. */
export function activityTime(activity: ActivityItem | string): string | null {
  if (typeof activity !== "object" || activity === null) return null;
  const time = typeof activity.time === "string" ? activity.time.trim() : "";
  return time || null;
}

/**
 * Display label for an activity. A stored time is shown verbatim; otherwise the
 * label describes its order in the day ("Stop 2") rather than a time of day.
 */
export function activityTimeLabel(activity: ActivityItem | string, index: number): string {
  return activityTime(activity) ?? `Stop ${index + 1}`;
}

function activityTitle(activity: ActivityItem | string, index: number): string {
  if (typeof activity === "string") return activity.trim() || `Stop ${index + 1}`;
  const title = (activity.title || activity.name || "").trim();
  return title || `Stop ${index + 1}`;
}

function stayTitle(stay: StayItem | string): string {
  if (typeof stay === "string") return stay.trim() || "Stay";
  return (stay.name || "").trim() || "Stay";
}

/**
 * Builds map pins and the companion "Location not mapped" list.
 *
 * The output is a pure function of stored data: no radial offsets, no base
 * coordinate fallback, and no synthesized stay location. Activities or stays
 * without valid coordinates go to `unmapped` instead of onto the map.
 */
export function buildTripMapModel(itinerary: ItineraryData["day_by_day_itinerary"]): TripMapModel {
  const pins: TripMapPin[] = [];
  const unmapped: UnmappedTripItem[] = [];

  itinerary.forEach((dayData, dayIdx) => {
    const day = Number(dayData?.day);

    (dayData?.activities ?? []).forEach((activity, activityIdx) => {
      const id = `act-${dayIdx}-${activityIdx}-${day}`;
      const title = activityTitle(activity, activityIdx);
      const isObject = typeof activity === "object" && activity !== null;

      if (isObject && hasCoordinates(activity.coordinates)) {
        pins.push({
          id,
          title,
          day,
          coords: [Number(activity.coordinates[0]), Number(activity.coordinates[1])],
          type: "activity",
          category: `Day ${day} Activity`,
        });
        return;
      }

      const location = isObject
        ? (activity.location_name || activity.location || "").trim()
        : "";
      const time = activityTime(activity);
      unmapped.push({
        id,
        title,
        day,
        type: "activity",
        ...(location ? { location } : {}),
        ...(time ? { time } : {}),
      });
    });

    (dayData?.stay_recommendations ?? []).forEach((stay, stayIdx) => {
      const id = `stay-${dayIdx}-${stayIdx}-${day}`;
      const title = stayTitle(stay);
      const isObject = typeof stay === "object" && stay !== null;

      if (isObject && hasCoordinates(stay.coordinates)) {
        pins.push({
          id,
          title,
          day,
          coords: [Number(stay.coordinates[0]), Number(stay.coordinates[1])],
          type: "stay",
          category: `Night ${day} Stay`,
        });
        return;
      }

      const location = isObject ? (stay.location || "").trim() : "";
      unmapped.push({
        id,
        title,
        day,
        type: "stay",
        ...(location ? { location } : {}),
      });
    });
  });

  return { pins, unmapped };
}
