import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'indigo' | 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';

const toneClasses: Record<Tone, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300',
  emerald: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  sky: 'bg-sky-500/15 text-sky-300',
  rose: 'bg-rose-500/15 text-rose-300',
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
    <CardContent className="flex items-start gap-3 p-4">
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

  const shell = cn('rounded-2xl border-border bg-card shadow-sm', className);

  if (!to) {
    return <Card className={shell}>{body}</Card>;
  }

  return (
    <Card
      className={cn(
        shell,
        'transition hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-md'
      )}
    >
      <Link
        to={to}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {body}
      </Link>
    </Card>
  );
};
