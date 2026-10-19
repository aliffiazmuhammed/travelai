/**
 * F12d: applying an activity-level TravelAI proposal to an itinerary snapshot.
 *
 * Deliberately dependency-free (no imports, no `@/` aliases): the same file is
 * exercised by the backend's temporary live probe through tsx, so the drift
 * guard that protects users is verified against the very code the browser
 * bundles — not a paraphrase of it.
 *
 * The transform is PURE: it clones the touched days and never mutates the
 * caller's state. Refusals throw user-facing messages; the sheet keeps the
 * itinerary untouched when they do.
 */

export interface EditableActivity {
  title?: string;
  name?: string;
}

export interface EditableDay {
  day: number;
  activities?: Array<string | EditableActivity>;
}

/** The two proposal kinds this module applies (swaps reuse `swapDayPlans`). */
export type ActivityEdit =
  | {
      kind: "move_activity";
      day: number;
      index: number;
      to_day: number;
      to_index: number;
      expect: string;
    }
  | { kind: "update_activity"; day: number; index: number; value: string; expect: string };

export const DAY_GONE_MESSAGE =
  "This trip no longer has that day — reload the trip and ask again.";
export const ACTIVITY_GONE_MESSAGE =
  "That activity is gone or the day has fewer activities now — reload the trip and ask again.";
export const ITINERARY_CHANGED_MESSAGE =
  "The itinerary changed since this was suggested — ask TravelAI again.";
export const NO_OP_MOVE_MESSAGE = "That activity is already in that spot.";

/** The label the timeline shows (`title` first, then legacy `name`). */
export function activityLabelOf(
  activity: string | EditableActivity | null | undefined
): string {
  if (typeof activity === "string") return activity.trim();
  if (!activity) return "";
  return String(activity.title || activity.name || "").trim();
}

/**
 * The drift guard — mirrors `labelMatches` in
 * `backend/src/services/collab/assistant.ts`. True when the expected label is
 * a case/space-insensitive prefix of the live one, so a card that outlived a
 * reshuffle refuses instead of editing the wrong row.
 */
export function labelMatches(actual: unknown, expected: unknown): boolean {
  const normalize = (value: unknown) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim();
  const want = normalize(expected);
  const have = normalize(actual);
  return Boolean(want) && (have === want || have.startsWith(want));
}

const dayIndexFor = (days: EditableDay[], day: number): number =>
  days.findIndex((entry) => Number(entry.day) === Number(day));

const activitiesOf = (day: EditableDay): Array<string | EditableActivity> =>
  Array.isArray(day.activities) ? day.activities : [];

/**
 * Returns a new days array with one activity moved or renamed. Throws a
 * user-facing message when the snapshot no longer matches the proposal.
 */
export function applyActivityEdit<D extends EditableDay>(
  days: D[],
  proposal: ActivityEdit
): D[] {
  const sourceIndex = dayIndexFor(days, proposal.day);
  if (sourceIndex === -1) throw new Error(DAY_GONE_MESSAGE);

  const source = days[sourceIndex];
  const sourceActivities = activitiesOf(source);
  if (
    !Number.isInteger(proposal.index) ||
    proposal.index < 0 ||
    proposal.index >= sourceActivities.length
  ) {
    throw new Error(ACTIVITY_GONE_MESSAGE);
  }
  if (!labelMatches(activityLabelOf(sourceActivities[proposal.index]), proposal.expect)) {
    throw new Error(ITINERARY_CHANGED_MESSAGE);
  }

  if (proposal.kind === "update_activity") {
    const value = proposal.value.trim();
    if (!value) throw new Error("The new activity title is empty.");
    const activities = sourceActivities.map((activity, index) =>
      index === proposal.index
        ? typeof activity === "string"
          ? value
          : { ...activity, title: value }
        : activity
    );
    const next = [...days];
    next[sourceIndex] = { ...source, activities } as D;
    return next;
  }

  const targetIndex = dayIndexFor(days, proposal.to_day);
  if (targetIndex === -1) throw new Error(DAY_GONE_MESSAGE);
  const targetActivities = activitiesOf(days[targetIndex]);
  if (
    !Number.isInteger(proposal.to_index) ||
    proposal.to_index < 0 ||
    proposal.to_index > targetActivities.length
  ) {
    throw new Error(ACTIVITY_GONE_MESSAGE);
  }
  if (sourceIndex === targetIndex && proposal.index === proposal.to_index) {
    throw new Error(NO_OP_MOVE_MESSAGE);
  }

  const moved = sourceActivities[proposal.index];
  const remaining = sourceActivities.filter((_, index) => index !== proposal.index);
  const next = [...days];

  if (sourceIndex === targetIndex) {
    // Same day: `to_index` is the FINAL position, so insert into the list
    // after the removal — exactly how the prompt describes it.
    const reordered = [...remaining];
    reordered.splice(Math.min(proposal.to_index, reordered.length), 0, moved);
    next[sourceIndex] = { ...source, activities: reordered } as D;
    return next;
  }

  next[sourceIndex] = { ...source, activities: remaining } as D;
  const destination = [...targetActivities];
  destination.splice(Math.min(proposal.to_index, destination.length), 0, moved);
  next[targetIndex] = { ...days[targetIndex], activities: destination } as D;
  return next;
}
