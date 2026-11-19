import React from 'react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  /** Options, search and dropdowns that narrow the list. */
  children: React.ReactNode;
  /** Reset or secondary actions aligned to the far edge. */
  actions?: React.ReactNode;
  /** Landmark name; say what the controls narrow, e.g. "Filter enquiries". */
  label?: string;
  className?: string;
}

/**
 * One row for the controls that narrow a list: same wrap, same gap, same
 * alignment. Pages keep the controls themselves — only the layout is shared.
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  children,
  actions,
  label = 'Filters',
  className,
}) => (
  <div
    role="group"
    aria-label={label}
    className={cn(
      'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between',
      className
    )}
  >
    <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    {actions ? (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);
