import React from 'react';
import { cn } from '@/lib/utils';

/**
 * An empty panel that says what would appear here and what to do next, rather
 * than leaving a blank card that reads as a loading failure.
 */
export const AgencyEmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, body, action, className }) => (
  <div
    className={cn(
      'flex flex-col items-start gap-2.5 rounded-xl border border-dashed border-agency-line bg-agency-soft/50 p-4',
      className
    )}
  >
    <span
      aria-hidden
      className="grid h-8 w-8 place-items-center rounded-lg bg-agency-panel text-agency-muted"
    >
      <Icon className="h-4 w-4" />
    </span>
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-agency-ink">{title}</p>
      <p className="text-xs leading-5 text-agency-muted">{body}</p>
    </div>
    {action}
  </div>
);
