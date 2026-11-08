/**
 * F12d: applying an activity-level waytowalk proposal to an itinerary snapshot.
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

export interface EditableStay {
  name: string;
  location?: string;
  price_per_night?: string | number;
  vibe?: string;
  description?: string;
  [key: string]: unknown;
}

export interface EditableDay {
  day: number;
  activities?: Array<string | EditableActivity>;
  stay_recommendations?: Array<string | EditableStay>;
}

/** The proposal kinds this module applies (swaps reuse `swapDayPlans`). */
export type ActivityEdit =
  | {
      kind: "move_activity";
      day: number;
      index: number;
      to_day: number;
      to_index: number;
      expect: string;
    }
  | { kind: "update_activity"; day: number; index: number; value: string; expect: string }
  | { kind: "add_activity"; day: number; index?: number; value: string };

/** The picker card's payload (F12e): 2-3 ideas, one chosen. */
export interface ActivityChoiceProposal {
  kind: "activity_choices";
  day: number;
  index?: number;
  expect?: string;
  options: string[];
}

/**
 * Turns the option a human picked into the concrete edit an editor's Apply
 * would have produced: replace the activity named by `index` + `expect`, or
 * add the picked activity (at `index`, else at the end).
 */
export function resolveActivityChoice(
  proposal: ActivityChoiceProposal,
  option: string
): Exclude<ActivityEdit, { kind: "move_activity" }> {
  if (proposal.index !== undefined && proposal.expect !== undefined) {
    return {
      kind: "update_activity",
      day: proposal.day,
      index: proposal.index,
      value: option,
      expect: proposal.expect,
    };
  }
  return { kind: "add_activity", day: proposal.day, index: proposal.index, value: option };
}

/**
 * Turns the stay a human picked into the concrete add/replace edit: replace
 * the stay named by `expect` when the card pointed at one, else add it.
 */
export function resolveStayChoice(
  proposal: StayChoiceProposal,
  option: StayProposalValue
): StayEdit {
  return {
    kind: "add_stay",
    day: proposal.day,
    value: option,
    ...(proposal.expect ? { expect: proposal.expect } : {}),
  };
}

/** F12f: a stay suggestion with just enough to name it on a day. */
export interface StayProposalValue {
  name: string;
  location?: string;
  vibe?: string;
}

export type StayEdit = {
  kind: "add_stay";
  day: number;
  value: StayProposalValue;
  expect?: string;
};

/** The stay picker card's payload (F12f): 2-3 stays, one chosen. */
export interface StayChoiceProposal {
  kind: "stay_choices";
  day: number;
  expect?: string;
  options: StayProposalValue[];
}

export const DAY_GONE_MESSAGE =
  "This trip no longer has that day — reload the trip and ask again.";
export const ACTIVITY_GONE_MESSAGE =
  "That activity is gone or the day has fewer activities now — reload the trip and ask again.";
export const ITINERARY_CHANGED_MESSAGE =
  "The itinerary changed since this was suggested — ask waytowalk again.";
export const NO_OP_MOVE_MESSAGE = "That activity is already in that spot.";
export const STAY_GONE_MESSAGE =
  "That stay is no longer on the day — reload the trip and ask again.";

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

/** The stay label the panel groups by (`name`; legacy string entries as-is). */
export function stayLabelOf(stay: string | EditableStay | null | undefined): string {
  if (typeof stay === "string") return stay.trim();
  if (!stay) return "";
  return String(stay.name || "").trim();
}

const staysOf = (day: EditableDay): Array<string | EditableStay> =>
  Array.isArray(day.stay_recommendations) ? day.stay_recommendations : [];

/**
 * Returns a new days array with one activity moved, renamed or added. Throws a
 * user-facing message when the snapshot no longer matches the proposal.
 */
export function applyActivityEdit<D extends EditableDay>(
  days: D[],
  proposal: ActivityEdit
): D[] {
  if (proposal.kind === "add_activity") {
    const targetIndex = dayIndexFor(days, proposal.day);
    if (targetIndex === -1) throw new Error(DAY_GONE_MESSAGE);
    const value = proposal.value.trim();
    if (!value) throw new Error("The new activity title is empty.");
    const target = days[targetIndex];
    const existing = activitiesOf(target);
    // Two editors can pick the same idea from one card — mutual prefix match
    // is equality here, and it stops the activity appearing twice.
    if (
      existing.some(
        (activity) =>
          labelMatches(activityLabelOf(activity), value) &&
          labelMatches(value, activityLabelOf(activity))
      )
    ) {
      throw new Error(`“${value}” is already on Day ${proposal.day}.`);
    }
    // `index` is an insert position: 0..length (length appends).
    const at = proposal.index ?? existing.length;
    if (!Number.isInteger(at) || at < 0 || at > existing.length) {
      throw new Error(ACTIVITY_GONE_MESSAGE);
    }
    const activities = [...existing];
    activities.splice(at, 0, { title: value });
    const next = [...days];
    next[targetIndex] = { ...target, activities } as D;
    return next;
  }

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

/**
 * F12f: returns a new days array with one stay added to (or swapped on) a day.
 * Replacement keeps the old card's other details (price, description), so a
 * suggested hotel never wipes what an editor already curated. Throws a
 * user-facing message when the snapshot no longer matches.
 */
export function applyStayEdit<D extends EditableDay>(days: D[], proposal: StayEdit): D[] {
  const targetIndex = dayIndexFor(days, proposal.day);
  if (targetIndex === -1) throw new Error(DAY_GONE_MESSAGE);
  const name = proposal.value.name.trim();
  if (!name) throw new Error("The suggested stay needs a name.");
  const target = days[targetIndex];
  const existing = staysOf(target);
  const next = [...days];

  if (proposal.expect !== undefined) {
    const at = existing.findIndex((stay) => labelMatches(stayLabelOf(stay), proposal.expect));
    if (at === -1) throw new Error(STAY_GONE_MESSAGE);
    const old = existing[at];
    const base = typeof old === "string" ? {} : { ...old };
    const replacement: EditableStay = {
      ...base,
      name,
      ...(proposal.value.location ? { location: proposal.value.location } : {}),
      ...(proposal.value.vibe ? { vibe: proposal.value.vibe } : {}),
    };
    const stays = [...existing];
    stays[at] = replacement;
    next[targetIndex] = { ...target, stay_recommendations: stays } as D;
    return next;
  }

  // Two editors can pick the same stay from one card — mutual prefix match is
  // equality here, and it stops the hotel appearing twice on the day.
  if (
    existing.some(
      (stay) =>
        labelMatches(stayLabelOf(stay), name) && labelMatches(name, stayLabelOf(stay))
    )
  ) {
    throw new Error(`“${name}” is already on Day ${proposal.day}.`);
  }
  const entry: EditableStay = {
    name,
    ...(proposal.value.location ? { location: proposal.value.location } : {}),
    ...(proposal.value.vibe ? { vibe: proposal.value.vibe } : {}),
  };
  next[targetIndex] = { ...target, stay_recommendations: [...existing, entry] } as D;
  return next;
}
