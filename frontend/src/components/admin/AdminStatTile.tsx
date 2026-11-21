import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';

const toneClasses: Record<Tone, string> = {
  indigo: 'bg-admin-accent/15 text-admin-accent-ink',
  emerald: 'bg-success/15 text-success-ink',
  amber: 'bg-warning/15 text-warning-ink',
  sky: 'bg-info/15 text-info-ink',
  rose: 'bg-destructive/15 text-destructive-ink',
  slate: 'bg-muted text-muted-foreground',
};

/**
 * A count with one sentence of context. When `to` is set the whole tile is the
 * link, so the number and its explanation share a single focus target.
 */
export const AdminStatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value?: number | string | null;
  hint?: React.ReactNode;
  tone?: Tone;
  to?: string;
  className?: string;
}> = ({ icon: Icon, label, value, hint, tone = 'slate', to, className }) => {
  const body = (
    <CardContent className="flex flex-1 items-start gap-3 p-4">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
          toneClasses[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-semibold leading-tight tabular-nums text-foreground">
          {value === undefined || value === null ? '—' : value}
        </p>
        <p className="text-sm font-medium text-foreground/90">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </CardContent>
  );

  const shell = cn('rounded-2xl border-border bg-card shadow-sm h-full flex flex-col', className);

  if (!to) {
    return <Card className={shell}>{body}</Card>;
  }

  return (
    <Card
      className={cn(
        shell,
        'transition hover:-translate-y-0.5 hover:border-admin-accent/40 hover:shadow-md'
      )}
    >
      <Link
        to={to}
        className="flex h-full flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-admin-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </Card>
  );
};
