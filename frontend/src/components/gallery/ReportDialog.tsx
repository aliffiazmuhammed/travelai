import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/services/api";
import { toast } from "sonner";
import { AlertTriangle, Flag, Loader2 } from "lucide-react";
import type { ReportReason, ReportTargetType } from "@/types/gallery";

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** What the visitor is reporting, shown in the dialog copy. */
  targetLabel: string;
  /** Called after the server accepts the report. */
  onReported?: (hidden: boolean) => void;
}

const NOTE_MAX = 500;

const REASONS: Array<{
  value: ReportReason;
  label: string;
  hint: string;
}> = [
  {
    value: "spam",
    label: "Spam or misleading",
    hint: "Copied content, advertising, or something that is not a real trip.",
  },
  {
    value: "harassment",
    label: "Harassment or hate",
    hint: "Targeted abuse, threats, or hateful content.",
  },
  {
    value: "scam",
    label: "Scam or fraud",
    hint: "Requests for money, off-platform payments, or deceptive offers.",
  },
  {
    value: "privacy",
    label: "Privacy or personal information",
    hint: "A home address, phone number, or someone else's private details.",
  },
  {
    value: "other",
    label: "Something else",
    hint: "Anything that does not fit the categories above.",
  },
];

/**
 * Report composer (Milestone 8 G6).
 *
 * Reporting is available to signed-in personal accounts only. The dialog never
 * shows the reporter's identity to the content owner; it only confirms that the
 * report was received. Three distinct open reports remove a trip from the
 * gallery automatically pending review.
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
  onReported,
}) => {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("spam");
      setNote("");
      setSending(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    try {
      setSending(true);
      const result = await api.reportContent({
        targetType,
        targetId,
        reason,
        note,
      });
      toast.success(
        result.hidden
          ? "Report received. This content is now hidden from the gallery pending review."
          : "Report received. Thank you for helping keep the gallery safe."
      );
      onReported?.(result.hidden);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.message || "That report could not be sent. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="rounded-3xl max-w-lg w-[92vw] sm:w-full p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Flag className="w-4 h-4 text-destructive" />
            Report this{" "}
            {targetType === "trip"
              ? "trip"
              : targetType === "agency_profile"
                ? "agency profile"
                : "profile"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Reporting <strong className="text-foreground">{targetLabel}</strong>.
            The owner is not told who reported them.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2" disabled={sending}>
          <legend className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            What is wrong?
          </legend>
          {REASONS.map((entry) => (
            <label
              key={entry.value}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${
                reason === entry.value
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-border/70 bg-card hover:bg-muted/40"
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                value={entry.value}
                checked={reason === entry.value}
                onChange={() => setReason(entry.value)}
                className="mt-0.5 h-3.5 w-3.5 accent-destructive"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-xs font-bold text-foreground">
                  {entry.label}
                </span>
                <span className="block text-[11px] leading-relaxed text-muted-foreground">
                  {entry.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label
            htmlFor="report-note"
            className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            Anything else? (optional)
          </label>
          <Textarea
            id="report-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add context for the reviewer."
            className="min-h-[80px] resize-none rounded-2xl text-xs"
            disabled={sending}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {note.length}/{NOTE_MAX}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Reports are for genuine safety and quality problems.{" "}
            {targetType === "trip"
              ? "Three distinct reports hide a trip from the gallery pending review."
              : targetType === "agency_profile"
                ? "Agency pages are reviewed manually and are never hidden automatically."
                : "Profile reports go to the moderation queue; a profile is never hidden automatically."}{" "}
            Read the{" "}
            <Link to="/guidelines" className="font-bold text-primary hover:underline">
              community guidelines
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={sending}
            className="rounded-xl text-xs font-semibold h-10"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={sending}
            className="rounded-xl text-xs font-bold h-10 gap-2"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Flag className="w-4 h-4" />
            )}
            {sending ? "Sending…" : "Submit report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
