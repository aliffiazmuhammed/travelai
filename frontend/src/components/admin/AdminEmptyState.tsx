import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty and loading panels. A list with nothing in it is a normal state in a
 * console, so it gets a sentence about what would put something there — not a
 * bare "no results".
 */
export const AdminEmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, action, className }) => (
  <div
    className={cn(
      'flex flex-col items-center gap-2 px-6 py-14 text-center',
      className
    )}
  >
    <span
      aria-hidden
      className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground"
    >
      <Icon className="h-5 w-5" />
    </span>
    <p className="text-sm font-medium text-foreground">{title}</p>
    {description ? (
      <p className="max-w-md text-xs leading-5 text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-1.5">{action}</div> : null}
  </div>
);

/** A quiet centred spinner for panels that are still fetching. */
export const AdminLoadingPanel: React.FC<{
  label: string;
  className?: string;
}> = ({ label, className }) => (
  <div
    className={cn(
      'flex items-center justify-center gap-2 px-6 py-14 text-sm text-muted-foreground',
      className
    )}
    aria-busy="true"
  >
    <span
      aria-hidden
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
    {label}
  </div>
);
