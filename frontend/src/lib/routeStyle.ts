/**
 * Presentation metadata for user-drawn custom routes (Milestone 4).
 *
 * Kept in a plain `.ts` module (no JSX) so component files can stay
 * component-only, which keeps React Fast Refresh happy.
 */

import { Bike, Car, Footprints, type LucideIcon } from "lucide-react";
import type { RouteTravelMode } from "@/types/trip";

export const ROUTE_COLORS = [
  "#0ea5e9",
  "#10b981",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
];

export interface RouteModeMeta {
  value: RouteTravelMode;
  label: string;
  Icon: LucideIcon;
}

export const ROUTE_MODES: RouteModeMeta[] = [
  { value: "drive", label: "Drive", Icon: Car },
  { value: "walk", label: "Walk", Icon: Footprints },
  { value: "bike", label: "Bike", Icon: Bike },
];

/** Metadata for a travel mode, falling back to driving. */
export function routeModeMeta(mode: RouteTravelMode | undefined): RouteModeMeta {
  return ROUTE_MODES.find((option) => option.value === mode) ?? ROUTE_MODES[0];
}
