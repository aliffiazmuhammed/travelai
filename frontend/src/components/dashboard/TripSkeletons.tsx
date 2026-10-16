import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export const TripCardSkeleton: React.FC = () => {
  return (
    <Card className="rounded-3xl border border-border/70 bg-card overflow-hidden shadow-card flex flex-col justify-between">
      <div>
        {/* Thumbnail Skeleton */}
        <Skeleton className="h-44 w-full rounded-none" />

        {/* Content Skeleton */}
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-6 w-full rounded-md" />
          <Skeleton className="h-6 w-3/4 rounded-md" />
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-3 w-16 rounded-md" />
          </div>
        </CardContent>
      </div>

      {/* Footer Actions Skeleton */}
      <div className="px-5 pb-5 pt-0 flex items-center justify-between gap-2">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-xl" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
    </Card>
  );
};

export const TripsGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
      {Array.from({ length: 6 }).map((_, i) => (
        <TripCardSkeleton key={i} />
      ))}
    </div>
  );
};

export const ItinerarySkeleton: React.FC = () => {
  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto pb-16">
      {/* Header Banner Skeleton */}
      <div className="rounded-3xl overflow-hidden border border-border/60 bg-card">
        <Skeleton className="h-72 sm:h-88 w-full rounded-none" />
        <div className="grid grid-cols-2 sm:grid-cols-4 p-6 gap-4">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="h-12 w-full max-w-xl mx-auto">
        <Skeleton className="h-full w-full rounded-2xl" />
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
