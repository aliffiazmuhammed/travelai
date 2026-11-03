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
        'inline-flex flex-wrap items-center gap-0.5 rounded-full border border-agency-line bg-agency-panel p-1',
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
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-agency-panel',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-agency-muted hover:bg-agency-soft hover:text-agency-ink'
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  active ? 'text-primary-foreground/70' : 'text-agency-muted/70'
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
