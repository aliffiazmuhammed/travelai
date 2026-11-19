# UI baseline — Phase 3

**Recorded:** 2026-11-18
**Scope:** Phase 3 (C-03 generation cancel/abort lifecycle, C-04 map and
schedule truth).
**Status:** Source-level verification passes, and the live
generate → cancel → leave → return → retry flow passed on 2026-11-18. Two
secondary checks remain; see **Open checks**.

This file is the evidence record for the Phase 3 exit gate in
`docs/ui-review/implementation-plan.md`. Re-run the commands before changing the
generation stream, the attempt key or the map/timeline projections.

## Decision applied

| ID | Decision | Consequence |
|---|---|---|
| D-C | "Stop generating" is a **real server-side cancel** | The provider stream is aborted, nothing is saved, and the overlay copy says exactly that. A per-attempt idempotency key makes cancel-then-retry produce one trip. |

The copy deliberately says the cancellation happens "on our servers" and
"nothing is saved". It does not claim the AI provider stopped: Gemini's abort
signal ends delivery, but the provider may still finish and bill a request it
already accepted.

## Evidence

### C-03 — server-side cancel

`backend/src/services/ai/generationGuard.ts` is the one place that decides what a
cancel means:

| Helper | Contract |
|---|---|
| `isAbortError(error)` | Recognises our sentinel, DOM `AbortError` and groq's `APIUserAbortError`/`ABORT_ERR`; genuine failures stay failures |
| `throwIfAborted(signal)` | Throws before the provider call, between stream chunks, and before caching |
| `shouldPersistGeneration({ aborted, clientGone })` | Returns true only for a live, connected request — the single save rule |

The signal is threaded through `generateStreamWithFallback` into
`GeminiService.generateContentStream` and `GroqService.generateContentStream`
(Groq passes it as the SDK `RequestOptions.signal`). Once aborted, the primary
never starts its fallback model and a completed response is not cached.

In `generateItineraryStream`:

- `x-generation-attempt` is optional and must match `^[A-Za-z0-9_-]{8,100}$`.
- `res.once('close')` aborts only when `res.writableEnded` is false; a normal
  `res.end()` also fires `close`, so the guard is required.
- Every `sendEvent` returns false instead of writing to a dead response.
- A trip written after the abort/disconnect is deleted immediately, so the
  "nothing is saved" promise holds even in the race.
- Retry with a used attempt key replays the saved trip; an E11000 save race does
  the same instead of returning 500.
- Cancellation ends the response silently — no `error` event.

Storage: `Trip.generationAttemptId` plus the partial unique index
`{ userId: 1, generationAttemptId: 1 }` with
`partialFilterExpression: { generationAttemptId: { $type: 'string' } }`, so
legacy rows are outside the constraint. Lookups live in
`services/itinerary/generationAttempts.ts`; the controller keeps zero
`Trip.findOne` calls, preserving the `routerCoverage` choke-point invariant.

### C-03 — client lifecycle

`generateItineraryStream(input, callbacks, { signal, attemptId })`:

- sends the attempt key, passes `signal` to `fetch` and checks it between
  reads;
- cancels the body reader on abort and swallows `AbortError` (no error toast on
  a deliberate cancel);
- reports a stream that ends without `complete`/`error` as "Nothing was saved".

`TripPlanner` holds the identity of the live attempt:
`abortControllerRef`, `attemptIdRef`, `cancelledRef`, `submittingRef`,
`mountedRef`, `navigateTimerRef`. Every callback is gated on
`isCurrentAttempt()`, so a stale stream cannot set progress, navigate or clear
loading. The attempt key is reused after a cancel/error and cleared only after
`complete`; reset clears it. Unmount aborts and clears the post-complete
navigation timer, so Back between "ready" and the hand-off does not navigate.

`GenerationOverlay` shows an X and "Stop generating" while streaming, with copy
that stopping cancels the request on our servers and saves nothing. The error
state offers "Back to the wizard" / "Retry generation" and states that no trip
was created. The 100% state has no close control.

### C-04 — map and schedule truth

`frontend/src/lib/itineraryTruth.ts` is a pure projection over stored data:

| Export | Behaviour |
|---|---|
| `hasCoordinates(value)` | Valid `[lat, lng]`, range-checked, null island rejected |
| `activityTime(activity)` | The stored non-blank time, or `null` |
| `activityTimeLabel(activity, i)` | The stored time verbatim, otherwise `Stop N` |
| `buildTripMapModel(days)` | `{ pins, unmapped }` from valid coordinates only |

`TripMap` plots `pins` (real coordinates) and renders everything else in a
"Location not mapped" list under the map, filtered by the selected day. There
are no radial offsets, no base-coordinate fallback, and no synthesized stay.
`DayTimeline` and `pdfExport` render a stored time or `Stop N`; the
Morning/Afternoon/Sunset/Night table and its icons were removed.

### Tests

| Command | Result |
|---|---|
| `npx tsx --test src/services/ai/generationGuard.test.ts` (backend) | **5 pass** |
| `npx tsx --test src/lib/itineraryTruth.test.ts` (frontend) | **7 pass** |
| `npx tsx --test src/services/collab/routerCoverage.test.ts` (backend) | pass — zero trip lookups in controllers still holds |

`generationGuard.test.ts` pins abort recognition (including the negative cases),
the pre-work throw, and all four save-decision combinations.

`itineraryTruth.test.ts` includes the Phase 3 fixture: a trip with **no
coordinates and no times** produces zero pins, three unmapped entries and
`Stop 1`/`Stop 2` labels. Further cases:

| Test | Asserts |
|---|---|
| only stored, in-range coordinates become pins | Out-of-range latitude, `[0,0]` and missing pairs are unmapped; valid pairs keep their exact tuple |
| a stay without coordinates is never given a synthesized location | The stay is listed with its stated location, not plotted |
| reordering activities cannot change the time each one carries | Stored times travel with their activity; only the `Stop N` fallback follows position |
| blank or whitespace-only times fall back to the stop order | No empty time claim |
| activity and stay strings are surfaced instead of silently dropped | Legacy string entries appear in the unmapped list |

### Exit gate mapping

| Gate | Evidence |
|---|---|
| Leave the overlay any time without creating a trip | Cancel aborts; save is gated; a post-abort save is deleted. **Live:** cancelled at 15%, trips stayed at 0 |
| Back, then re-entering, does not auto-navigate | Unmount clears the navigation timer; `mountedRef` gate. **Live:** Back landed on `/plan` and stayed there 4 s later |
| Cancel + retry creates exactly one trip | Attempt key reuse + partial unique index + replay path. **Live:** both requests carried `d6f8d7f4-…`; the dashboard held exactly 1 trip |
| Every pin traces to stored coordinates | `buildTripMapModel` emits pins only for `hasCoordinates` |
| Reordering cannot change a displayed time | `activityTimeLabel` reads the activity's own time |
| No coordinates/times renders no false claims | Fixture test above; unmapped list instead of pins |

## Commands run

| Command | Result |
|---|---|
| `npm run verify` | **pass** — 1123/1123 backend tests, backend build, contrast, frontend typecheck, key-backup/auth-policy/itinerary-truth tests, frontend build |
| `npm test --workspace=backend` | **1123 pass, 0 fail** (~2.5 min) |
| `npm run build --workspace=backend` | pass |
| `npm run ui:contrast` | pass — all declared text pairs in traveller/agency light+dark and admin dark |
| `npm run typecheck --workspace=frontend` | pass |
| `npm run test:key-backup --workspace=frontend` | 19 pass |
| `npm run test:auth-policy --workspace=frontend` | 6 pass |
| `npm run test:itinerary-truth --workspace=frontend` | **7 pass** |
| `npm run build --workspace=frontend` | pass; `TripPlanner` chunk 94.0 kB (27.5 kB gzip) |

The backend total moved from 1118 to 1123 because `generationGuard.test.ts` adds
five cases to the test script. The router-coverage invariant is part of that
total, so the moved generations lookups are covered by the same run.

## Cross-origin note

The dev app calls the API cross-origin, so the new `x-generation-attempt`
header is preflighted. `backend/src/index.ts` configures `cors` without an
`allowedHeaders` list, which makes the middleware reflect
`Access-Control-Request-Headers`; the header passes without a change. Adding an
explicit allow-list later must include it.

## Live check (2026-11-18)

Run against the Vite dev server on `:8080` proxying to the backend on `:5000`,
with the real Gemini generation path enabled. A throwaway account
(`phase3.check.*@example.com`) was created through the sign-up form and the
wizard was completed with the Goa preset, 5 days, a couple, ₹15,000 pp.

| Check | Result |
|---|---|
| Fresh dashboard | 0 trips |
| Generate → "Stop generating" at 15% | Overlay closed, no alert, URL stayed `/plan` |
| Cancelled request on the wire | `net::ERR_ABORTED` after 5.4 s; backend logged "Streaming generation cancelled by the client." |
| Trips after cancel | still 0 |
| Retry from the same wizard instance | Request carried the **same** `x-generation-attempt` (`d6f8d7f4-e426-4e0a-95fe-92dbfe9d846a`) |
| Generation completed | 5 days, 15 activities, 5 stays; navigated to `/dashboard` |
| Trips after retry | exactly **1**, titled "Goa Getaway for Two: Culture, Cuisine & Coastal Charm" |
| Stored attempt id | `GET /api/itinerary/:id` returns the same `generationAttemptId` |
| Back from the dashboard | Lands on `/plan` with the overlay closed; still `/plan` 4 s later |

The generated itinerary happened to carry 15/15 activity coordinates and 15/15
stored times, so the unmapped path was not exercised by this data; the fixture
test is what covers it.

The throwaway account and its one trip are still in the dev database for visual
inspection. Remove them if the data gets in the way.

## Open checks

These need a controlled failure or a different dataset, not more source reading.

1. **Lost-delivery replay** — let generation reach 100% but drop the connection
   before the `complete` event, then retry: the saved trip is replayed rather
   than duplicated.
2. **Unmapped state in situ** — open a real generated trip whose days lack
   coordinates; confirm no pin sits at an invented offset and the list matches
   the day filter.
3. **Focus and keyboard** — the overlay still has no focus trap; C-15 owns it.
