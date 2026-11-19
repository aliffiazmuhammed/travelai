import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * The console list shell: an optional heading and a footer slot for paging.
 * Rows come from `DataTable`, which owns the scroll region, its cue and the
 * phone cards, so every directory shares one table behaviour.
 */
export const AdminTableFrame: React.FC<{
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, footer, children, className }) => (
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
    <CardContent className="p-0">{children}</CardContent>
    {footer}
  </Card>
);

/** Shared head-row treatment so a new column cannot invent its own case. */
export const adminTableHeadClass =
  'border-b border-border px-4 py-2.5 text-overline font-semibold text-muted-foreground';

/** Shared body-row treatment. */
export const adminTableRowClass =
  'border-b border-border/70 align-top last:border-0 transition-colors hover:bg-muted/40';
