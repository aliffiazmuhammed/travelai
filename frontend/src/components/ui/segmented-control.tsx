import React from 'react';
import { cn } from '@/lib/utils';
import type { PageHeaderRealm } from './page-header';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  /** Shown as a quiet tally on the right of the label when provided. */
  count?: number;
};

/** One height per density: 32/36 fine-pointer, 44 on touch pointers. */
export type SegmentedControlSize = 'sm' | 'md';

const buttonSize: Record<SegmentedControlSize, string> = {
  sm: 'min-h-8 px-3 py-1 text-xs font-semibold',
  md: 'min-h-9 px-3 py-1.5 text-xs font-medium',
};

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  size?: SegmentedControlSize;
  realm?: PageHeaderRealm;
  className?: string;
}

/**
 * The one filter gesture: traveller, agency and admin all narrow with the same
 * pill, the same selected treatment and the same touch target.
 */
export function SegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  size = 'sm',
  realm = 'traveller',
  className,
}: SegmentedControlProps<T>) {
  const isAgency = realm === 'agency';
  const isAdmin = realm === 'admin';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 rounded-full border p-1',
        isAgency
          ? 'border-agency-line bg-agency-panel'
          : 'border-border/70 bg-card',
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
              'inline-flex items-center gap-1.5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 coarse:min-h-11 coarse:px-4',
              buttonSize[size],
              isAdmin
                ? 'focus-visible:ring-admin-accent focus-visible:ring-offset-background'
                : isAgency
                  ? 'focus-visible:ring-primary focus-visible:ring-offset-agency-panel'
                  : 'focus-visible:ring-primary',
              active
                ? isAdmin
                  ? 'bg-admin-accent text-admin-accent-foreground shadow-sm'
                  : 'bg-primary text-primary-foreground shadow-sm'
                : isAgency
                  ? 'text-agency-muted hover:bg-agency-soft hover:text-agency-ink'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  active
                    ? isAdmin
                      ? 'text-admin-accent-foreground/70'
                      : 'text-primary-foreground/70'
                    : isAgency
                      ? 'text-agency-muted/70'
                      : 'text-muted-foreground'
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
