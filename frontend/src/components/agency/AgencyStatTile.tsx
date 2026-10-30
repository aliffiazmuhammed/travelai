import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'teal' | 'sky' | 'violet' | 'amber' | 'slate';

const toneClasses: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
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
        <p className="text-2xl font-semibold leading-tight tabular-nums text-slate-900 dark:text-slate-50">
          {value === undefined || value === null ? '—' : value}
        </p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        ) : null}
      </div>
    </CardContent>
  );

  const shell = cn(
    'rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
    className
  );

  if (!to) {
    return <Card className={shell}>{body}</Card>;
  }

  return (
    <Card
      className={cn(
        shell,
        'transition hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-teal-600 focus-within:ring-offset-2 dark:focus-within:ring-offset-slate-950'
      )}
    >
      <Link
        to={to}
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
      >
        {body}
      </Link>
    </Card>
  );
};
