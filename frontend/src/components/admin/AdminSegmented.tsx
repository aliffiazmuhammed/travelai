import React from 'react';
import { cn } from '@/lib/utils';

export type AdminSegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shown as a quiet tally when provided. */
  count?: number;
};

interface AdminSegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<AdminSegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * The console's one filter gesture: realm tabs, tenant status and the report
 * queue all narrow the same way, with the count of each bucket on the chip.
 */
export function AdminSegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: AdminSegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 rounded-full border border-border bg-card p-1',
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
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              active
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'text-white/80' : 'text-muted-foreground'
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
