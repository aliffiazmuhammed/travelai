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
  loading?: boolean;
  onChange: (page: number) => void;
  className?: string;
}> = ({ page, totalPages, total, noun, loading, onChange, className }) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3',
      className
    )}
  >
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {total === undefined
        ? 'Loading…'
        : `${total} ${noun}${total === 1 ? '' : 's'} · page ${page} of ${Math.max(totalPages, 1)}`}
    </p>
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() => onChange(Math.max(1, page - 1))}
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
        onClick={() => onChange(page + 1)}
        disabled={total === undefined || page >= totalPages || loading}
      >
        Next
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  </div>
);
