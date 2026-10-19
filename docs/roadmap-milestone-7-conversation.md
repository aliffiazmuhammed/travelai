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

> **F12a backend SHIPPED (2026-10-19).** The F10 constraint rewrites the pipeline — the server cannot read chat bodies, so all chat grounding is CLIENT-FED (user-confirmed: replies come back via the asker's browser, encrypted with the trip conversation key and posted as `bot: true` rows; grounding = the question + the last 8 decrypted messages, disclosed in the composer). `POST /:id/chat/assistant` (viewer floor, `assistantAskLimiter` 5/min user-keyed burst) takes `prompt` (≤500 chars, must literally contain the `@TravelAI` mention — enforced server-side as the primary brake) + `context` (≤8 lines `{label ≤32, text ≤500}`, wire budget ≤6000 chars). The server adds the trip document (title/days/budget/season/day titles — server-owned by design) and calls `generateWithFallback` (Gemini 2.5-flash → GROQ fallback → prompt-hash cache). The clamped (≤800 chars) answer returns ONLY to the asker's browser, which encrypts it with the trip conversation key and posts it through the normal comments endpoint — stored and broadcast as ciphertext like every other row. `BOT_DAILY_LIMIT` (default 20, env-tunable) is a per user × trip × day bucket, consumed AFTER shape validation (rejected asks are free), in-process (restart resets — honest cost brake, unit-covered incl. day rollover). The assistant route never touches `Trip.rev`. `TripComment.bot` is cosmetic (persona rendering); spoofable-but-harmless by design. 239/239 backend tests (16 new in `assistant.test.ts`), live smoke `smoke-f12a.mts` — 16 checks ALL PASS with `BOT_DAILY_LIMIT=1` (two real provider calls; the 429 budget; the encrypted bot row round-trip). Frontend shipped in the follow-up commit.

**F12b proposal cards SHIPPED (same day, two commits).** The assistant answer is now a strict JSON envelope `{text, proposal}` — `proposal` is ONE typed change from `assistantProposalSchema` (zod discriminated union: `title` / `budget` / `day_title` / `day_tip`, all bounded to fields the client can patch non-destructively; structural reshuffles stayed future work until F12d — see §12.12). Every model-drift failure degrades to a plain text bubble, never a 5xx: prose stays prose (F12a replies remain valid), a malformed proposal drops while its text survives, empty text + valid proposal gets a template line, and a day-anchored proposal is dropped server-side when it points past the itinerary the server owns (`proposalFitsTrip`). Serialized-size backstop: reply ≤800 + proposal ≤800 JSON must fit ONE encrypted comment. The CLIENT still owns the wire: it wraps proposal answers as `{v:1, text, proposal}` inside the encrypted bubble (all members decrypt the same bytes → same card), and Apply composes the change into the open ItineraryData snapshot — unsaved local day edits ride along exactly like `persistGranular` — and saves through the normal `PUT /:id` path (editor floor, required `baseRev`, snapshotted). The bot never writes the trip. Cards render inside the violet bot bubble (`Proposed change` → `Day N — title` → `→ value`) with `Apply change` / `Not now`; applied/dismissed is honest **per-visit local state** (the row is immutable ciphertext). Viewers see the suggestion without controls. Frontend commits: typecheck + build pass, SPA mirror refreshed; smoke-f12a extended to 20 checks ALL PASS with `BOT_DAILY_LIMIT=2` (live typed proposal returned; the daily-429 wording asserted so the quota gate is distinguishable from the burst limiter, which counts rejected asks — walls in the smoke run under the second member to keep the asker's burst window free). **F12a frontend (same day):** the composer routes on the mention — `/@travelai/i` in the draft flips it into ask mode: a violet disclosure chip states exactly what leaves the group's envelope ("sends this message plus N recent chat messages (decrypted) to the AI provider" — N is live-computed over the last 8 readable rows, undecryptable ones skipped honestly), a "TravelAI is thinking…" line runs during the round-trip. On send the question encrypts and posts normally FIRST (so a failed ask never loses the message), then `api.askTravelAI(tripId, {prompt, context})` ships the ask + last-8 grounding (built pre-question via the crypto layer, most recent first as the server contract expects), and the clamped answer re-encrypts through `encryptOutgoing` and posts as a `bot: true` row — optimistic preview labeled TravelAI, no persona flash. `CommentRow` renders bot rows as the TravelAI participant for EVERYONE (violet bubble, Bot avatar, "AI" badge, incoming side — even for the asker who technically posted it); edit stays hidden (the asker cannot rewrite the bot's words), decide still works so bot advice can be promoted to a decision card. Works identically in the chat dock and the feed composer via the shared fragments. Bundle `ItineraryDisplay-BG2Vb30p.js`.

**F12c chat-native extras SHIPPED (2026-10-19; scope confirmed with the user: summarize + day-anchor now, polls deferred, translate is inherent).** The ask's TASK is inferred server-side from the question (it is plaintext to the server by design): `assistantTaskFrom` routes summarize-family asks ("summarize", "recap", "catch us up", "what did we decide/agree/settle", "bring me up to speed") to a decided-first summary instruction — lead with what the group DECIDED, then open items, then a concrete next step; no proposal unless one is pending. Day-anchored asks (the composer's day picker, `day` on the ask payload) add `The asker is asking about Day N: <title>` to the server-owned facts — only when the trip actually describes that day, never inventing structure. The client mirrors the task regex: a summary ask feeds the grounded context with the pinned DECISION cards first (latest 4, decrypted snapshots via the crypto layer, labeled `Decision`), then recent messages fill the remaining lines of 8 — the server stays blind to all of it (context is client-fed, the same disclosure note now says "and the pinned decision cards"). A latent F12a bug shipped in the same pass: message labels were not clamped to the zod 32-char wall pre-send, so a member with a long email local-part would 400 every ask — labels now slice client-side. Built-in translation needs no code ("@TravelAI … in Japanese" is an ordinary ask — documented, not built). **Polls (debate→poll) deliberately DEFERRED**: a vote needs its own storage/merge semantics that E2EE makes non-trivial (who counted what) — a separate increment with its own product decisions. Backend 253/253 (task+anchor tests), smoke 21 checks ALL PASS with `BOT_DAILY_LIMIT=3` (answer, day-anchored proposal, summary, live 429, bob's own bucket).

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

### 12.7 Fallback-UX softening (user-reviewed, 2026-10-19)

- **The banner stays, the alarm goes.** The error state keeps the ONE fact that cannot be withheld ("Encryption is off in this session — new messages send unencrypted." — silently regressing to plaintext is the one disclosure that must never be dropped), but the raw technical cause moved OUT of the headline into a tooltip, the red alarm became amber, and the lock icon was removed (a convention, not a requirement — user call).
- **Retry is the medicine, not "reopen the chat"**: the banner carries a Retry button that re-runs the whole key flow in the open chat; on success the decrypt pass re-runs over the already-loaded rows and the 🔒 bubbles unlock in place (the sync-rows effects re-run per render via the fresh api object).
- **Honest cause capture**: the catch now records thrown strings/objects too (previously a message-less throw fell through to the generic text, making field reports unanswerable).
- **Calm placeholders**: the keyless banner is a single quiet line ("Your chat key is syncing — messages will unlock shortly."), and the locked-bubble copy lost its emoji — "Encrypted message — can't be decrypted on this device yet."

### 12.8 Second-device recovery (user-reported, 2026-10-19)

**Report:** chat opened on a *second browser* showed "Encryption is off in this session" with a Retry that never helped, and every encrypted row (including the user's own, sent from the other device) stayed locked.

**Root cause:** the identity is per-BROWSER (localStorage JWK); a second device mints a fresh keypair and publishes it, but the trip's envelope for that ACCOUNT was wrapped to the FIRST device's public key. `unwrapMyEnvelope` therefore throws deterministically — Retry can only replay the same failing unwrap. Three separate defects turned that into a dead end:

1. the unwrap failure was classified as `error` (a transient-failure state with a Retry), never `keyless`;
2. the key dialog's "Unlock this device" button was `disabled` when `status === 'error'` — i.e. exactly in the state that needs the backup code;
3. `importBackupCode()` replaced localStorage but NOT the module-level `identityPromise` memo, so the key flow it re-ran kept using the freshly minted (wrong) identity — the import silently did nothing until a full page reload.

**Fix (F10c, frontend only):**

- `adoptEnvelope` classifies every unwrap outcome: `missing` (no envelope for this account yet, or the wrapper left and is uncached) vs `mismatch` (an envelope exists, wrapped to another device's key). Both are `keyless` — honest, and the banner offers the one action that works: **Backup code**.
- The banner is actionable again: "Chat here is locked with another device's key. Copy that device's backup code…" + a **Backup code** button that opens the drawer's key dialog (`onOpenKeyBackup` prop; feed variant shows the text only). Keyless devices no longer export their own useless code (the dialog explains why).
- The import button is never disabled by crypto state, and `importBackupCode` now replaces the identity memo, so the post-import key flow uses the restored key immediately (no reload).
- A quiet poll (6s + window focus) runs while `keyless`: if an envelope for this account appears, it unwraps in place.

**Known limit (RESOLVED in 12.9):** envelopes used to be stored one-per-USER, so two devices of the same account were unlocked by importing the backup code from the first.

### 12.9 F10d — multi-device keys (same day, user-approved)

**Goal:** signing in on a second browser/device must unlock encrypted chat with no backup-code copying.

**Design — one envelope slot per DEVICE:**

- Envelope keys are now the **recipient's public key** (base64 SPKI) instead of the member id, so every browser of an account owns its own slot. Plain member ids remain valid and readable: envelopes minted before F10d keep working (legacy compatibility, verified by a smoke check).
- `User.chatPubKeys` keeps the account's device keys, newest first, capped at `CHAT_PUB_KEYS_MAX = 5` (`mergePubKeyList`, pure + unit-tested); `chatPubKey` stays as the newest key for roster/legacy reads. `PUT /api/auth/chat-key` now appends (idempotent for the same key).
- `GET /:id/chat/keys` returns `mineAll` (EVERY envelope addressed to this account — the client tries them until one opens on the device in front of the user) plus, per member, `pubKeys` and `envelopedPubKeys` (which device slots are filled). `mine` is still the first candidate, so older clients keep working.
- A wrapper may have wrapped from any of their devices while the envelope only records their user id, so `unwrapMyEnvelope` now tries **every published key of the wrapper** (`devicePubs`) and returns the first that opens.
- **Self-heal is finally wired** (the `POST /:id/chat/envelopes` route existed since F10 but no client ever called it): a client that holds the key wraps it for every EMPTY device slot it can see — `healSlots`. `ready` clients re-check every 15s while chat is open (plus window focus); `keyless` clients poll every 6s. So: open chat on the working device → the second device unlocks itself within seconds, no user action. Late joiners get full history the same way.
- Bootstrap (epoch 1) envelopes every published device key of every member.

**Result:** keyless on a second device is now a transient, self-resolving state (the banner's "unlocks automatically once another device opens chat" wording); the backup code remains as an offline fallback.

**Verified:** backend `tsc` + **261/261** tests (new pure rules: `mergePubKeyList` cap/dedupe, `memberDeviceKeys`, device-slot targeting walls, multi-device projection incl. legacy envelopes); live `smoke-f10.mts` extended with a **real second-device case** (second identity published → no slot → device opens nothing → holder heals the slot → same conversation key, cross-decrypts, `envelopedPubKeys` reaches 2) and a non-member DEVICE-key wall.

### 12.10 Chat copy — WhatsApp convention, no crypto vocabulary (user call)

The user is the product owner: **members of a trip do not want to read about encryption**. The chat now speaks the WhatsApp dialect instead of explaining the machinery.

- **One line at the top, ever:** "Messages are end-to-end encrypted." — rendered as a quiet centered system line in the drawer (and a muted line under the Discuss header) and only while the channel is actually usable. No lock icons, no badges, no "E2EE"/"Plain text" chips (both badge variants and the `Lock` import are gone).
- **Unreadable rows** say "Waiting for this message…" (WhatsApp's wording) — the old "Encrypted message — can't be decrypted on this device yet." is gone.
- **Degraded sending is still disclosed**, because silent plaintext would be a trust bug — but in plain words, once, just above the composer: "Messages you send here aren't protected yet." with a quiet **Reconnect** link (runs the key flow). No cause text, no banner, no amber box.
- **Assistant disclosure** lost its crypto clauses: it now says the reply appears in this chat instead of "(decrypted)… the answer is encrypted into the thread".
- The key dialog (an explicit settings flow reached from the toolbar key icon, not the message stream) keeps its functional wording, minus the word "encrypted" where it was decorative.
- Edit is refused on a row this device cannot read (it would have seeded the edit box with the placeholder and overwritten the real message on save).

### 12.11 Invite links — the request origin is the truth (user-reported, 2026-10-19)

The owner-facing group-invite link was minted server-side from `FRONTEND_URL` with a hardcoded `http://localhost:8080` default, so on Render (SPA + API on one origin, no `FRONTEND_URL`, or a leftover dev value) production handed out **localhost** invitations that no invitee could open.

- **Precedence is now explicit and pure** (`pickLinkOrigin`): a non-loopback browser `Origin` header → a non-loopback configured `FRONTEND_URL` → the request's own host (`X-Forwarded-Host`/`Host` + `X-Forwarded-Proto`, proxy-aware via `trust proxy`) → `RENDER_EXTERNAL_URL` → configured value → localhost. A loopback configuration can therefore never leak into a real deployment, and local dev still gets the origin the backend serves.
- The controller passes `linkOriginHints(req)` into `createTripInvite`; no invite rows or stored links change, because only the shared-once link is computed at mint time.
- Unit-tested precedence (`invites.test.ts`): the production defect (real browser origin vs localhost env), config-vs-API-host split topology, same-origin Render, platform-URL rescue, and dev loopback behaviour.

### 12.12 F12d — activity-level proposals + the no-promises rule (user-reported, 2026-10-19)

The user asked the assistant to *swap the activities of Day 1 and Day 2*. The bot first **claimed it would do it** ("Got it, we'll swap the Day 1 and Day 2 activities as requested"), then a minute later admitted it could only propose titles, tips and budgets. Two defects, one increment.

**1. The honesty defect (the worse of the two).** A promise the bot cannot keep is a trust failure, and it came from the prompt merely *offering* four shapes without forbidding claims. The protocol now states outright: *"You never edit the trip yourself. Never say you will do something, that you have done it, or that something is arranged unless the facts above already show it. A proposal is the ONLY way a change can happen, and a human applies it — describe it as a suggestion the group can apply, never as something you are doing or will do. If the ask needs a change you cannot express with exactly these shapes, say plainly that you cannot do that yet — never promise to do it later."* Verified live on both providers: an unexpressible ask ("add a brand new day 4") now answers *"I can't add a brand new day to the itinerary yet. My current tools only allow for modifications to existing days and activities."* with no proposal.

**2. Activity-level edits.** Three kinds joined the union (`assistantProposalSchema`, 7 total):

| kind | fields | meaning |
|---|---|---|
| `swap_days` | `from_day`, `to_day` | exchange two days' plans (same operation as the weather-routing "swap days" suggestion, days renumbered `1..n`) |
| `move_activity` | `day`, `index`, `to_day`, `to_index`, `expect` | move one activity; `to_index` is the **final** 0-based position |
| `update_activity` | `day`, `index`, `value`, `expect` | rename one activity (`title` is what the timeline renders) |

**Grounding.** `tripFactsFrom` now emits `dayPlans` — each itinerary day with its activity labels in display order (`title` first, then legacy `name`; string activities pass through), capped at 20 days × 6 activities × 60 chars. The prompt renders them as `Day 1 activities: [0] Airport pickup | [1] Beach walk`, which is what makes a 0-based index addressable at all.

**The drift guard (`expect`) — the reason structural edits are safe.** A proposal card lives in immutable chat history forever, but the itinerary keeps changing: an index that was "position 1" when the model looked can point at a different activity by the time someone taps Apply. So every aimed edit carries the label *exactly as the model saw it*, and it is checked twice: server-side in `proposalFitsTrip` (against the same snapshot the facts came from — a hallucinated label never becomes a card) and client-side in `lib/proposalApply.ts` (against the live itinerary at Apply time — `labelMatches` is a case/space-insensitive prefix check, so a truncated fact label still matches). A mismatch is a visible refusal (*"The itinerary changed since this was suggested — ask TravelAI again."*), never a wrong-row edit. Off-shape and out-of-range proposals (bad index, missing day, non-existent final position, a no-op move) are dropped or refused the same way.

**Application.** `applyItineraryProposal` splits: `swap_days` reuses the already-tested `swapDayPlans`; `move_activity` / `update_activity` go through the new dependency-free pure module `frontend/src/lib/proposalApply.ts` (no imports, no `@/` aliases — so the backend's live probe can import the *identical* file through tsx). Both then save through the unchanged `onSave` path (editor floor, required `baseRev`, versioned snapshot). Cloning is pure: the caller's snapshot is never mutated. Cards read `Day 1 ↔ Day 2`, `Day 1 → Day 3 — move an activity`, `Day 2 — rename an activity`.

**Verification.** Backend `tsc` clean; suite **276/276** (9 new: facts/index caps, coercion walls, swap/move/update fit-checks, drift refusal, prompt protocol + no-promises line, envelope round-trip, `labelMatches`). The pure apply module was probed directly (11/11: rename preserving other fields, cross-day insert, same-day final-position reorder, move into an empty day, stale-label/out-of-range/append/no-op refusals, input purity). Live two-provider probe confirmed all three kinds come back correctly indexed with a verbatim `expect`. `smoke-f12a.mts` extended: the smoke trip now carries activities, the typed-kind wall covers 7 kinds, and bob's bucket adds the activity ask with drift-guard assertions. Frontend typecheck + build + SPA mirror refreshed.

