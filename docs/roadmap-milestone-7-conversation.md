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

> **F12a backend SHIPPED (2026-10-19).** The F10 constraint rewrites the pipeline — the server cannot read chat bodies, so all chat grounding is CLIENT-FED (user-confirmed: replies come back via the asker's browser, encrypted with the trip conversation key and posted as `bot: true` rows; grounding = the question + the last 8 decrypted messages, disclosed in the composer). `POST /:id/chat/assistant` (viewer floor, `assistantAskLimiter` 5/min user-keyed burst) takes `prompt` (≤500 chars, must literally contain the `@TravelAI` mention — enforced server-side as the primary brake) + `context` (≤8 lines `{label ≤32, text ≤500}`, wire budget ≤6000 chars). The server adds the trip document (title/days/budget/season/day titles — server-owned by design) and calls `generateWithFallback` (Gemini 2.5-flash → GROQ fallback → prompt-hash cache). The clamped (≤800 chars) answer returns ONLY to the asker's browser, which encrypts it with the trip conversation key and posts it through the normal comments endpoint — stored and broadcast as ciphertext like every other row. `BOT_DAILY_LIMIT` (default 20, env-tunable) is a per user × trip × day bucket, consumed AFTER shape validation (rejected asks are free), in-process (restart resets — honest cost brake, unit-covered incl. day rollover). The assistant route never touches `Trip.rev`. `TripComment.bot` is cosmetic (persona rendering); spoofable-but-harmless by design. 239/239 backend tests (16 new in `assistant.test.ts`), live smoke `smoke-f12a.mts` — 16 checks ALL PASS with `BOT_DAILY_LIMIT=1` (two real provider calls; the 429 budget; the encrypted bot row round-trip). Frontend shipped in the follow-up commit. **F12b proposal cards SHIPPED (same day, two commits).** The assistant answer is now a strict JSON envelope `{text, proposal}` — `proposal` is ONE typed change from `assistantProposalSchema` (zod discriminated union: `title` / `budget` / `day_title` / `day_tip`, all bounded to fields the client can patch non-destructively; structural reshuffles stay future work). Every model-drift failure degrades to a plain text bubble, never a 5xx: prose stays prose (F12a replies remain valid), a malformed proposal drops while its text survives, empty text + valid proposal gets a template line, and a day-anchored proposal is dropped server-side when it points past the itinerary the server owns (`proposalFitsTrip`). Serialized-size backstop: reply ≤800 + proposal ≤800 JSON must fit ONE encrypted comment. The CLIENT still owns the wire: it wraps proposal answers as `{v:1, text, proposal}` inside the encrypted bubble (all members decrypt the same bytes → same card), and Apply composes the change into the open ItineraryData snapshot — unsaved local day edits ride along exactly like `persistGranular` — and saves through the normal `PUT /:id` path (editor floor, required `baseRev`, snapshotted). The bot never writes the trip. Cards render inside the violet bot bubble (`Proposed change` → `Day N — title` → `→ value`) with `Apply change` / `Not now`; applied/dismissed is honest **per-visit local state** (the row is immutable ciphertext). Viewers see the suggestion without controls. Frontend commits: typecheck + build pass, SPA mirror refreshed; smoke-f12a extended to 20 checks ALL PASS with `BOT_DAILY_LIMIT=2` (live typed proposal returned; the daily-429 wording asserted so the quota gate is distinguishable from the burst limiter, which counts rejected asks — walls in the smoke run under the second member to keep the asker's burst window free). **F12a frontend (same day):** the composer routes on the mention — `/@travelai/i` in the draft flips it into ask mode: a violet disclosure chip states exactly what leaves the group's envelope ("sends this message plus N recent chat messages (decrypted) to the AI provider" — N is live-computed over the last 8 readable rows, undecryptable ones skipped honestly), a "TravelAI is thinking…" line runs during the round-trip. On send the question encrypts and posts normally FIRST (so a failed ask never loses the message), then `api.askTravelAI(tripId, {prompt, context})` ships the ask + last-8 grounding (built pre-question via the crypto layer, most recent first as the server contract expects), and the clamped answer re-encrypts through `encryptOutgoing` and posts as a `bot: true` row — optimistic preview labeled TravelAI, no persona flash. `CommentRow` renders bot rows as the TravelAI participant for EVERYONE (violet bubble, Bot avatar, "AI" badge, incoming side — even for the asker who technically posted it); edit stays hidden (the asker cannot rewrite the bot's words), decide still works so bot advice can be promoted to a decision card. Works identically in the chat dock and the feed composer via the shared fragments. Bundle `ItineraryDisplay-BG2Vb30p.js`.

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

## 12. Appendix — F10 (end-to-end chat encryption) — backend SHIPPED

> 2026-10-19, backend increment. 223/223 backend tests (12 new in `chatKeys.test.ts`), live smoke `smoke-f10.mts` — 31 checks **ALL PASS** (real Node-WebCrypto client simulation: ECDH P-256 → HKDF-SHA-256 → AES-256-GCM). Frontend (key bootstrap UI, envelope flow, decrypt-on-render, backup codes) is the next commit.

**The F10 idea, confirmed with the user:** the only thing the server can never see is the *message text*. Day anchors, timestamps, read state and authorship stay server-visible (the WhatsApp/Signal metadata trade-off — day chips, unread badges and typing keep working). What IS hidden: bodies only.

### 12.1 Crypto architecture (the browser owns every secret)

| Piece | Where it lives | Who can read it |
|---|---|---|
| Identity keypair | ECDH P-256, minted in the browser; private half in `localStorage` (portable via a backup code), public half published to `PUT /api/auth/chat-key` | The private half: one browser only |
| Conversation key | AES-256-GCM, generated **client-side** per trip (epoch); NEVER sent to the server | Every member, via envelopes |
| Envelope | The conversation key wrapped pairwise for one member: ECDH → HKDF(info=`travelai-chat-key-v1`) → AES-GCM; wire format = ONE base64 blob of `iv ‖ ciphertext` (12-byte nonce prefix) | Exactly that member |
| Message body | AES-GCM(`iv, plaintext`), wire format `"<b64 iv>.<b64 ct>"` under a `e2ee: true` flag | Every current member |

### 12.2 Server model + routes (all blind-carrier by construction)

- `TripChatKey { tripId, epoch, envelopes: Map<userId, base64>, createdBy }` — unique `(tripId, epoch)`; the **current epoch is the highest document that exists**. Writes never touch `Trip.rev` (same rule as comments/read-state).
- `User.chatPubKey` — the published SPKI half.
- Routes (trip guard choke point; `viewer` floor like the live tier; covered by `routerCoverage.test.ts`):
  - `GET /:id/chat/keys` — current epoch + the CALLER's envelope + per-member `{ pubKey, hasEnvelope }`.
  - `PUT /:id/chat/keys` — bootstrap (any epoch when none exists) or **rotation** (only strictly-higher epochs; equal/stale → 409 with a pointer to re-fetch + self-heal). The unique index arbitrates bootstrap races.
  - `POST /:id/chat/envelopes` — **self-healing distribution** (see 12.3).
- Shape walls: zod base64 regexes (`PUBKEY_MAX=512`, `WRAPPED_KEY_MAX=1024`, envelope targets must be 24-char hex AND current members, ≤50 per request). `routerCoverage.test.ts` proves no trip-scoped route escapes the guard.

### 12.3 Product decisions (user-confirmed)

1. **Full history for new members.** ANY member who already holds the conversation key may wrap it for any member/invitee missing an envelope (`POST /chat/envelopes`). A fresh invitee reads the *entire* chat the next time some other member opens theirs — no server-side history gate, no message re-encryption. Smoke-verified: Carol joins last, receives an envelope from Alice's open client, decrypts the *historical* Bob message.
2. **Backup code for a second device.** The private key lives in `localStorage`; exporting/importing it is the only way to light up chat on another browser (frontend work).
3. **Metadata honesty.** Only bodies encrypt; anchors/timestamps/read-state/authorship stay plaintext so day chips, unread badges and typing keep working. Enforced server-side *by what we don't encrypt*.

### 12.4 Changes threading through the write path

- `TripComment.e2ee` flag; `body` doubles its cap for encrypted rows (`COMMENT_MAX_LEN × 2` — the encoding overhead; the *plaintext meaning cap* is unchanged). Plaintext rows remain first-class (legacy + disabled-crypto fallback), so no migration: old messages render as-is, marked "not encrypted".
- Decision snapshots (`F9`) learn the doubling: `decisionBodyFrom(body, e2ee)` clamps at ×2 for encrypted rows — slicing ciphertext at the flat cap would have corrupted it into an undecryptable blob. The snapshot copies the ciphertext as-is; readers decrypt it with the same conversation key.
- SSE comment frames carry the (already-projected) ciphertext row; receivers decrypt locally. Zero frame-format changes.

### 12.5 Honest limits (v1)

- The wall between the conversation key and the server rests on client crypto in a browser — a malicious server that serves a doctored JS bundle could exfiltrate keys (WhatsApp-Web-class trust model, standard for browser E2EE).
- Rotation is accepted server-side but **not exposed in the UI yet** (no member-removal re-keying in v1; a removed member's cached key still opens the ciphertexts they saw before removal). The epoch/rotation plumbing exists precisely to wire that later.
- Plaintext-era messages are not retroactively encrypted — rendering marks them honestly instead of pretending.

### 12.6 Frontend (F10b) — SHIPPED same day

- **`lib/chatCrypto.ts`** — browser-side crypto module: identity mint/load/publish (ECDH P-256, private half NEVER leaves the device), backup-code export (`TAI1.<base64 JSON JWK>`) + import, per-trip member-pubkey cache (localStorage — survives a wrapper LEAVING the trip), envelope wrap/unwrap (`base64(JSON {v,w,iv,d})` — the wrapper id rides inside so recipients can resolve any member who re-shared), message encrypt/decrypt (`<b64 iv>.<b64 ct>`).
- **`hooks/useTripChatCrypto.ts`** — the per-trip session: identity publish → keys fetch → bootstrap (mint epoch 1, envelope every member with a published key; races lose gracefully to 409 + retry) → unwrap (my envelope) → ready; `keyless` until another member's open client self-heals; `off`/`error` fall back to HONEST plaintext. Owns the decrypt pass (`syncRows`) and a just-written plaintext cache so own bubbles never blink into base64.
- **`useTripComments`** — `addComment(body, day, e2ee, plaintextHint)`, `editComment(..., e2ee)`; the optimistic bubble always shows the words, never the ciphertext.
- **`CommentsTab`** — `bodyOf(row)` renders decrypted text (🔒 placeholder when the key isn't unlocked yet), composer encrypts on send, edit box never opens a base64 blob, feed header gains an honest E2EE / Plain-text badge, chat surface shows a keyless banner.
- **`DiscussionDrawer`** — header gains an E2EE status dot (green ready / amber syncing / red unavailable) + a key-backup dialog (export code / import code) and hands the crypto api down.
- **`smoke-f10.mts`** re-cut to the SPA envelope format (JSON `{v,w,iv,d}`) — wrapper resolution verified live: Carol opens Alice's re-share via `w`.

Re-verified after the format change: 223/223 backend tests; smoke-f10 ALL PASS (31 checks); typecheck + build pass; SPA mirror refreshed.
