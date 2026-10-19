import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { KeyRound, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CommentsTab } from "./CommentsTab";
import type { PresenceUser } from "@/hooks/useTripEvents";
import type { UseTripComments } from "@/hooks/useTripComments";
import type { ChatCryptoApi } from "@/hooks/useTripChatCrypto";
import type { TripRole, AssistantProposal } from "@/types/trip";

/**
 * The floating trip discussion (Milestone 7, sprint F8b; chat shape §11) —
 * chat v1's second surface. The 9th Discuss tab stays (deep-linkable,
 * filterable feed); this drawer is a REAL group chat: chronological messages
 * anchored to the bottom edge, auto-scroll holding the tail, the composer as
 * the floor, and the live roster in the slim header. Same `CommentsTab` logic
 * core, `variant="chat"` — one state, one EventSource, one read marker.
 *
 * - A fixed FAB bottom-right, offset above the mobile tab bar (`bottom-20`),
 *   with the unread badge (server-seeded, frame-bumped, flush-on-open
 *   upstream — the hook owns all three rules).
 * - The FAB hides when the Discuss tab itself is active (no duplicate
 *   surface) and on surfaces without a role at all (`hidden` covers both).
 * - Opening the drawer calls `controller.setOpen(true)` → the read marker is
 *   flushed server-side; the Sheet unmounts on close, so each open starts
 *   scrolled to the newest message.
 */

interface DiscussionDrawerProps {
  tripId: string;
  /** The caller's own role on this trip. */
  myRole: TripRole;
  /** Number of itinerary days available as anchors (bounds the day picker). */
  days?: number;
  /** The shared comment state owned by ItineraryDisplay / useTripComments. */
  controller: UseTripComments;
  /** The E2EE session (F10) — powers the key-backup dialog + status dot. */
  crypto?: ChatCryptoApi;
  /** The live SSE roster — shown as a mini avatar stack in the header. */
  presence?: PresenceUser[];
  /** Hide the FAB when the drawer is redundant (Discuss tab active, etc.). */
  hidden?: boolean;
  /** F12b: proposal Apply composition — forwarded to the inner CommentsTab. */
  onApplyProposal?: (proposal: AssistantProposal) => Promise<void> | void;
}

const initialsFor = (label: string): string =>
  (label || "T").trim().slice(0, 2).toUpperCase();

export const DiscussionDrawer: React.FC<DiscussionDrawerProps> = ({
  tripId,
  myRole,
  days,
  controller,
  crypto,
  presence = [],
  hidden = false,
  onApplyProposal,
}) => {
  const [open, setOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [backupCode, setBackupCode] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState("");
  const [keysBusy, setKeysBusy] = useState(false);
  const unread = controller.state.unread;
  const cryptoStatus = crypto?.status ?? "off";
  const roster = presence.slice(0, 4);
  const extraCount = Math.max(0, presence.length - roster.length);

  /**
   * The key dialog (F10): export = show THIS browser's backup code; import =
   * paste a code from another device to unlock chat here. Any member may use
   * it — keys are per-browser, per-account awareness is not required.
   */
  const openKeysDialog = async () => {
    setKeysOpen(true);
    setBackupCode(null);
    setImportDraft("");
    try {
      setBackupCode((await crypto?.exportBackupCode()) ?? null);
    } catch {
      setBackupCode(null);
    }
  };

  const confirmImport = async () => {
    if (!crypto || !importDraft.trim() || keysBusy) return;
    setKeysBusy(true);
    try {
      await crypto.importBackupCode(importDraft.trim());
      toast.success("Chat key imported — messages will unlock now");
      setKeysOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "That backup code could not be imported.");
    } finally {
      setKeysBusy(false);
    }
  };

  /** Opening/closing the Sheet is exactly the surface-open signal upstream. */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    controller.setOpen(next);
  };

  return (
    <>
      {!hidden &&
        createPortal(
          /* The FAB lives in a portal on <body>: any ancestor with a
             transform/filter turns `position: fixed` into a viewport of that
             ancestor, which pinned it to the document's bottom-right and let
             it scroll away. Portaled + fixed, it stays on screen everywhere.
             Keep z-40: below the Sheet's own z-50 overlay so the open drawer
             covers it. */
          <Button
            type="button"
            size="icon"
            onClick={() => handleOpenChange(true)}
            title="Trip chat"
            aria-label={`Trip chat${unread > 0 ? `, ${unread} unread` : ""}`}
            className="fixed z-40 bottom-20 right-4 sm:bottom-6 sm:right-6 w-12 h-12 rounded-full shadow-lg"
          >
            <MessageCircle className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-black grid place-items-center shadow">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>,
          document.body
        )}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full p-0 flex flex-col sm:max-w-[440px] gap-0"
        >
          {/* Slim chat header — title + live roster; the logic core supplies
              everything else (no nested card, no duplicate title). */}
          <SheetHeader className="flex-row items-center justify-between gap-3 px-4 py-3 border-b border-border/70">
            <div className="flex items-center gap-2 min-w-0">
              <SheetTitle className="flex items-center gap-2 text-sm font-extrabold">
                <MessageCircle className="w-4 h-4 text-primary" />
                Trip chat
              </SheetTitle>
              {/* Quiet status dot: green = protected, amber = connecting,
                  red = messages here aren't protected (honest fallback). */}
              {crypto && (
                <span
                  title={
                    cryptoStatus === "ready"
                      ? "End-to-end encrypted"
                      : cryptoStatus === "error"
                        ? "Messages you send now aren't protected"
                        : "Connecting…"
                  }
                  className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    cryptoStatus === "ready" && "bg-emerald-500",
                    (cryptoStatus === "starting" ||
                      cryptoStatus === "bootstrap" ||
                      cryptoStatus === "keyless") &&
                      "bg-amber-400 animate-pulse",
                    (cryptoStatus === "off" || cryptoStatus === "error") &&
                      "bg-red-400"
                  )}
                />
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {crypto && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void openKeysDialog()}
                  title="Chat key backup"
                  aria-label="Chat key backup"
                  className="w-7 h-7 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </Button>
              )}
            {roster.length > 0 && (
              <div
                className="flex items-center -space-x-1.5"
                title={`In the trip right now: ${presence
                  .map((entry) => entry.label)
                  .join(", ")}`}
              >
                {roster.map((entry) => (
                  <Avatar key={entry.userId} className="h-6 w-6 ring-2 ring-background">
                    <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                      {initialsFor(entry.label)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {extraCount > 0 && (
                  <span className="text-[9px] font-bold text-muted-foreground pl-1.5">
                    +{extraCount}
                  </span>
                )}
              </div>
            )}
            </div>
          </SheetHeader>

          {/* Full-height chat (variant='chat' owns scroll + floor composer). */}
          <div className="flex-1 min-h-0">
            <CommentsTab
              tripId={tripId}
              myRole={myRole}
              days={days}
              controller={controller}
              crypto={crypto}
              variant="chat"
              typingLabels={controller.typingLabels}
              onTyping={controller.notifyTyping}
              onApplyProposal={onApplyProposal}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Key backup (F10): the only way to light up chat on a NEW browser. */}
      <Dialog open={keysOpen} onOpenChange={setKeysOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-extrabold">
              <KeyRound className="w-4 h-4 text-primary" />
              Chat key backup
            </DialogTitle>
            <DialogDescription>
              Messages are end-to-end encrypted and the unlocking half lives in
              the browser that created it. On a device where chat already works,
              tap the key icon there, copy its code, and paste it below — this
              device then reads and writes the same chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Export this device&apos;s key
              </p>
              {backupCode && cryptoStatus !== "keyless" ? (
                <Textarea
                  readOnly
                  value={backupCode}
                  rows={3}
                  onFocus={(event) => event.currentTarget.select()}
                  className="font-mono text-[10px] resize-none"
                />
              ) : cryptoStatus === "keyless" ? (
                <p className="text-xs text-muted-foreground">
                  This device&apos;s key is not the one this trip uses, so there
                  is nothing useful to export here — import the code from the
                  device where chat already works.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {cryptoStatus === "off"
                    ? "No key to export — encryption is unavailable on this device."
                    : "Generating a backup code…"}
                </p>
              )}
              {backupCode && cryptoStatus !== "keyless" && (
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  onClick={() => {
                    void navigator.clipboard.writeText(backupCode);
                    toast.success("Backup code copied");
                  }}
                >
                  Copy code
                </Button>
              )}
            </div>
            <div className="border-t border-border/60" />
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Import a key from another device
              </p>
              <Textarea
                value={importDraft}
                onChange={(event) => setImportDraft(event.target.value)}
                placeholder="TAI1.…"
                rows={3}
                className="font-mono text-[10px] resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setKeysOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => void confirmImport()}
              disabled={!importDraft.trim() || keysBusy}
            >
              {keysBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Unlock this device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DiscussionDrawer;
