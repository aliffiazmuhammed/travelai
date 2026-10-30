import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The console's list shell: an optional heading, a horizontally scrollable table
 * and a footer slot for paging. Pages own the columns; this owns the frame so
 * every directory has the same border, radius and scroll behaviour.
 */
export const AdminTableFrame: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Minimum table width so columns never squash on a phone. */
  minWidth?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, minWidth = '900px', footer, children, className }) => (
  <Card className={cn('overflow-hidden rounded-2xl border-border bg-card shadow-sm', className)}>
    {title || description || actions ? (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div className="min-w-0 space-y-0.5">
          {title ? (
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <CardContent className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
      {footer}
    </CardContent>
  </Card>
);

/** Shared head-row treatment so a new column cannot invent its own case. */
export const adminTableHeadClass =
  'border-b border-border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

/** Shared body-row treatment. */
export const adminTableRowClass =
  'border-b border-border/70 align-top last:border-0 transition-colors hover:bg-muted/40';
