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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { avatarSrc, initialsFor } from "@/lib/avatar";
import type { GalleryTrip, TripJoinRequest } from "@/types/gallery";

interface JoinRequestDialogProps {
  open: boolean;
  onClose: () => void;
  trip: GalleryTrip;
  /** Called after a successful submit so the page can show the pending state. */
  onSubmitted: (request: TripJoinRequest) => void;
}

const MESSAGE_MAX = 280;

/**
 * Join-request composer (Milestone 8 G5).
 *
 * The copy is deliberately explicit about what the owner receives: a name, a
 * photo and this short note. There is no email notification and no automatic
 * membership — the owner decides, and approval can only ever grant commenter.
 */
export const JoinRequestDialog: React.FC<JoinRequestDialogProps> = ({
  open,
  onClose,
  trip,
  onSubmitted,
}) => {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setSending(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    try {
      setSending(true);
      const result = await api.requestToJoinTrip(trip._id, message);
      toast.success("Request sent — the owner will see it in their trip.");
      onSubmitted(result.request);
      onClose();
    } catch (err: any) {
      toast.error(
        err?.message || "That request could not be sent. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !sending && onClose()}>
      <DialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6 space-y-4">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Ask to join this trip
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            A request goes to{" "}
            <strong className="text-foreground">{trip.publisher.name}</strong>.
            Nothing changes until they approve.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
          <Avatar className="h-10 w-10 shrink-0">
            {trip.publisher.avatarUrl && (
              <AvatarImage
                src={avatarSrc(trip.publisher.avatarUrl)}
                alt={trip.publisher.name}
              />
            )}
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
              {initialsFor(trip.publisher.name || trip.publisher.handle)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-foreground">
              {trip.title}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              @{trip.publisher.handle}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="join-request-message"
            className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
          >
            A short note (optional)
          </label>
          <Textarea
            id="join-request-message"
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Who you are, and why you would like to come along."
            className="min-h-[90px] resize-none rounded-2xl text-xs"
            disabled={sending}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {message.length}/{MESSAGE_MAX}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-3">
          <ShieldCheck className="w-4 h-4 shrink-0 text-primary mt-0.5" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The owner sees your public name, photo and this note — never your
            email. Approval gives you a commenter seat, not edit access. Never
            share payment details or your home address. See the{" "}
            <Link
              to="/guidelines"
              className="font-bold text-primary hover:underline"
            >
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
            variant="hero"
            onClick={handleSubmit}
            disabled={sending}
            className="rounded-xl text-xs font-bold h-10 gap-2"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            {sending ? "Sending…" : "Send request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
