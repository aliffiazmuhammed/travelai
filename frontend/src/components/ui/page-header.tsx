import React from 'react';
import { cn } from '@/lib/utils';

export type PageHeaderRealm = 'public' | 'traveller' | 'agency' | 'admin';

/** Title steps. The ladder is fixed so adjacent screens cannot drift apart. */
export type PageHeaderSize = 'sm' | 'md' | 'lg' | 'xl';

const titleSize: Record<PageHeaderSize, string> = {
  sm: 'text-2xl',
  md: 'text-3xl',
  lg: 'text-3xl sm:text-4xl',
  xl: 'text-4xl sm:text-5xl',
};

interface PageHeaderProps {
  title: React.ReactNode;
  /** Quiet line above the title, e.g. "Your conversations". */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Badges or tallies that belong beside the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small glyph shown before the eyebrow. */
  icon?: React.ElementType;
  /** Breadcrumbs or a back link, rendered above the title block. */
  breadcrumbs?: React.ReactNode;
  /** Search and filters that belong inside the header on discovery pages. */
  children?: React.ReactNode;
  /** Picks the ink and accent of the realm without forking the component. */
  realm?: PageHeaderRealm;
  /**
   * `plain` is the calm workspace surface. `hero` keeps the expressive
   * translucent card the discovery pages use.
   */
  tone?: 'plain' | 'hero';
  size?: PageHeaderSize;
  /** Lets pagination scroll to and focus the heading. */
  id?: string;
  headingTabIndex?: number;
  className?: string;
}

/**
 * One header for every page. The realm only changes ink and accent; the
 * structure, spacing and title ladder stay identical across the product.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  eyebrow,
  description,
  meta,
  actions,
  icon: Icon,
  breadcrumbs,
  children,
  realm = 'traveller',
  tone = 'plain',
  size = 'lg',
  id,
  headingTabIndex,
  className,
}) => {
  const isAgency = realm === 'agency';
  const isAdmin = realm === 'admin';

  return (
    <header className={cn('space-y-4', className)}>
      {breadcrumbs ? <div>{breadcrumbs}</div> : null}
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
              <p
                className={cn(
                  'flex items-center gap-1.5 text-xs font-semibold tracking-wide',
                  isAgency
                    ? 'text-agency-accent-ink'
                    : isAdmin
                      ? 'text-admin-accent-ink'
                      : 'text-primary'
                )}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
                {eyebrow}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <h1
                id={id}
                tabIndex={headingTabIndex}
                className={cn(
                  titleSize[size],
                  'flex flex-wrap items-center gap-2 scroll-mt-24',
                  isAgency
                    ? 'font-display font-medium leading-[1.12] tracking-[-0.01em] text-agency-ink'
                    : isAdmin
                      ? 'font-semibold tracking-tight text-foreground'
                      : 'font-display font-semibold leading-tight tracking-tight text-foreground'
                )}
              >
                {title}
              </h1>
              {meta}
            </div>
            {description ? (
              <p
                className={cn(
                  'max-w-2xl text-sm leading-6',
                  isAgency
                    ? 'text-agency-muted'
                    : 'text-muted-foreground',
                  isAdmin && 'max-w-3xl',
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
};
