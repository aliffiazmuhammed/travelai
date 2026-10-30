import React from 'react';
import { cn } from '@/lib/utils';

/**
 * One header for every agency page: the title a person would search for, one
 * line of context, and at most two actions on the right. Pages stop inventing
 * their own heading sizes and spacing.
 */
export const AgencyPageHeader: React.FC<{
  title: string;
  meta?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, meta, description, actions, className }) => (
  <div
    className={cn(
      'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
      className
    )}
  >
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        {meta}
      </div>
      {description ? (
        <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          {description}
        </p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
