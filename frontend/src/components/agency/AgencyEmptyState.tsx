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
      'flex flex-col items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40',
      className
    )}
  >
    <span
      aria-hidden
      className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-300"
    >
      <Icon className="h-4 w-4" />
    </span>
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{body}</p>
    </div>
    {action}
  </div>
);
