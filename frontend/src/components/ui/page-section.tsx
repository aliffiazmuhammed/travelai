import React from 'react';
import { cn } from '@/lib/utils';

interface PageSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Heading level under the page title. */
  level?: 2 | 3;
  id?: string;
  className?: string;
}

/**
 * A titled block inside a page. Renders a section whose heading labels it, so
 * screen-reader users can jump between blocks without a visual label pass.
 */
export const PageSection: React.FC<PageSectionProps> = ({
  title,
  description,
  actions,
  children,
  level = 2,
  id,
  className,
}) => {
  const generatedId = React.useId();
  const headingId = id ? `${id}-heading` : generatedId;
  const Heading = level === 2 ? 'h2' : 'h3';

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className={cn('space-y-3', className)}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <Heading
                id={headingId}
                className={cn(
                  'scroll-mt-24 font-semibold tracking-tight text-foreground',
                  level === 2 ? 'text-base' : 'text-sm'
                )}
              >
                {title}
              </Heading>
            ) : null}
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
};
