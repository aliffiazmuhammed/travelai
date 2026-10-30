import React from 'react';
import { cn } from '@/lib/utils';

export type TravellerSectionTab<T extends string> = {
  value: T;
  label: string;
  icon?: React.ElementType;
};

interface TravellerSectionTabsProps<T extends string> {
  ariaLabel: string;
  /** id of the container that holds the tab panels, for aria-controls. */
  panelId: string;
  value: T;
  options: Array<TravellerSectionTab<T>>;
  onChange: (value: T) => void;
}

/**
 * In-page navigation for pages that would otherwise be one long scroll. Every
 * panel stays mounted, so a half-typed form survives a look at another tab.
 */
export function TravellerSectionTabs<T extends string>({
  ariaLabel,
  panelId,
  value,
  options,
  onChange,
}: TravellerSectionTabsProps<T>) {
  const baseId = React.useId();

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value);
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    document.getElementById(`${baseId}-tab-${options[next].value}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="sticky top-[68px] z-20 -mx-4 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const active = option.value === value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              id={`${baseId}-tab-${option.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                active
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
