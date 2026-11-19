import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'error' | 'warning' | 'success' | 'info';

const toneClasses: Record<Tone, string> = {
  error: 'border-destructive/40 bg-destructive/10 text-destructive-ink',
  warning: 'border-warning/40 bg-warning/10 text-warning-ink',
  success: 'border-success/40 bg-success/10 text-success-ink',
  info: 'border-border bg-muted/60 text-muted-foreground',
};

const toneIcons: Record<Tone, React.ElementType> = {
  error: ShieldAlert,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

/**
 * One inline message shape for the console. Mutations stay on toasts; anything
 * that replaces page content (a failed load, a settings outcome) uses this so a
 * reader can tell severity before reading the sentence.
 */
export const AdminNotice: React.FC<{
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ tone = 'error', title, children, action, className }) => {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : undefined}
      className={cn(
        'flex flex-wrap items-start gap-2.5 rounded-xl border p-3.5 text-sm',
        toneClasses[tone],
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-sm leading-5 opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
};
