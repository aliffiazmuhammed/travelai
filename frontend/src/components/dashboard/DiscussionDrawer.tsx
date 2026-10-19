import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageCircle } from "lucide-react";
import { CommentsTab } from "./CommentsTab";
import type { PresenceUser } from "@/hooks/useTripEvents";
import type { UseTripComments } from "@/hooks/useTripComments";
import type { TripRole } from "@/types/trip";

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
  /** The live SSE roster — shown as a mini avatar stack in the header. */
  presence?: PresenceUser[];
  /** Hide the FAB when the drawer is redundant (Discuss tab active, etc.). */
  hidden?: boolean;
}

const initialsFor = (label: string): string =>
  (label || "T").trim().slice(0, 2).toUpperCase();

export const DiscussionDrawer: React.FC<DiscussionDrawerProps> = ({
  tripId,
  myRole,
  days,
  controller,
  presence = [],
  hidden = false,
}) => {
  const [open, setOpen] = useState(false);
  const unread = controller.state.unread;
  const roster = presence.slice(0, 4);
  const extraCount = Math.max(0, presence.length - roster.length);

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
            title="Trip discussion"
            aria-label={`Trip discussion${unread > 0 ? `, ${unread} unread` : ""}`}
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
            <SheetTitle className="flex items-center gap-2 text-sm font-extrabold">
              <MessageCircle className="w-4 h-4 text-primary" />
              Trip discussion
            </SheetTitle>
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
          </SheetHeader>

          {/* Full-height chat (variant='chat' owns scroll + floor composer). */}
          <div className="flex-1 min-h-0">
            <CommentsTab
              tripId={tripId}
              myRole={myRole}
              days={days}
              controller={controller}
              variant="chat"
              typingLabels={controller.typingLabels}
              onTyping={controller.notifyTyping}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DiscussionDrawer;
