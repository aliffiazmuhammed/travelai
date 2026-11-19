import { AlertCircle, CheckCircle2 } from "lucide-react";

import {
  DEFAULT_PASSWORD_POLICY,
  passwordStrength,
  type PasswordPolicy,
} from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  value: string;
  policy?: PasswordPolicy;
  email?: string;
  name?: string;
  /** Referenced by the password input's aria-describedby. */
  id?: string;
}

/**
 * Requirements-before-submit and a text strength label (Phase 2, AUTH-033).
 *
 * The meter is decorative; the label and hint are the accessible signal, so
 * nobody has to distinguish green from amber. The wrapper is a polite live
 * region: as the label changes, a screen reader hears the new text.
 */
export function PasswordStrength({
  value,
  policy = DEFAULT_PASSWORD_POLICY,
  email,
  name,
  id,
}: PasswordStrengthProps) {
  const result = passwordStrength(value, policy, { email, name });

  return (
    <div id={id} className="space-y-1.5" aria-live="polite" aria-atomic="true">
      <p className="text-sm leading-relaxed text-muted-foreground">{policy.requirements}</p>
      {result ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div aria-hidden="true" className="flex h-1.5 flex-1 gap-1">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-full flex-1 rounded-full transition-colors",
                    step <= result.score
                      ? result.weak
                        ? "bg-destructive"
                        : "bg-primary"
                      : "bg-border"
                  )}
                />
              ))}
            </div>
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 text-xs font-semibold",
                result.weak ? "text-destructive" : "text-primary"
              )}
            >
              {result.weak ? (
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {result.label}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{result.hint}</p>
        </div>
      ) : null}
    </div>
  );
}
