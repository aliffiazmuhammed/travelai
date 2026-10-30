import React from 'react';
import { cn } from '@/lib/utils';

export type TravellerSegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shown as a quiet tally on the right of the label when provided. */
  count?: number;
};

interface TravellerSegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<TravellerSegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * The one filter control for traveller pages. The gallery, the directory, the
 * proposal list and the trip library all narrow the same way.
 */
export function TravellerSegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: TravellerSegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 rounded-full border border-border/70 bg-card p-1',
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
