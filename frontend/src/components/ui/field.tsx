import React from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/** Props a control needs to be labelled and described correctly. */
export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
  required: boolean;
}

interface FieldProps {
  label: React.ReactNode;
  /** Stable id; generated when omitted. */
  id?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  /** Render the control with the wiring the field just generated. */
  children: (control: FieldControlProps) => React.ReactNode;
}

/**
 * One field: a real label, a hint, an error slot and the ids that connect them
 * to the control. The render prop keeps custom wrappers (password toggles,
 * input groups) working without cloning anything.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  id,
  hint,
  error,
  required,
  className,
  labelClassName,
  children,
}) => {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control: FieldControlProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
    required: Boolean(required),
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={fieldId} className={labelClassName}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive-ink" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children(control)}
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium leading-5 text-destructive-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
};

interface FormErrorSummaryProps {
  errors: Record<string, string | undefined | null>;
  /** Sentence shown above the list. */
  title?: React.ReactNode;
  className?: string;
}

/**
 * One announced summary per failed submit. Fields keep their own inline copy;
 * this is the single `role="alert"` so a screen reader hears the result once.
 */
export const FormErrorSummary: React.FC<FormErrorSummaryProps> = ({
  errors,
  title = 'Check the highlighted fields.',
  className,
}) => {
  const messages = Object.values(errors).filter(
    (message): message is string => Boolean(message)
  );
  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className={cn(
        'space-y-1 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-foreground',
        className
      )}
    >
      <p className="font-semibold">{title}</p>
      <ul className="list-inside list-disc text-xs leading-5 text-destructive-ink">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
};

/** Focus the first control a failed submit marked invalid. */
export function focusFirstInvalid(form: HTMLFormElement | null | undefined): boolean {
  if (!form) return false;
  const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return false;
  invalid.scrollIntoView({ block: 'center' });
  invalid.focus({ preventScroll: true });
  return true;
}

/** Run the focus move after React has committed the invalid state. */
export function focusFirstInvalidAfterRender(
  form: HTMLFormElement | null | undefined
): void {
  requestAnimationFrame(() => focusFirstInvalid(form));
}
