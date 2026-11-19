import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Paging footer for every console table. The console has four lists that page
 * the same way; keeping one control means the sentence, the buttons and their
 * disabled rules never drift apart.
 */
export const AdminPagination: React.FC<{
  page: number;
  totalPages: number;
  /** `undefined` while the first page is still loading. */
  total?: number;
  noun: string;
  /** Irregular plural, e.g. `entries`; defaults to `noun + "s"`. */
  nounPlural?: string;
  loading?: boolean;
  onChange: (page: number) => void;
  /** Heading to focus after paging; defaults to the nearest page or dialog heading. */
  focusTargetId?: string;
  className?: string;
}> = ({ page, totalPages, total, noun, nounPlural, loading, onChange, focusTargetId, className }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const goToPage = (next: number) => {
    onChange(next);
    // Move focus to the heading once the new page has rendered so keyboard
    // users land at the top of the refreshed list, not on the old footer.
    requestAnimationFrame(() => {
      const scroller = containerRef.current;
      if (!scroller) return;
      const scope =
        scroller.closest<HTMLElement>('[role="dialog"]') ??
        scroller.closest<HTMLElement>('main') ??
        document.body;
      const target = focusTargetId
        ? document.getElementById(focusTargetId)
        : scope.querySelector<HTMLElement>('h1, h2');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    });
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3',
        className
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {total === undefined
          ? 'Loading…'
          : `${total} ${total === 1 ? noun : nounPlural ?? `${noun}s`} · page ${page} of ${Math.max(totalPages, 1)}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => goToPage(Math.max(1, page - 1))}
          disabled={total === undefined || page <= 1 || loading}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => goToPage(page + 1)}
          disabled={total === undefined || page >= totalPages || loading}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
};
