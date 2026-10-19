# Milestone 7 — Conversation: chat, typing, unread, (next: the TravelAI bot)

**Status:** in progress. **F8a (typing + read state) and F8b (drawer + typing + unread) SHIPPED.**

**Scope:** evolve the trip comment stream into the trip's conversation layer — a floating drawer above any tab, typing indicators, unread badges — and, on that substrate, TravelAI as a first-class participant proposing itinerary edits that a rank-gated human applies (§8).

**Design decision (locked):** NO separate AI tab. The bot will be a **mention-gated participant in the one shared stream** (`@TravelAI …`): it sees the group's discussion for grounding, cost is bounded by invocation, and its writes are never autonomous — they land as typed **proposal cards** an editor applies through the existing rev-safe endpoints (§8).

---

## 1. Substrate rules carried over from Milestone 6

1. One authorization choke point (`requireTripRole`) on every trip-scoped route.
2. Discussion writes never touch the `Trip` document — no `rev` bumps, no `trip:updated` frames, no spurious 409s.
3. Live delivery rides the E4 SSE bus (`presence.ts`), one EventSource per open trip.
4. Ranks: read = `viewer`, post = `commenter`, authorship (not rank) governs edit/delete.
5. XSS-safety by construction: plain text only as far as humans type; structured payloads are server-shaped, client-rendered with text nodes + typed primitives.

## 2. F8 — Chat v1 spec

### 2.1 Backend (F8a)

| Piece | Decision |
|---|---|
| Typing | **Stateless.** `POST /:id/events/typing` (`viewer` + `typingPingLimiter` 400/15min user-keyed) fans out `{type:'typing', tripId, userId, label}` on the bus. No map, no TTL sweep — every client shows the indicator ~5s after the last frame and expires it itself. A dropped ping costs nothing; a stuck tab is bounded by the limiter. |
| Read state | `TripReadState` collection — one `{tripId, userId, lastReadAt}` row, unique index, upsert-only. **Never on the Trip document** (reads must not bump `rev`). Unread = indexed count over `{ tripId, deletedAt: null, userId: ≠me, createdAt: > marker }`. |
| First-visit baseline | A member with no marker stamps one at now and sees unread 0 — history is not retroactive unread. |
| Routes | `GET /:id/comments/read-state` (marker + count), `POST /:id/comments/read` (mark now), `POST /:id/events/typing`. All `viewer`-ranked; read-state lives under `/comments` without colliding with `PATCH/DELETE /:id/comments/:commentId` (different methods). |
| Mark-read race | Marker is `$set` with `createdAt: > marker` strict-greater in the unread predicate, so same-millisecond comments are not swallowed. Losers of the first-open upsert race hit the unique index and update harmlessly. |

### 2.2 Frontend (F8b)

| Piece | Decision |
|---|---|
| Drawer | `DiscussionDrawer` — fixed FAB bottom-right (offset above the mobile tab bar) with an unread badge ("9+" capped); opens a `Sheet` from the right (`w-full sm:max-w-[440px]`), hosting the SAME `CommentsTab` surface as the tab. The FAB hides while the Discuss tab is active (Tabs is controlled now). |
| Unread (client) | Seeded once per trip open from `GET read-state`; then only from **unknown** `comment:new` frames while the drawer is closed (own known rows never count — frames' `isYou` is untrusted, dedupe by `_id` handles it). Opening the drawer flushes `POST /comments/read` and zeroes the badge. Known limit: your own comment posted from another device can tick the badge on this one (server-truth re-syncs at next load). |
| Typing (client) | Composer keystrokes → throttled ≤1 ping / 2.5s → `POST /events/typing` (decoration; errors swallowed). Incoming frames → "Kiran is typing…" line above the composer, auto-expires 5s after the last frame per author; own frames filtered by `currentUserId`. |

## 3. Honest limits (F8)

- Typing and read markers are single-instance-era: behind multiple instances typing degrades gracefully (it is decoration anyway), but unread counts stay CORRECT across instances because they are DB-derived, not in-memory.
- Unread is per-drawer-open flushed; a tab open on the Discuss view also flushes — the FAB may not tick down in real time while you sit in the drawer; the next seed/load corrects it.
- No offline queue, no push, no notifications center - those belong to F10.

## 4, 5, 7. (reserved) — F10 notifications, F11 proposals, F12 the bot.

## 8. The TravelAI participant (planned, NOT started)

- Identity: bot author rows in the unified message shape (`kind: 'bot'`), labelled "TravelAI". (Full plan in the brainstorm below — F12 stages.)
- Invocation: mention-gated only (`@TravelAI` or an "Ask TravelAI" chip seeding the mention, day-anchored to the context you're viewing).
- Output: text + a typed `proposal` payload rendered as a diff card. **Proposals are never applied by the bot.** An editor taps Apply → the same update endpoints an editor uses with `baseRev` → versions snapshot history.
- Pipeline stages: F12a answer-only (budget/logistics Q&A grounded in the trip doc) → F12b proposal cards → F12c chat-native extras ("summarize what we decided", debate→poll, translate).
- Cost guards: per-user daily invocation cap (env), Gemini flash with a cached trip summary, mention-gating as the primary brake.

---

## 9. Appendix — F8a (typing + read state) SHIPPED

> 2026-10-19, one commit. 199/199 backend tests (5 new: `discussion.test.ts` + 3 router spots), live smoke `smoke-f8.mts` — 16 checks — **ALL PASS** (incl. the live typing frame with `ENABLE_TRIP_SSE=true`).

| Piece | Notes |
|---|---|
| `models/TripReadState.ts` | unique `{tripId, userId}`; row upsert-only; doc-comment explains the "reads never bump rev" rule. |
| `services/collab/discussion.ts` | pure `computeUnreadFilter` (strict-greater marker, not-mine, active-only) + `resolveReadState` (baseline on first open) + `markTripRead`. |
| Routes | `GET /:id/comments/read-state`, `POST /:id/comments/read`, `POST /:id/events/typing` — all `requireTripRole('viewer')`; typing carries `typingPingLimiter`. |
| Bus | `emitTypingFrame` + `{type:'typing'}` union member — stateless, documented in `presence.ts`. |
| Tests | `discussion.test.ts` (marker semantics, no-marker semantics, ms precision, strictness on junk ids) + rank spots in `routerCoverage.test.ts`. |
| Smoke | non-member 404s, baseline-0, growth excl. own/tombstones, mark-read reset, live typing frame, cheap 204 pings. |

## 10. Appendix — F8b (drawer + typing + unread) SHIPPED

> 2026-10-19, one commit on top of F8a. `npm run typecheck` (real `-p tsconfig.app.json`) + `npm run build` pass; committed with the `backend/public` SPA mirror refreshed (new `ItineraryDisplay-BWvPzL-H.js`).

| Piece | Notes |
|---|---|
| `useTripEvents` | New `TypingFrame` + `onTypingEvent` (ref-mirrored, like `onCommentEvent`, so the stream never resubscribes). |
| `useTripComments(tripId, currentUserId?)` | New state: `unread`, `typing`; new API: `setOpen`, `notifyTyping`, `ingestTyping`, derived `typingLabels`. Badge rules exactly as §2.2 — server-seeded once per trip open, frame-bumped only for unknown foreign rows while closed, flush-on-open via `POST /comments/read`. Own-row filter is the `mineRef` set from the client's own POST responses (the projection carries no `userId` — the other-device-own-ticks limit is documented in the code). Typing: ≤3 entries, one per author, `keep-alive`-free 5s prune interval that runs only while entries exist; own echo filtered by `userId`. Day-chip counts nudge on live new/tombstone frames too (untouched on edit frames). |
| `CommentsTab` | New optional `typingLabels` / `onTyping` — composer AND edit-box keystrokes ping; animated indicator line above the composer ("Kiran is typing…" / "Kiran, Asha and 1 more are typing…"). |
| `DiscussionDrawer` (new) | Fixed FAB bottom-right (`bottom-20` on mobile to clear the tab bar, `sm:bottom-6`), capped unread badge "9+", `Sheet side="right"` (`w-full sm:max-w-[440px]`) hosting the same `CommentsTab`. FAB hides while the Discuss tab is active (`hidden` prop) or on surfaces without a role. |
| `ItineraryDisplay` | `Tabs` is now **controlled** (`activeTab` + single `handleTabChange`), so moving into/out of Discuss is a surface open/close (badge flush follows the tab as well as the drawer); unread badge renders on the tab trigger too; drawer mounts beside the tabs for any real trip with a role. |

**One stream, two sensors:** the drawer and the tab are the same logic core, not two chat systems — exactly one message state, one EventSource, one read marker, and one typing roster.

## 11.1 — The drawer became a real group chat (user-reported UX fix)

The first drawer pass rendered the Discuss tab's *feed* shape inside a panel — nested Card, a duplicate "TRIP DISCUSSION" header, composer floating above the messages, dead space below. It read as a form, not a chat. Fixed by giving `CommentsTab` a `variant`:

| | `variant="feed"` (Discuss tab) | `variant="chat"` (drawer) |
|---|---|---|
| Order | Newest-first (❍ oldest at bottom via "Load earlier") | **Creation order — newest message at the BOTTOM**, "Load earlier" at the top |
| Container | Card + header + count badge + day filter chips | No inner card; slim drawer header carries the title and the **live SSE roster as a mini avatar stack** |
| Composer | Inline in the card | **Pinned to the drawer's floor** — bordered pill, borderless textarea, day-anchor chips inside; typing line just above |
| Scroll | Page scroll | Auto-scroll holds the tail on open/arrival; scrolling up releases the pin (near-bottom < 90px) so reading history is never yanked down |
| Empty state | "No comments yet — start the conversation above." | "No messages yet — say hi 👋" |

Still one state, one EventSource, one read marker — the shared fragments (typing line, composer, stream, decisions strip) render in both shapes; the Sheet unmounts on close so every open restarts scrolled to the newest message.

## 11. Appendix — F9 (decisions) SHIPPED

> 2026-10-19, two commits (`3e7cf6d` backend, `e3ab3cb` frontend). 209/209 backend tests (10 new pure-rule tests + 3 rank spots), live smoke `smoke-f9.mts` — 20 checks **ALL PASS** with SSE on. Frontend: real typecheck + build pass; SPA mirror refreshed (`ItineraryDisplay-Dubn_ngW.js`).

**The F9 idea:** the discussion is where groups *settle* things, but an "ok let's do that" is just another paragraph that scrolls away. A **decision** is a comment promoted into a durable, pinned card — the record of what was agreed, visible in both chat surfaces.

| Rule | Decision |
|---|---|
| Snapshot semantics | `TripDecision` copies the body + author link at promotion time. The thread keeps moving (edits, retractions); the record freezes what was agreed WHEN it was agreed. The card deliberately **survives the comment's tombstone** (history outlives the conversation — smoke-verified). |
| One per comment | Partial unique index on `commentId` (active only). Duplicate promote → kind 409; tombstones don't collide, so unmark → re-promote later works. |
| Authorship, not rank | Comment **author or owner** promotes (a demoted ex-editor still binds their own words; an owner may log the group's decision from anyone's remark); **promoter or owner** unmarks. Route floor `viewer` on all three — service asserts the real rules, mirroring comment edit/delete. |
| Rev-free | Never on the `Trip` document — promote/unmark cannot 409 an open edit. `decision:new`/`decision:update` frames are pure broadcasts. |
| UI | Pinned "Decisions" strip above the day chips in BOTH surfaces (tab + drawer); rows gain Decide/Decided state driven by `decidedCommentIds`; unmark is optimistic with rollback; "pinned by X" attribution on other people's promotions. No unread interplay — a promotion is bookkeeping, not a remark. |

Backend error alphabet: 403 non-author promote, 409 duplicate / no-content / removed-comment promote, 404 missing-scoped rows and already-tombstoned decisions. `DECISION_MAX_PER_TRIP=50` env caps the strip.
