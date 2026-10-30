import React from 'react';
import { cn } from '@/lib/utils';
import { TravellerBreadcrumbs, type TravellerCrumb } from './TravellerBreadcrumbs';

interface TravellerPageHeaderProps {
  title: React.ReactNode;
  /** Quiet line above the title: "Your conversations", "Trips people shared". */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Badges or tallies that belong beside the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ElementType;
  crumbs?: TravellerCrumb[];
  /** Search and filters that belong inside the hero card on discovery pages. */
  children?: React.ReactNode;
  /**
   * `plain` is the calm workspace surface. `hero` keeps the expressive
   * translucent card the discovery pages use.
   */
  tone?: 'plain' | 'hero';
  className?: string;
}

/**
 * One header for every traveller page: the trail, the title a person would
 * search for, one line of context and at most a small row of actions.
 */
export const TravellerPageHeader: React.FC<TravellerPageHeaderProps> = ({
  title,
  eyebrow,
  description,
  meta,
  actions,
  icon: Icon,
  crumbs,
  children,
  tone = 'plain',
  className,
}) => (
  <header className={cn('space-y-4', className)}>
    {crumbs?.length ? <TravellerBreadcrumbs items={crumbs} /> : null}
    <div
      className={cn(
        'space-y-4',
        tone === 'hero' &&
          'rounded-3xl border border-border/80 bg-card/80 p-6 shadow-card backdrop-blur-md sm:p-8'
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary">
              {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
              {eyebrow}
            </p>
          ) : null}
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            {title}
            {meta}
          </h1>
          {description ? (
            <p
              className={cn(
                'max-w-2xl text-sm leading-6 text-muted-foreground',
                tone === 'hero' && 'sm:leading-relaxed'
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children ? (
        <div
          className={cn(
            'space-y-4',
            tone === 'hero' && 'border-t border-border/60 pt-4'
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  </header>
);
