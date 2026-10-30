import React from 'react';
import { cn } from '@/lib/utils';

/**
 * One header shape for every console page. The console is always dark, so it
 * reads from the same semantic tokens as the rest of the product rather than
 * carrying its own slate palette.
 */
export const AdminPageHeader: React.FC<{
  title: React.ReactNode;
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {meta}
      </div>
      {description ? (
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
