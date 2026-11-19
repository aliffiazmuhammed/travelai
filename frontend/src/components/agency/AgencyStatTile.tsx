import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'teal' | 'sky' | 'violet' | 'amber' | 'slate';

const toneClasses: Record<Tone, string> = {
  teal: 'bg-agency-accent-soft text-agency-accent-ink',
  sky: 'bg-info/10 text-info-ink dark:bg-info/20',
  violet: 'bg-accent/10 text-accent-ink dark:bg-accent/50',
  amber: 'bg-warning/10 text-warning-ink dark:bg-warning/20',
  slate: 'bg-muted text-muted-foreground',
};

/**
 * A count with a sentence attached. When `to` is set the whole tile is the
 * link, so the number and its explanation share one focus target instead of
 * leaving a small "open" button stranded on the right.
 */
export const AgencyStatTile: React.FC<{
  icon: React.ElementType;
  label: string;
  value?: number | string | null;
  hint?: React.ReactNode;
  tone?: Tone;
  to?: string;
  className?: string;
}> = ({ icon: Icon, label, value, hint, tone = 'slate', to, className }) => {
  const body = (
    <CardContent className="flex items-start gap-3.5 p-4">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
          toneClasses[tone]
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-3xl font-semibold leading-none tabular-nums text-agency-ink">
          {value === undefined || value === null ? '—' : value}
        </p>
        <p className="mt-1 text-sm font-medium text-agency-ink">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs leading-5 text-agency-muted">{hint}</p>
        ) : null}
      </div>
    </CardContent>
  );

  const shell = cn(
    'rounded-2xl border-agency-line bg-agency-panel shadow-none',
    className
  );

  if (!to) {
    return <Card className={shell}>{body}</Card>;
  }

  return (
    <Card
      className={cn(
        shell,
        'transition-colors hover:border-agency-accent/40 focus-within:ring-2 focus-within:ring-agency-accent focus-within:ring-offset-2 focus-within:ring-offset-agency-canvas'
      )}
    >
      <Link
        to={to}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-agency-accent focus-visible:ring-offset-2 focus-visible:ring-offset-agency-canvas"
      >
        {body}
      </Link>
    </Card>
  );
};
