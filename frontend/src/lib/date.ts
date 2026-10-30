/**
 * One date vocabulary for the whole app.
 *
 * Before this lived here, four conventions coexisted (an ad-hoc helper per
 * page, date-fns patterns in the wizard, `toLocaleDateString()` defaults and
 * `toLocaleString()` in admin rows), so the same timestamp could read
 * "10/26/2026", "Oct 26, 2026" and "26 Oct 2026" on neighbouring screens.
 */
type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
/**
 * Calendar days are stored as UTC midnight or UTC end-of-day. Formatting them
 * in the visitor's timezone would move a quote's "valid until" to the next day
 * east of Greenwich, and the PDF (rendered in UTC) would disagree with the
 * screen. This formatter always reads the stored calendar day.
 */
const dateOnlyFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const shortFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "26 Oct 2026" — trip cards, members, versions, expiry dates. */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "";
}

/** Same shape, but read in UTC: use it for date-only values (quote validity). */
export function formatDateOnly(value: DateInput): string {
  const date = toDate(value);
  return date ? dateOnlyFormatter.format(date) : "";
}

/** "26 Oct" — wizard summaries where the year is already known. */
export function formatDateShort(value: DateInput): string {
  const date = toDate(value);
  return date ? shortFormatter.format(date) : "";
}

/** "Mon, 26 Oct 2026" — date pickers, where the weekday helps orientation. */
export function formatDateWithWeekday(value: DateInput): string {
  const date = toDate(value);
  return date ? weekdayFormatter.format(date) : "";
}

/** "26 Oct 2026, 4:55 pm" — admin console rows. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "";
}

/**
 * Chat-style timestamp (WhatsApp convention): clock time for today,
 * "Yesterday" for the day before, else a short date. One implementation for
 * the conversation, the decisions strip, the poll cards and the version list,
 * so every surface reads like the same chat.
 */
export function formatRelative(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${time}`;
}
