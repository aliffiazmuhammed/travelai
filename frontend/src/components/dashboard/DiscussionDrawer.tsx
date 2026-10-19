import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MessageCircle } from "lucide-react";
import { CommentsTab } from "./CommentsTab";
import type { UseTripComments } from "@/hooks/useTripComments";
import type { TripRole } from "@/types/trip";

/**
 * The floating trip discussion (Milestone 7, sprint F8b) — chat v1's second
 * surface. The 9th Discuss tab stays (deep-linkable, full width); this drawer
 * is the same `CommentsTab` surface reachable from ANY tab:
 *
 * - A fixed FAB bottom-right, offset above the mobile tab bar (`bottom-20`),
 *   with the unread badge (server-seeded, frame-bumped, flush-on-open
 *   upstream — the hook owns all three rules).
 * - The FAB hides when the Discuss tab itself is active (no duplicate surface)
 *   and on surfaces without a role at all (`hidden` covers both).
 * - Opening the drawer calls `controller.setOpen(true)` → the read marker is
 *   flushed server-side; closing only marks the surface closed, the badge has
 *   nothing new to grow on while everyone in it behaves.
 *
 * It is deliberately ONE surface rendered twice — two live copies of the same
 * controlled component, not two chat systems (the one-stream decision, §2).
 */

interface DiscussionDrawerProps {
  tripId: string;
  /** The caller's own role on this trip. */
  myRole: TripRole;
  /** Number of itinerary days available as anchors (bounds the day picker). */
  days?: number;
  /** The shared comment state owned by ItineraryDisplay / useTripComments. */
  controller: UseTripComments;
  /** Hide the FAB when the drawer is redundant (Discuss tab active, etc.). */
  hidden?: boolean;
}

export const DiscussionDrawer: React.FC<DiscussionDrawerProps> = ({
  tripId,
  myRole,
  days,
  controller,
  hidden = false,
}) => {
  const [open, setOpen] = useState(false);
  const unread = controller.state.unread;

  /** Opening/closing the Sheet is exactly the surface-open signal upstream. */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    controller.setOpen(next);
  };

  return (
    <>
      {!hidden && (
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
        </Button>
      )}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full p-0 flex flex-col sm:max-w-[440px] gap-0"
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/70">
            <SheetTitle className="flex items-center gap-2 text-base font-extrabold">
              <MessageCircle className="w-4 h-4 text-primary" />
              Trip discussion
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Day-anchored chat for everyone on this trip.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <CommentsTab
              tripId={tripId}
              myRole={myRole}
              days={days}
              controller={controller}
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
