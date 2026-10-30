import React from 'react';
import { cn } from '@/lib/utils';

export type AgencySectionTab<T extends string> = {
  value: T;
  label: string;
  icon?: React.ElementType;
};

interface AgencySectionTabsProps<T extends string> {
  ariaLabel: string;
  /** id of the container that holds the tab panels, for aria-controls. */
  panelId: string;
  value: T;
  options: Array<AgencySectionTab<T>>;
  onChange: (value: T) => void;
}

/**
 * In-page navigation for pages that would otherwise be one long scroll. It sits
 * under the sticky workspace header, so the sections stay one tap away while the
 * form itself keeps every field mounted.
 */
export function AgencySectionTabs<T extends string>({
  ariaLabel,
  panelId,
  value,
  options,
  onChange,
}: AgencySectionTabsProps<T>) {
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
      className="sticky top-14 z-20 -mx-4 border-b border-slate-200/80 bg-slate-50/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 sm:-mx-6 sm:px-6 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/80"
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
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950',
                active
                  ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100'
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
