import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password field with a reveal toggle (Phase 3, AUTH-041).
 *
 * The toggle is a real button with an accessible label and `aria-pressed`, not
 * an icon with a click handler, so keyboard and screen-reader users can find
 * it. The input keeps the caller's ref and every other native prop.
 */
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type">
>(({ className, disabled, ...props }, ref) => {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={revealed ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setRevealed((value) => !value)}
        disabled={disabled}
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
