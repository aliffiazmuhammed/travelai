import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/services/api";
import { toast } from "sonner";
import { Loader2, Link2, Check } from "lucide-react";
import { CopyableLink } from "./TripMembers";
import { roleLabel } from "@/hooks/useTripAccess";
import type { TripInviteInfo, TripRole } from "@/types/trip";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
}

const TTL_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
  { label: "30 days", hours: 720 },
];

const USES_OPTIONS = [
  { label: "Single use", uses: 1 },
  { label: "Up to 5 people", uses: 5 },
  { label: "Up to 15 people", uses: 15 },
  { label: "Up to 25 people", uses: 25 },
];

type CreatedState = { invite: TripInviteInfo; link: string } | null;

/**
 * Link-invite composer for trip owners (§3.4). Scope note: this deployment
 * ships **link-only invites** — the form never gates on an email provider,
 * there is no SMTP/Resend wiring (recorded as an explicit scope decision).
 */
export const InviteDialog: React.FC<InviteDialogProps> = ({ open, onClose, tripId }) => {
  const [role, setRole] = useState<Exclude<TripRole, "owner">>("editor");
  const [maxUses, setMaxUses] = useState(1);
  const [ttlHours, setTtlHours] = useState(168);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedState>(null);

  const handleCreate = async () => {
    try {
      setCreating(true);
      const result = await api.createTripInvite(tripId, {
        role,
        kind: "link",
        maxUses,
        ttlHours,
      });
      setCreated({ invite: result.invite, link: result.link });
    } catch (err: any) {
      toast.error(err.message || "Could not create the invite. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (nextOpen) return;
    setCreated(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-3xl max-w-md w-[92vw] sm:w-full p-5 sm:p-6 space-y-4">
        <DialogHeader className="space-y-1.5">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            Invite collaborators
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Share a link that lets people join this trip. Choose what they will
            be able to do — the server enforces it, the link can be revoked and
            expires on its own.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2 font-medium">
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {roleLabel(created.invite.role)} invite ready for{" "}
                {created.invite.maxUses === 1 ? "one person" : `up to ${created.invite.maxUses} people`}.
                The raw link is shown only once — store it if you plan to share it later.
              </span>
            </div>
            <CopyableLink link={created.link} />
            <Button
              type="button"
              variant="hero"
              className="w-full rounded-xl text-xs font-bold h-10"
              onClick={() => handleClose(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">What can they do?</Label>
              <Select value={role} onValueChange={(value) => setRole(value as Exclude<TripRole, "owner">)}>
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor" className="text-xs">
                    Editor — edit everything except members
                  </SelectItem>
                  <SelectItem value="commenter" className="text-xs">
                    Commenter — suggest and comment{" "}
                    <span className="text-muted-foreground">(limited for now)</span>
                  </SelectItem>
                  <SelectItem value="viewer" className="text-xs">
                    Viewer — read-only access
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Uses</Label>
                <Select value={String(maxUses)} onValueChange={(value) => setMaxUses(Number(value))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USES_OPTIONS.map((option) => (
                      <SelectItem key={option.uses} value={String(option.uses)} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Expires</Label>
                <Select value={String(ttlHours)} onValueChange={(value) => setTtlHours(Number(value))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TTL_OPTIONS.map((option) => (
                      <SelectItem key={option.hours} value={String(option.hours)} className="text-xs">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              type="button"
              variant="hero"
              disabled={creating}
              onClick={handleCreate}
              className="w-full rounded-xl text-xs font-bold h-10 gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" />
                  <span>Create invite link</span>
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
