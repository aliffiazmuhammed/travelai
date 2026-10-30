import React from 'react';
import { cn } from '@/lib/utils';

export type AgencySegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shown as a quiet tally on the right of the label when provided. */
  count?: number;
};

interface AgencySegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<AgencySegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * One filter control for the whole workspace. The inbox, the event library, the
 * template shelf and the audit log all narrow the same way, so a team learns the
 * gesture once.
 */
export function AgencySegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: AgencySegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 rounded-full border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900',
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
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900',
              active
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
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
