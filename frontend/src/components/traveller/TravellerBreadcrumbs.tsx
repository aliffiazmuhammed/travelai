import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TravellerCrumb = {
  label: string;
  /** The last crumb usually has no link; it is the page you are on. */
  to?: string;
};

/**
 * The trail back up from any signed-in or public traveller page. The top
 * navbar says where you can go; this says where you are.
 */
export const TravellerBreadcrumbs: React.FC<{
  items: TravellerCrumb[];
  className?: string;
}> = ({ items, className }) => {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        <li className="flex items-center">
          <Link
            to="/"
            aria-label="Home"
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
          >
            <Home className="h-3 w-3" aria-hidden />
            <span className="sr-only">Home</span>
          </Link>
        </li>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden />
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="truncate rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn('truncate px-1 py-0.5', last && 'text-foreground')}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
