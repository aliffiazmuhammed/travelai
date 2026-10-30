# M10 events — QA tickets

Opened from the live-browser walk-through of the events milestone (2026-10-30), covering the
traveller surfaces (`/explore`, `/explore/events/:id`, guest interest) and the agency surfaces
(`/agency/events`, create/edit dialog, roster, nav badge). All fourteen tickets were fixed and
re-verified in the browser on 2026-10-30; QA-14 is recorded as intentional instead of changed.

Severity: **S1** wrong data or a broken primary flow, **S2** confusing behaviour with a workaround,
**S3** polish.

| ID | Severity | Area | Summary |
| --- | --- | --- | --- |
| M10-QA-01 | S1 | Agency · event dialog | Cover preview never renders (double URL resolution) |
| M10-QA-02 | S1 | Backend · event update | Capacity can be lowered below confirmed headcount |
| M10-QA-03 | S1 | Public · event page | Finished events still advertise "N spots left" |
| M10-QA-04 | S2 | Backend · publish | A past event can be published with no warning |
| M10-QA-05 | S2 | Agency · library | Closed events cannot be unpublished without reopening |
| M10-QA-06 | S2 | Agency · library | Library is sorted furthest-first |
| M10-QA-07 | S2 | Agency · roster | Decided rows sort above pending rows |
| M10-QA-08 | S3 | Agency · library | "· 0 declined" noise on every row |
| M10-QA-09 | S3 | Agency · library | Roster button on drafts opens an always-empty roster |
| M10-QA-10 | S3 | Agency · library | Under-review rows still offer Unpublish and Close |
| M10-QA-11 | S3 | Agency · nav + library | Two different counts look the same |
| M10-QA-12 | S3 | Agency · library | Disabled Publish gives no reason |
| M10-QA-13 | S2 | Public · interest | Guest limit is 5 asks per IP per day |
| M10-QA-14 | S3 | Agency · nav | Events badge only refreshes on route change |

---

## M10-QA-01 — Cover preview never renders in the event dialog

**Severity:** S1 · **Area:** agency event create/edit dialog · **Status:** fixed 2026-10-30

**Fix:** the dialog hands `EventCover` the raw stored/uploaded asset URL instead of a URL it has
already resolved to `blob:`; resolution happens once, inside `EventCover`. Re-checked in the
browser for a saved cover and a fresh upload.

**Steps**
1. Sign in to an agency and open **Events → New event**.
2. Fill title and dates, then upload a JPEG/PNG/WebP under 2 MB.

**Actual:** the toast "Cover uploaded. Save to put it on the event." appears and a **Remove**
button shows, but the thumbnail stays the calendar placeholder. The same happens when editing an
event that already has a saved cover.

**Expected:** the uploaded/saved image previews immediately.

**Cause:** the page resolves the private asset URL into a `blob:` object URL
(`uploadedCoverUrl`/`savedCoverUrl`), then passes that into `EventCover`, which runs
`useAgencyAssetUrl` a second time; the second pass rejects `blob:` because only `/…` and
`http(s)` are treated as displayable.

- `frontend/src/pages/agency/AgencyEvents.tsx:192` (`EventCover` re-resolves its `url`)
- `frontend/src/pages/agency/AgencyEvents.tsx:1071` (dialog passes the already-resolved URL)
- `frontend/src/hooks/useAgencyAssetUrl.ts:14` (`isDisplayableExternalUrl`)

Data is unaffected: the asset row is created and `coverAssetId` is saved, and the library row and
public page show the cover.

**Acceptance:** after an upload, and when editing an event with a cover, the dialog shows the
image; removing it restores the placeholder; library rows and the public page still render.

---

## M10-QA-02 — Capacity can be lowered below the confirmed headcount

**Severity:** S1 · **Area:** backend event update · **Status:** fixed 2026-10-30

**Fix:** `updateAgencyEvent` counts confirmed travellers before applying a new capacity and returns
`409` with the count when the new cap is lower; the dialog pre-checks the same rule and toasts
instead of calling the API. Covered by a new `agencyEvents.test.ts` case.

**Steps**
1. Have an event with capacity 2 and 2 confirmed interests.
2. `PATCH /api/agency/:agencyId/events/:eventId` with `{ "capacity": 1 }`.

**Actual:** `200`; the event now has capacity 1 with 2 confirmed. The public page shows
"Every spot is taken" while two travellers hold spots.

**Expected:** the update is refused, or accepted only with an explicit over-capacity
acknowledgement.

**Cause:** `updateAgencyEvent` validates the shape of `capacity` (`capacityOf`) but never compares
it with the current confirmed count; only `decideEventInterest` is capacity-guarded.

- `backend/src/services/events/agencyEvents.ts:318`
- `backend/src/services/events/agencyEvents.ts:170`

**Acceptance:** lowering capacity below confirmed returns a clear 4xx (or is blocked in the UI with
the confirmed count shown); a test covers it.

---

## M10-QA-03 — Finished events still advertise "N spots left"

**Severity:** S1 · **Area:** public event page · **Status:** fixed 2026-10-30

**Fix:** the public summary projection returns `spotsLeft: null` once the event has ended (the
`capacity` it ran with is still published), so the page shows the Group size as "8 people" and no
spot count. The ended case in `projection.test.ts` now pins it.

**Steps**
1. Open a published event whose end date has passed (e.g. an event that ended two weeks ago).

**Actual:** the page shows the **Finished** state, "8 spots left" and "GROUP SIZE — 8 spots left",
next to copy saying the event has already happened and is not taking names.

**Expected:** an ended event shows no spot count (or "Ended") in both places.

**Cause:** `spotsLeftOf` ignores `ended`; the detail page prints `spotsLeft` unconditionally while
using `ended` only for the closing panel.

- `backend/src/services/events/projection.ts:187`

**Acceptance:** ended events report no spot count in the projection and the page hides the group-size
figure; live and closed-but-not-ended events are unchanged.

---

## M10-QA-04 — A past event can be published, silently

**Severity:** S2 · **Area:** backend publish · **Status:** fixed 2026-10-30

**Fix:** `publishAgencyEvent` refuses an event whose last day has passed (`eventHasEnded`, the
same UTC whole-day rule the public page uses) with a 409 telling the team to move the dates
forward. The row's Publish button mirrors it — disabled, with the reason in `title` and
`aria-describedby` — so the refusal is not a surprise click. Covered by a new
`agencyEvents.test.ts` case (past start + past end refused, running event still publishable).

**Steps**
1. Unpublish an event that ended in the past (`POST …/unpublish` → `200`, public detail `404`).
2. Publish it again (`POST …/publish`).

**Actual:** `200`; the public detail page is live with `ended: true`. No listing can surface it, so
it is a reachable-only-by-URL dead page.

**Expected:** publishing an event whose end date is before today is refused, or asks for an explicit
confirmation ("this event already ended").

**Cause:** `eventReadiness` checks title, summary, destination and date order only — never the
relationship between the dates and today.

- `backend/src/services/events/agencyEvents.ts` (`eventReadiness`, `publishAgencyEvent`)

**Acceptance:** publishing an ended event fails with an actionable message, or requires an explicit
override; a test covers a past start date and a past end date.

---

## M10-QA-05 — Closed events cannot be unpublished without reopening

**Severity:** S2 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** Unpublish is no longer wrapped in the "not closed" check, so a closed row takes its
page down directly and stays closed underneath. The status badge reads **Draft** once the page
is gone (instead of **Closed**), and the row offers Delete when nobody asked, matching the
service's draft-only delete rule.

**Steps**
1. Close a published event.
2. Try to take its public page down.

**Actual:** the row offers only **Roster** and **Reopen**. Unpublish is allowed by the API while
closed, but the UI forces **Reopen** first — which restores public interest and the ask form —
before **Unpublish** becomes available.

**Expected:** a closed event can be unpublished directly; closing and unpublishing stay separate
ideas, as the service intends.

- `frontend/src/pages/agency/AgencyEvents.tsx` (row action conditions)

**Acceptance:** a closed row exposes Unpublish; after unpublishing it becomes a draft that can be
deleted if it has no interests.

---

## M10-QA-06 — Library is sorted furthest-first

**Severity:** S2 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** the library sorts on the client: upcoming and running events soonest-first (drafts and
published alike), then everything already over, most recent first. The server order is left
alone because it also feeds other reads.

**Steps**
1. Open **Events** with events spread across past, today and future dates.

**Actual:** order is start date descending — a draft in December sits above today's event, and the
event that already happened sits last.

**Expected:** upcoming soonest-first, with past events clearly separated at the end.

**Cause:** `listAgencyEvents` sorts `{ startDate: -1, _id: -1 }`.

- `backend/src/services/events/agencyEvents.ts:656`

**Acceptance:** the library reads chronologically upward for upcoming events; finished events are
grouped after them.

---

## M10-QA-07 — Decided rows sort above pending rows

**Severity:** S2 · **Area:** agency roster · **Status:** fixed 2026-10-30

**Fix:** `listEventInterests` now sorts `{ decidedAt: 1, status: 1, createdAt: -1, _id: -1 }`
(a pending row has no `decidedAt`, so it leads), and the page applies the same pending-first
order after loading and after each decision so the list never reshuffles on reload. Pinned by
a new `agencyEvents.test.ts` case.

**Steps**
1. Open an event roster that has one confirmed and one pending interest.

**Actual:** the confirmed row appears first; the row that still needs a decision is at the bottom.

**Expected:** pending (actionable) first, then decided.

**Cause:** `listEventInterests` sorts `{ status: 1, createdAt: -1 }`, which orders
confirmed → declined → pending alphabetically.

- `backend/src/services/events/agencyEvents.ts:704`

**Acceptance:** pending rows lead the list; the status filter tabs keep their order.

---

## M10-QA-08 — "· 0 declined" noise on every row

**Severity:** S3 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** the declined count is rendered only when it is above zero; the "N waiting" chip keeps
the actionable number.

**Steps:** open the library with any live event.

**Actual:** each row reads e.g. "2 confirmed · 0 of 2 spots left · 0 declined".

**Expected:** show counts only when they carry meaning; the existing "1 waiting" chip already covers
the actionable number.

- `frontend/src/pages/agency/AgencyEvents.tsx` (`capacityLine` / row meta)

**Acceptance:** a zero declined count is not rendered.

---

## M10-QA-09 — Roster button on drafts opens an always-empty roster

**Severity:** S3 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** Roster only appears once the row can have one — a draft with no interests hides the
button, and a draft that kept interests from an earlier run still opens them.

**Steps:** open the library with a draft event and press **Roster**.

**Actual:** the roster dialog opens and is permanently empty — a draft has no public page, so nobody
can raise interest.

**Expected:** no roster action on drafts (or a disabled control with a reason).

**Acceptance:** draft rows do not offer Roster; live/closed rows do.

---

## M10-QA-10 — Under-review rows still offer Unpublish and Close

**Severity:** S3 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** a moderation-hidden row now exposes only Roster and Edit. Unpublish, Close, Reopen and
Delete are all withheld, and the row carries the under-review note instead of a recovery path the
service does not support.

**Steps:** open the library for an event hidden by moderation.

**Actual:** **Publish** is correctly blocked, but **Unpublish** and **Close** remain enabled on the
taken-down row.

**Expected:** a row under review exposes only recovery actions (roster/contact support), or the
state-changing actions are disabled with a reason.

**Acceptance:** moderation-hidden rows cannot be closed from the library.

---

## M10-QA-11 — Two different counts look the same

**Severity:** S3 · **Area:** agency nav + library · **Status:** fixed 2026-10-30

**Fix:** the two counts now say what they mean out loud — the nav link announces "1 traveller is
waiting for a spot" (singular or plural) and the Roster control announces "Roster for <event>, 2
people on the list", with matching `title` tooltips on both chips.

**Steps:** have one pending and one confirmed interest on the same event.

**Actual:** the row shows Roster with a chip of `2` (all interests) while the **Events** nav badge
shows `1` (pending only). Same visual language, different meaning.

**Expected:** the row chip and the nav chip are distinguishable (label, icon or tooltip).

**Acceptance:** a reader can tell a roster-size count from a needs-attention count without hovering
code.

---

## M10-QA-12 — Disabled Publish gives no reason

**Severity:** S3 · **Area:** agency event library · **Status:** fixed 2026-10-30

**Fix:** a blocked Publish now carries the reason in its `title` and points
`aria-describedby` at a screen-reader-only line, so hover, focus and assistive tech all hear the
same message the "Before publishing:" note gives.

**Steps:** open a draft missing a summary and press **Publish**.

**Actual:** the button is disabled and nothing happens. The reason exists in the "Before publishing:"
line above, but the control itself gives no feedback on hover or focus.

**Expected:** the disabled control names the missing fields via `title`/`aria-describedby`.

**Acceptance:** hovering or focusing the disabled Publish surfaces the readiness message.

---

## M10-QA-13 — Guest limit is 5 asks per IP per day

**Severity:** S2 · **Area:** public interest · **Status:** fixed 2026-10-30

**Fix:** the four limits are env-tunable (`EVENT_INTEREST_IP_DAILY_LIMIT` 12,
`EVENT_INTEREST_EVENT_IP_DAILY_LIMIT` 4, `EVENT_INTEREST_EMAIL_DAILY_LIMIT` 3,
`EVENT_INTEREST_EVENT_DAILY_LIMIT` 50). The network ceiling is sized for a shared connection and a
new network-per-event bucket stops one listing from flooding, with different copy for each. Every
429 states the 24-hour window. Pinned by `eventInterestRateLimit.test.ts`.

**Steps:** submit interest forms five times from one connection, then a sixth on any event.

**Actual:** the sixth attempt replaces the form with "You have sent the maximum number of event
requests for today." A household, office, school or carrier-NAT connection shares this bucket across
all events.

**Expected:** a limit high enough for shared connections, or keyed per event in addition to IP;
the message should say when it resets.

**Cause:** `EVENT_INTEREST_IP_DAILY_LIMIT` was hard-coded at 5 on a 24-hour window.

- `backend/src/middleware/rateLimiter.middleware.ts`

**Acceptance:** an operator can raise the limit without a code change; the 429 copy states the reset
window; a test covers the boundary.

---

## M10-QA-14 — Events badge only refreshes on route change

**Severity:** S3 · **Area:** agency navigation · **Status:** documented 2026-10-30

**Resolution:** intentional, not a bug. The Events badge reads the same route-change refresh as the
rest of the agency shell and no events stream is promised, so the behaviour is recorded here
instead of changed. If it ever needs to be live, the enquiry SSE bus is the obvious model.

**Steps:** with another browser/API session, add an interest while sitting on one agency page.

**Actual:** the badge does not change until the user navigates to another agency route; there is no
polling or SSE for events.

**Expected:** acceptable for now, but worth stating; if it must be live, reuse the enquiry SSE bus.

**Acceptance:** either documented as intentional or updated within the live-update tier.

---

## Covered and working

Listing eligibility, cursor pagination and ordering; closed/finished pages surviving while
moderation-hidden rows 404; cover bytes behind the guard; duplicate email (case-insensitive),
closed, finished and full interest rules (409 with distinct copy); declined rows allow re-asking;
edit-while-closed refused (409); readiness-gated publish; draft-only delete; close ≠ unpublish;
capacity guard on confirm; spot count updating publicly after a confirm; end-to-end create → publish
→ public page + Explore strip; empty state hides the strip.

Stored HTML (`<img onerror>`, `<svg onload>`, `<script>`) renders as literal text on Explore, the
event page and the roster — no execution. Interest POST without `X-CSRF-Token` returns 403.

Not verified: mobile layout (the in-app browser cannot be resized); no horizontal overflow at desktop
width.