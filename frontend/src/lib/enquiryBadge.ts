/**
 * The navbar badge is a plain read per navigation (M9 R6). Two personal
 * surfaces change those counters without navigating — opening a thread marks
 * it read, and answering a proposal closes it — so they announce it here
 * instead of the navbar holding a second live stream on every page.
 */
export const ENQUIRY_BADGE_EVENT = 'travelai:enquiry-badge-changed';

export function notifyEnquiryBadgeChanged(): void {
  window.dispatchEvent(new Event(ENQUIRY_BADGE_EVENT));
}
