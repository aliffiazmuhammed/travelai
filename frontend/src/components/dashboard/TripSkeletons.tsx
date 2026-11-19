import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const TripCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      {/* Mirrors TripCard: 16/9 cover, p-4 body, quiet footer bar. */}
      <Skeleton className="aspect-video w-full rounded-none" />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <Skeleton className="h-5 w-4/5 rounded-md" />
        <div className="space-y-1">
          <Skeleton className="h-3 w-1/2 rounded-md" />
          <Skeleton className="h-3 w-2/5 rounded-md" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>
    </div>
  );
};

export const TripsGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
      {Array.from({ length: 6 }).map((_, i) => (
        <TripCardSkeleton key={i} />
      ))}
    </div>
  );
};

export const ItinerarySkeleton: React.FC = () => {
  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-16">
      {/* Header: title, chips and quick stats — the real workspace has no
          full-bleed banner, so the placeholder does not invent one. */}
      <div className="space-y-4">
        <Skeleton className="h-9 w-2/3 max-w-md rounded-lg" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>

      {/* Tab strip plus the "More" trigger, matching the real row's height. */}
      <div className="flex items-start gap-2">
        <Skeleton className="h-[54px] flex-1 rounded-xl" />
        <Skeleton className="h-[42px] w-24 rounded-xl" />
      </div>

      {/* Feed Skeleton */}
      <div className="space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
};
