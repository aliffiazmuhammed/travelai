import React from "react";
import { cn } from "@/lib/utils";

/**
 * C-17: the first Tab stop on every public page. The link only becomes
 * visible when focused, so it never competes with the nav visually.
 */
export const SkipLink: React.FC<{
  targetId?: string;
  label?: string;
  className?: string;
}> = ({ targetId = "main-content", label = "Skip to main content", className }) => (
  <a
    href={`#${targetId}`}
    className={cn(
      "sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
      className
    )}
  >
    {label}
  </a>
);
