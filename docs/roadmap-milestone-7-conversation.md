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

**F12b proposal cards SHIPPED (same day, two commits).** The assistant answer is now a strict JSON envelope `{text, proposal}` — `proposal` is ONE typed change from `assistantProposalSchema` (zod discriminated union: `title` / `budget` / `day_title` / `day_tip`, all bounded to fields the client can patch non-destructively; structural reshuffles stayed future work until F12d — see §12.12). Every model-drift failure degrades to a plain text bubble, never a 5xx: prose stays prose (F12a replies remain valid), a malformed proposal drops while its text survives, empty text + valid proposal gets a template line, and a day-anchored proposal is dropped server-side when it points past the itinerary the server owns (`proposalFitsTrip`). Serialized-size backstop: reply ≤800 + proposal ≤800 JSON must fit ONE encrypted comment. The CLIENT still owns the wire: it wraps proposal answers as `{v:1, text, proposal}` inside the encrypted bubble (all members decrypt the same bytes → same card), and Apply composes the change into the open ItineraryData snapshot — unsaved local day edits ride along exactly like `persistGranular` — and saves through the normal editor content path (`PUT /:id/itinerary` after M7.2, required `baseRev`, snapshotted). The bot never writes the trip. Cards render inside the violet bot bubble (`Proposed change` → `Day N — title` → `→ value`) with `Apply change` / `Not now`; applied/dismissed is honest **per-visit local state** (the row is immutable ciphertext). Viewers see the suggestion without controls. Frontend commits: typecheck + build pass, SPA mirror refreshed; smoke-f12a extended to 20 checks ALL PASS with `BOT_DAILY_LIMIT=2` (live typed proposal returned; the daily-429 wording asserted so the quota gate is distinguishable from the burst limiter, which counts rejected asks — walls in the smoke run under the second member to keep the asker's burst window free). **F12a frontend (same day):** the composer routes on the mention — `/@travelai/i` in the draft flips it into ask mode: a violet disclosure chip states exactly what leaves the group's envelope ("sends this message plus N recent chat messages (decrypted) to the AI provider" — N is live-computed over the last 8 readable rows, undecryptable ones skipped honestly), a "TravelAI is thinking…" line runs during the round-trip. On send the question encrypts and posts normally FIRST (so a failed ask never loses the message), then `api.askTravelAI(tripId, {prompt, context})` ships the ask + last-8 grounding (built pre-question via the crypto layer, most recent first as the server contract expects), and the clamped answer re-encrypts through `encryptOutgoing` and posts as a `bot: true` row — optimistic preview labeled TravelAI, no persona flash. `CommentRow` renders bot rows as the TravelAI participant for EVERYONE (violet bubble, Bot avatar, "AI" badge, incoming side — even for the asker who technically posted it); edit stays hidden (the asker cannot rewrite the bot's words), decide still works so bot advice can be promoted to a decision card. Works identically in the chat dock and the feed composer via the shared fragments. Bundle `ItineraryDisplay-BG2Vb30p.js`.

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

- **`lib/chatCrypto.ts`** — browser-side crypto module: identity mint/load/publish (ECDH P-256, private half NEVER leaves the device), backup-code export (`TAI1.<base64 JSON JWK>`) + import (**removed in §12.14** — the device unlocks itself now), per-trip member-pubkey cache (localStorage — survives a wrapper LEAVING the trip), envelope wrap/unwrap (`base64(JSON {v,w,iv,d})` — the wrapper id rides inside so recipients can resolve any member who re-shared; **superseded by the v2 format in §12.13**, which adds the wrapper's device key and binds the slot into the AEAD), message encrypt/decrypt (`<b64 iv>.<b64 ct>`).
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

**Result:** keyless on a second device is now a transient, self-resolving state (the banner's "unlocks automatically once another device opens chat" wording); the backup code remains as an offline fallback until §12.14 removed it at the user's call.

**Verified:** backend `tsc` + **261/261** tests (new pure rules: `mergePubKeyList` cap/dedupe, `memberDeviceKeys`, device-slot targeting walls, multi-device projection incl. legacy envelopes); live `smoke-f10.mts` extended with a **real second-device case** (second identity published → no slot → device opens nothing → holder heals the slot → same conversation key, cross-decrypts, `envelopedPubKeys` reaches 2) and a non-member DEVICE-key wall.

### 12.10 Chat copy — WhatsApp convention, no crypto vocabulary (user call)

The user is the product owner: **members of a trip do not want to read about encryption**. The chat now speaks the WhatsApp dialect instead of explaining the machinery.

- **One line at the top, ever:** "Messages are end-to-end encrypted." — rendered as a quiet centered system line in the drawer (and a muted line under the Discuss header) and only while the channel is actually usable. No lock icons, no badges, no "E2EE"/"Plain text" chips (both badge variants and the `Lock` import are gone).
- **Unreadable rows** say "Waiting for this message…" (WhatsApp's wording) — the old "Encrypted message — can't be decrypted on this device yet." is gone.
- **Degraded sending is still disclosed**, because silent plaintext would be a trust bug — but in plain words, once, just above the composer: "Messages you send here aren't protected yet." with a quiet **Reconnect** link (runs the key flow). No cause text, no banner, no amber box.
- **Assistant disclosure** lost its crypto clauses: it now says the reply appears in this chat instead of "(decrypted)… the answer is encrypted into the thread".
- The key dialog (an explicit settings flow reached from the toolbar key icon, not the message stream) keeps its functional wording, minus the word "encrypted" where it was decorative. (**Removed entirely in §12.14.**)
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

**Application.** `applyItineraryProposal` splits: `swap_days` reuses the already-tested `swapDayPlans`; `move_activity` / `update_activity` go through the new dependency-free pure module `frontend/src/lib/proposalApply.ts` (no imports, no `@/` aliases — so the backend's live probe can import the *identical* file through tsx). Both then save through the unchanged `onSave` path (`PUT /:id/itinerary` after M7.2, editor floor, required `baseRev`, versioned snapshot). Cloning is pure: the caller's snapshot is never mutated. Cards read `Day 1 ↔ Day 2`, `Day 1 → Day 3 — move an activity`, `Day 2 — rename an activity`.

**Verification.** Backend `tsc` clean; suite **276/276** (9 new: facts/index caps, coercion walls, swap/move/update fit-checks, drift refusal, prompt protocol + no-promises line, envelope round-trip, `labelMatches`). The pure apply module was probed directly (11/11: rename preserving other fields, cross-day insert, same-day final-position reorder, move into an empty day, stale-label/out-of-range/append/no-op refusals, input purity). Live two-provider probe confirmed all three kinds come back correctly indexed with a verbatim `expect`. `smoke-f12a.mts` extended: the smoke trip now carries activities, the typed-kind wall covers 7 kinds, and bob's bucket adds the activity ask with drift-guard assertions. Frontend typecheck + build + SPA mirror refreshed.

### 12.13 F10e — the E2EE audit: three real defects, fixed (user-reported, 2026-10-20)

The user reported that encryption/decryption still had "some serious flaws" and asked for a full audit plus corrective measures if the architecture was unsound. The audit (whole server surface + the browser crypto core) found the architecture sound *in its own trust model* and three defects that were not — two of them severe enough to break the product's headline promise ("multi-device chat keys work automatically, without copying backup codes").

**The headline defect: self-healing worked for exactly one device.** `unwrapMyEnvelope` imported the unwrapped conversation key with `extractable: false` while `wrapEnvelope` needs `exportKey('raw', ck)` to wrap it again. The platform rule is absolute — `exportKey` on a non-extractable key throws `InvalidAccessError` (probe-verified) — and `healSlots` caught the per-slot error silently by design ("one device failing to wrap never blocks the rest"). So only the device that *minted* the key **in that browser session** could ever share it: every other holder (i.e. every device that had adopted the key, including the minter's own browser after a reload, since the key lives only in memory) failed every wrap with nobody the wiser. A second device unlocked only while the original tab stayed open on the bootstrap session. The key is now imported extractable, with the reasoning recorded where it belongs: the JWK snapshot for it already sits in `localStorage`, an XSS that can reach a non-extractable key can already decrypt every message in the tab, and a key that cannot be re-exported cannot be re-shared.

**The permanent-lockout defect: a "filled" slot was never re-wrapped, even when it was provably dead.** `healSlots` skipped any device key already present in `envelopedPubKeys`. That is only sound if a filled slot is always openable, which it is not: (a) the member who wrapped it may have left the trip and the recipient may have no cached key for them (the unwrap error literally said *"wait for another member to re-share"* — and no member ever would, because the slot looked filled); (b) any member may overwrite any other member's slot with rubbish (last write wins, and the server is blind by construction), which produced the same dead end. Recovery was impossible: the backup code restores the *private* half, but opening that envelope still needs the departed wrapper's *public* half. The healing rule is now "**re-wrap every slot you cannot prove is openable**" (`slotIsUsable`, pure): the server projects each slot's wrapper metadata (the `w`/`wk` the *client* wrote in the clear — addressing, not ciphertext) and a client proves a slot usable only when the wrapper's device key is still published (v2) or the wrapper is still a member (v1). Everything else — departed wrapper, evicted key, overwritten rubbish, unreadable blob — is re-wrapped by the next open keyholder, which makes the sabotage case self-repairing instead of fatal.

**Envelopes v2: the slot is now inside the AEAD.** The old `{ v:1, w, iv, d }` envelope recorded only the wrapper's *user id*, so the recipient had to brute-force every device key that member ever published and an envelope copied to another slot (or one whose metadata was edited) failed only by luck. v2 (`{ v:2, w, wk, iv, d }`) records the exact wrapping device key and binds `w`, `wk` and the recipient's public key into the AEAD as associated data, so a retagged, relabelled or relocated envelope now fails deterministically — and the wrap is one attempt, not a scan. v1 envelopes stay **readable** (a legacy client's slots keep working; the smoke keeps a `wrapLegacyV1Envelope` writer to prove it), and the server rejects a *v2* envelope whose `wk` is not a key that member actually published, so the metadata the healing rule trusts cannot be forged. The one thing this cannot fix is a member who overwrites a slot with a well-formed envelope for the right wrapper: the server cannot verify content, so a determined member can still deny service to another's device (documented below; the recovery is a re-wrap by any other holder, which any live member can do).

**No silent plaintext downgrade.** `encryptOutgoing` returned `{ body: plaintext, e2ee: false }` whenever encryption threw — even with `status === 'ready'`, i.e. while the composer said "Messages are end-to-end encrypted." A transient crypto failure would have sent the words in the clear *and* flagged them `e2ee: false` where nobody looks. It now throws (the send fails visibly, the draft survives, the toast is plain words), and the deliberate plaintext path is confined to the states where the composer discloses it. That disclosure was itself incomplete: the quiet "Messages you send here aren't protected yet." line only covered `error`/`keyless`, so `starting` (the first open, while the key is minted and shared), `bootstrap` and `off` (no WebCrypto at all) sent plaintext with **nothing on screen saying so**. Every non-`ready` state now discloses, and the drawer's status dot no longer calls `off` "Connecting…".

**Backup codes that cannot be trusted are now refused.** `importBackupCode` claimed in its comment to have "verified usability" and verified nothing: a well-formed code whose private half did not match its own published public half was adopted, then *published*, leaving a device that can never unlock and a dead key shadowing the account's real one at the top of the capped list. EC JWKs carry the public point, so `assertKeyPairMatches` now proves priv↔pub (one SPKI import + JWK export) and rejects anything that does not match, plus non-P-256 keys and junk.

**Hygiene.** `b64()` spread the whole buffer into `String.fromCharCode` (a stack overrun waiting for a large body) — now chunked. The integrity-critical browser crypto moved into `frontend/src/lib/chatCryptoCore.ts` with **no imports**, so the repo's `tsx` probes execute the identical file the browser bundles (`lib/chatCrypto.ts` is now the thin shell that publishes the public half and re-exports); that is how the fixes below are verified offline instead of by eye.

#### 12.13.1 What the audit confirmed sound

- **No plaintext anywhere server-side.** Bodies are stored verbatim (ciphertext), tombstones empty them, no search/notification/email path reads them, and `decisions.ts` copies a promoted body *with* its `e2ee` flag. The public share projection is an allow-list that excludes comments/decisions/members entirely. SSE frames are members-only (`requireTripRole('viewer')`) and carry the same projected rows.
- **The server only ever hands a caller their own envelopes** (`mine`/`mineAll`), plus other members' *public* keys and slot metadata.
- **Writer walls hold**: envelope targets must be current members or their published device keys, payloads are capped base64, epochs only move forward, and non-members get 404s on both key routes.
- Primitives are the standard set (ECDH P-256 → HKDF-SHA-256 → AES-256-GCM), with fresh 96-bit nonces per message and per envelope.

#### 12.13.2 Honest limits (what this design does NOT promise)

1. **The server is trusted for key *distribution*, not for content.** It is the sole authority for the member roster and published public keys, so a malicious or compromised server can hand a healer the wrong public key and read everything from then on — and it always sees the metadata (who wrote, when, how many). This design protects content from a *curious* server and from anyone who reads the database; it does not protect it from a hostile server. Mitigating that needs safety-number-style key verification (out-of-band fingerprints) and/or pinning with a visible key-change warning; neither ships yet, and pinning alone would not catch a substitution that happened from the first sight of a member.
2. **No sender authentication inside the group.** Every member holds the same conversation key, and the attributed `label` comes from the server, so any member (or the server) can produce a body that appears to come from someone else. Group-chat E2EE without per-sender signatures cannot express "who wrote this" cryptographically.
3. **Removal does not re-key.** The epoch/rotation plumbing exists server-side but no client calls it (`putTripChatKeys` only ever bootstraps epoch 1). A member removed from a trip cannot fetch anything, but a co-member can still hand them ciphertext, and a re-added member reads everything said in between. Wiring rotation must ship with a multi-epoch read path, which is also why the client currently keeps only the current key in memory: a rotation as-designed would strand any history not already on screen.
4. **Browser E2EE trust model.** A doctored JS bundle (hosting compromise, malicious extension, XSS) can read keys and plaintext in the tab. That is the WhatsApp-Web-class baseline, not a gap this increment can close.
5. **A member can deny service to another's device** by overwriting its slot with a well-formed v2 envelope (the server cannot see inside). F10e makes this *recoverable* (the next holder re-wraps) but not impossible. Legitimate clients never do it, and the damage is availability, never confidentiality.
6. **Envelope `wk` metadata is public.** It is a public key the server already stores for that member; publishing the *wrapper's* key alongside the slot reveals nothing that a live member's `pubKeys` list does not.

#### 12.13.3 Verification (this increment)

- Backend `tsc` clean; suite **282/282** — 6 new pure tests in `chatKeys.test.ts`: `envelopeSlotMeta` for v2 (`w` + `wk`), for v1 (no `wk`), and for junk/arrays/primitives (all nulls ⇒ re-wrap); `assertEnvelopeMetadata` accepts a published wrapper key and 400s an evicted key, a key naming another member's device, and a v2 envelope missing its metadata; v1 stays exempt; the projection carries per-slot wrapper metadata next to `envelopedPubKeys`.
- **Live crypto probe (15/15, `tsx`, importing the real `chatCryptoCore.ts`)**: the platform rule behind the headline defect (a non-extractable key cannot be exported); `generateConversationKey` stays re-wrappable; v2 wrap→unwrap; **a joiner device re-wrapping the key for a third device, which the old code threw on**; v1 envelopes opening by membership and by cache, and refusing when neither is available; v2 metadata tampering (retagged `w`/`wk`) and a cross-slot copy both refusing to open; rubbish/unknown versions as hard errors; backup-code round-trip and a priv↔pub mismatch being **rejected**; `slotIsUsable` for all four slot shapes; a ~6k-character message round-trip (chunked base64) with wrong-key failure; `memberDeviceKeysOf` ordering/dedupe.
- **Live smoke `smoke-f10.mts` re-cut to the SPA's actual v2 wire format** (it was still writing v1, i.e. drifting from the contract it exists to pin) and extended with 9 checks: slot metadata shows the wrapper *and* the wrapping device key; a v2 envelope naming an unpublished wrapper key is a 400; a legacy v1 envelope is still accepted, is reported with `wrapperPub: null`, and still opens; a slot overwritten with rubbish is accepted by the blind server, reported as unreadable metadata, opens nothing — and is then repaired by a holder's re-wrap, after which the locked device opens the same conversation key again. **55 checks, ALL PASS**.
- Frontend `tsc -p tsconfig.app.json` + `vite build` clean; SPA mirror refreshed.

**Files:** `frontend/src/lib/chatCryptoCore.ts` (new, dependency-free), `frontend/src/lib/chatCrypto.ts` (shell), `frontend/src/hooks/useTripChatCrypto.ts`, `frontend/src/types/trip.ts`, `frontend/src/components/dashboard/CommentsTab.tsx`, `frontend/src/components/dashboard/DiscussionDrawer.tsx`, `backend/src/services/collab/chatKeys.ts` (+ tests), `backend/scripts/smoke-f10.mts`.

> Superseded in part by §12.14: the backup-code *UI and codec* described above were removed at the user's call. The `assertKeyPairMatches` check it added exists only to guard an imported code, so it went with the import path.

### 12.14 No key backup dialog — the device unlocks itself (user call, 2026-10-20)

**The user's call, verbatim in spirit:** members should have no role at all in copying or pasting a key. The "Chat key backup" modal and the key icon that opened it are gone.

**Removed:** the dialog (export textarea + copy button, import textarea, "Unlock this device"), the toolbar `KeyRound` trigger, `ChatCryptoApi.exportBackupCode` / `importBackupCode` and their hook implementations, the shell's `exportBackupCode` / `importBackupCode`, and the backup-code codec in the core (`TAI1.…`, `storedBackupCode`, `adoptBackupCode`, plus the `assertKeyPairMatches` guard that only existed to validate an imported code). The private identity key now leaves the browser in **no** form, for any reason.

**Why it is safe to delete:** the code was the workaround for the F10e defect (healing only ever worked from the device that minted the key). With that fixed, a new browser — or a cleared profile, which mints a fresh device key and publishes it — is unlocked by any member's open client within seconds, and since what history needs is the *conversation key* (not the old private key), the device reads the entire thread exactly like any second device (§12.9). The manual path is genuinely redundant, and a modal that asks people to paste `TAI1.…` blobs was the most confusing surface in the app.

**UI honesty:** with the remedy gone, the keyless composer line states what actually happens instead of pointing at a dialog that no longer exists: *"Chat is unlocking on this device — messages you send now aren't protected yet."* plus Reconnect.

**Honest limits this re-introduces (accepted trade-off, not a hidden one):**

1. There is no manual recovery path left. A device that no other client can heal — every other member's browser closed forever, the trip left by everyone else, or the member cleared their profile while being the *only* holder of the trip key — stays locked, and that trip's encrypted history is unreadable for good. Before this call, exporting a backup code was the escape hatch for exactly that case; the product owner ruled the hatch out.
2. A single-member trip whose only browser is cleared loses that trip's chat history permanently (the epoch document still holds envelopes no surviving device key can open).

Both were already true for anyone who never copied a code; the difference is that the UI no longer offers one. Recovering the *option* later means reintroducing a user-handled secret — which is precisely what was rejected here.

**Verified:** frontend `tsc -p tsconfig.app.json` + `vite build` clean; SPA mirror refreshed; no `TAI1`, `KeyRound`, `Dialog` (drawer), `exportBackupCode` or `importBackupCode` reference remains in `frontend/src` (backend is untouched by this call — it never saw the code).

### 12.15 F10h — pinned decisions: readable, and visible without scrolling (user-reported, 2026-10-20)

Two reports, one release: *"when i pin it i see encrypted text"* and *"the pinned chat i have to scroll all to the chat starting to visible"*.

**Defect 1 — every encrypted pin rendered as raw base64.** The decision document never stored the comment's `e2ee` flag:

- `models/TripDecision.ts` had no `e2ee` field at all, so `promoteToDecision` could not persist one — and mongoose's strict mode would have dropped it silently even if it had. The projection's `if (!deleted && row.e2ee)` was therefore never true.
- The client's `isEncrypted(row)` reads that flag, so it treated the snapshot as plaintext and printed `<iv>.<ct>` verbatim. The *decryption* pass was fine all along; it was never asked to run (`syncRows` skips rows without the flag).

Fixed at both layers:

- **Write path:** `e2ee: Boolean(comment.e2ee)` is stored on create; the schema now has the field. Deliberately `default: undefined` — *absent* means "not recorded" (legacy) while `false` means "known plaintext", which is what the repair below keys on.
- **Existing rows:** `listTripDecisions` repairs them on read (`repairDecisionFlags`), because the alternative is a migration the operator has to remember while users keep staring at base64. The repair is conservative — `inferDecisionE2ee(body, sourceE2ee)` requires **both** signals: the source comment is flagged e2ee *and* the snapshot matches the client's wire shape exactly (`16 base64 chars` = the 12-byte IV, `.`, base64 ciphertext). A plaintext remark can contain a dot ("meet at 9.30"), and a remark edited from plaintext to ciphertext after promotion leaves an honest plaintext snapshot — so neither signal alone is trusted. The repair can only ever *add* the flag, never hide a readable body, and it is written back (idempotent).
- The snapshot body is untouched: it is still the exact ciphertext of the promotion-time comment, which the conversation key opens.

**Defect 2 — the pinned strip was only reachable by scrolling to the top.** In the chat variant the strip lived *inside* the scroll container, before every message; the chat opens auto-scrolled to the bottom, so the pins were off-screen by definition.

Fixed with a `variant` on `DecisionsStrip`:

- `"inline"` — unchanged, used by the feed/dashboard card.
- `"band"` — the chat renders it **above** the scroll area (`shrink-0`): `Pin · DECISIONS · <count> · <newest body, one truncated line> · chevron`. Collapsed by default (one line, never eats the viewport), tap to expand into the full cards with unmark, capped at `38vh` with its own scroll. A pin made while the band is collapsed is still visible immediately — it becomes the preview line.

**Tests:** `decisions.test.ts` +3 — the flag survives projection but not a tombstone; `inferDecisionE2ee` requires both signals (and rejects a dot-only / empty shape); `new TripDecision({…e2ee:true}).toObject()` keeps the flag while a plain document has *no* key (the strict-mode trap, asserted directly). `smoke-f9.mts` +8 live checks — an encrypted remark pins with `e2ee` stored and returned, a re-read keeps it, a legacy row inserted through the raw collection (no flag) is repaired on read **and written back**, and a legacy *plaintext* row stays unflagged in the database.

**Verified:** backend `tsc --noEmit` clean, suite **285/285**; live `smoke-f9` **29/29 ALL PASS** (SSE frame included); frontend typecheck + build clean; SPA mirror refreshed.

**Not fixed / unchanged by design:** decisions are still a snapshot — editing the source comment after pinning does not change the card (that *is* the record), and unmarking a decision still leaves the source comment in the thread.

### 12.16 F13a — polls: sealed questions, sealed votes, tallied on devices (user-requested, 2026-10-20)

The user asked *"what about the polling feature it is not visible on frontend"*. It was never built: F12c had deferred debate→poll with the note that *"a vote needs its own storage/merge semantics that E2EE makes non-trivial (who counted what)"*. This increment builds it, with the scope the user chose: **chat card + always-visible band**, **sealed like chat**, **any member from the chat**.

**The shape that keeps the promise.** A poll is not a message and not a server-side tally:

- `models/TripPoll.ts` — `body` is the sealed `{ q, o[] }` payload (question + option labels), each `votes[].choice` is the sealed chosen *index*, `closedAt` closes voting, `deletedAt` tombstones. Votes are embedded (one row per member, bounded by the roster) and **nothing here bumps `Trip.rev`** — the §19.2 rule.
- **What the server knows:** that a poll exists, who started it, who voted. **What it never knows:** the question, the options, anyone's choice, or the tally. `listTripPolls` / `voteTripPoll` / `closeTripPoll` pass ciphertext through untouched; the projection only adds labels and time.
- **Tallies are computed in the browser** (`hooks/useDecodedPolls.ts`): the payload and every vote are opened with the trip key, in-range indices are counted, and every member's device derives the same counts from the same rows. Decoding is cached by the ciphertexts, so a vote re-decodes one poll and nothing else. A vote that does not decode, or an index outside the option list, counts for nothing rather than guessing.
- **One member, one vote:** `upsertVote` replaces a member's row (people change their mind) and returns `changed: false` for the same choice — no save, no broadcast, so a double-tap cannot spam collaborators. Verified live.
- **Membership ids travel.** Unlike decisions, a poll row carries `createdBy` and each vote carries `userId`. That is deliberate: a broadcast frame cannot carry a per-recipient `isYou`, so the client computes it from a stable id (presence already publishes the same ids to members). Content stays sealed; who-voted is membership.
- **Rights:** create and vote need `commenter`; read needs `viewer`; close/remove are creator-or-owner (service rules, `viewer` rank floor like decisions). Viewers see the cards and the tally but cannot vote.
- **No plaintext polls ever:** creation is disabled unless this device's chat is ready, and the dialog seals before sending. A server-side `body` without an `iv.` is refused (400) and a plaintext vote index is refused (409) — both verified live.

**Surface.** `Dashboard/Polls.tsx`:

- `PollsBand` — a `shrink-0` row **above** the chat scroll area (above the decisions band), collapsed by default: `BarChart3 · POLLS · <count> · <newest open question> · N voted · chevron`. Expanding shows full `PollCard`s in a `38vh` own-scroll area. An open poll can never be scrolled away — the same defect F10h fixed for decisions.
- `PollCard` — question, options as tap targets with a share bar and count, a check on your choice, "N votes", Close (creator/owner), remove (creator/owner). Copy stays product-plain: no encryption vocabulary anywhere (§12.9). Closed polls stay in the conversation as the record; the band carries only open ones.
- The transcript **interleaves** comments and polls by `createdAt` (`timeline` in `CommentsTab`), so a poll appears where the conversation produced it. A day filter filters messages only; polls bow out there and remain in the band.
- Creation: the composer's poll button opens `PollComposer` (question ≤120, 2–5 options ≤60, duplicates/blanks dropped), then `crypto.sealJson({q,o})` → `POST`. Sealing failures are surfaced in plain words, never downgraded to plaintext.
- The feed (Discuss tab) renders the same cards inline above the decisions strip.

**Frames.** `poll:new` / `poll:update` ride the existing SSE bus (`emitPollEvent`), carrying the full projected row (sealed payload + votes). `useTripComments` merges them **in place** — a vote must not reorder the list — and drops tombstones. `useTripEvents` gained `onPollEvent`.

**Tests:** `polls.test.ts` +8 — cap, sealed-shape walls (plaintext index and iv-less payload refused), open/removed/closed discrimination, creator-or-owner management, `upsertVote` (append/replace/no-op, never a duplicate), the projection contract (payload verbatim, `isYou` per viewer, tombstone emptied) and the zod shape rules. `routerCoverage.test.ts` pins the five new routes' rank floors. `smoke-f13.mts` — 33 live checks: membership walls, viewer 403s, plaintext refusals, create + `poll:new` frame, `isYou` for the creator vs another member, plaintext vote 409, vote/change/repeat/second member, `poll:update` frame, close rights + vote-after-close 409 + idempotent close, removal rights, payload emptied, removal hidden from the list, vote-on-removed 404.

**Verified:** backend `tsc --noEmit` clean, suite **293/293**; live `smoke-f13` **33/33 ALL PASS** (both frames included); frontend typecheck + build clean; SPA mirror refreshed (`ItineraryDisplay-BlDNfx6l.js` carries the poll copy).

**Deliberately not in this increment / honest limits:**

- **Who voted for what is visible to members.** With one conversation key, every member can open every vote — it is a show of hands, not a secret ballot. True anonymity needs a different trust model (votes sealed to the poll creator, or blind tokens); not attempted.
- **The poll creator can lie about the tally.** Tallies are computed client-side from the same rows by every device, so a member's *client* could render its own numbers; the data is consistent, the display is not verifiable. Same trust boundary as the rest of the chat.
- **A vote is only as fresh as its frame.** Votes are not paginated; the list is bounded by `POLL_MAX_PER_TRIP` (30), so a full fetch is cheap. A member offline for a long time gets the truth on the next `GET /polls`.
- **No vote deadline / auto-close, no multi-select, no ranked choice, no poll notifications.** Closing is manual by the creator or owner.
- **TravelAI cannot create polls** — the user chose member-created only, which keeps the F12d no-promises rule untouched.
- **A known pre-existing nit, unchanged:** decision frames still carry the actor's `isYou` view, so a live-pinned card can briefly show its Unmark affordance to other members (the server still 403s). Polls avoid the class entirely by shipping ids; fixing decisions the same way is a separate change.


### 12.17 F14 — profile editing: names, photos and a password that can change (user-requested, 2026-10-20)

The ask was *"user info editing feature including password reset name profile pic etc"*. Three gaps, one increment:

- **No display name existed.** Every label in the product (chat, decisions, polls, presence, members) was `emailLabel(email)` — the local part of the address. A person's email therefore leaked a little into every surface, and there was no way to be "Ada" instead of "ada".
- **No profile photo existed.** Avatars were always initials from those labels.
- **No password change existed.** `auth.service` could hash at signup and compare at signin, nothing else.

The scope was confirmed with the user first: **change the password in the app** (no mail provider exists, so an emailed reset link would be a fiction), **upload a real photo**, **a dedicated `/profile` page**.

**Display name (`User.name`, 1..40 chars).**

- `userLabel(user)` (`services/collab/comments.ts`) is the single label rule: **the name wins, else the email local part, else "Traveler"** — so accounts that never set a name read exactly as before. It clamps at 40 characters because labels travel into SSE frames and every projection.
- Threaded through one helper instead of scattering the rule: comments (`labelsFor`, create/edit/remove), decisions (list + promote + unmark), polls (labels for creators/voters), chat-key member rows, typing pings, presence heartbeats and the members list now all select `email name` and call `userLabel`.
- **Labels are projected per request, not baked into rows.** A rename therefore updates the whole history on the next fetch, with no backfill. Frames already in flight keep the label they were projected with — a cosmetic detail, not a correctness one.
- **The email is unchanged and still owner-only** in the members list; the name and photo are member-visible, because that is what a profile is for.

**Profile photo (`User.avatarUrl`).**

- `services/user/avatar.ts` reuses the receipt storage contract (Cloudinary when configured, `uploads/` otherwise) with narrower walls: **JPEG/PNG/WebP only**, **2 MB** (`AVATAR_MAX_MB`), magic-byte sniffing via the existing `sniffMime`, and a generated filename. No PDF path at all.
- Cloudinary gets a square **400px face crop** on upload (`w_400,h_400,c_fill,g_face`) and a public id derived from the account, so a replacement overwrites rather than orphaning the old one. The local fallback writes `avatar-<account>-<random>.<ext>` under `/uploads`.
- Only URLs this server wrote are ever stored (schema wall in the service). The client additionally only renders `/uploads/avatar-*` or `res.cloudinary.com` URLs (`lib/avatar.ts`), so a tampered response cannot turn an avatar into a request to a third-party origin.
- Replacing or removing a photo deletes the previous file best-effort; a failed cleanup never blocks the account write.

**Where it shows up.** A new protected `/profile` page (lazy route, navbar chip + mobile sheet entry) with three independent forms: photo (change/remove, optimistic local preview), display name (save/clear), password (current + new + confirm). The navbar chip is now an avatar + display name linking to it; avatars render in incoming chat bubbles, the live roster stack (drawer and trip header), and the members list (which now shows the name, with the email beside it for the owner only).

**Password change (`POST /api/auth/password`).** Current password re-checked with bcrypt, new one hashed at cost 12, same 6-character floor as signup, must differ from the current one. The session cookie is untouched, so this device stays signed in. A user-keyed limiter (10 attempts / 15 min) and an upload limiter (20 photos / hour) sit **after** `protect`, so they key on the account rather than a shared NAT. Profile routes are `protect`ed and CSRF-covered like every other write.

**Tests:** `profile.test.ts` +15 — label precedence/trim/clamp/fallback, live-only avatar on the comment projection, name normalization and the 40-char wall, both zod schemas (including new-password ≠ current), the image allow-list, filename derivation, managed-URL parsing (rejects `../`, foreign hosts and receipt URLs), magic-byte acceptance/refusal, the size default and override, and the exact `publicUser` key set (never `password`, never chat keys). Suite **308/308**. `smoke-f14.mts` — **32 live checks**: auth walls, whitespace collapse, 41-char refusal, the name reaching another member's chat row and members list (email still owner-only), the effective label, a text file renamed `.png` and a PDF both refused with 400, a real PNG stored and carried to another member's comment and the members list, removal clearing the reference, wrong/short/reused password refusals, the change cycle (old password stops working, new one works), restore, and clearing the name back to the email local part.

**Verified:** backend `tsc --noEmit` clean, suite **308/308**; live `smoke-f14` **32/32 ALL PASS** (Cloudinary storage active in this environment); frontend typecheck + build clean; SPA mirror refreshed.

**Deliberately not in this increment / honest limits:**

- **No emailed "forgot password".** There is no mail provider in this deployment; the flow offered is "change it while signed in". A locked-out user still has no self-service path, and adding one means a provider plus token storage, not a form.
- **A password change does not revoke other sessions.** The JWT is stateless and `protect` deliberately does no database read, so a token issued before the change stays valid until it expires (7 days). Revoking everywhere needs a per-request version check (or a session store) — a real cost traded away here, and stated in the UI.
- **The email is read-only.** It is the sign-in identity and there is no verification mail path; letting a typo change it would lock the account out silently. A verified email-change flow is a separate increment.
- **No image cropping/rotation UI.** The server face-crops for the chat sizes; the user picks a file.
- **Names are presentation only.** Authorization still uses `userId` everywhere; two members may share a name, and changing your name changes nothing about access.
- **`/auth/me` still returns the user document** (minus password) rather than the narrow `publicUser` projection; signin/signup and the profile routes return `publicUser`. Tightening `/me` is harmless follow-up work, not a behaviour change users can see.

### 12.18 F15 — TravelAI becomes findable: a visible way in, an `@` menu, one honest tip (user-reported UX gap, 2026-10-20)

The user asked whether typing `@` to reach the assistant is discoverable, and answered their own question: *"otherwise how will a first time user understand how to access the ai in the chat."* They were right. Before this increment the only entry point was knowing the exact token. The composer said "Message the trip…", typing `@` produced nothing, and nothing on screen mentioned TravelAI. A member who had never read the release notes could use the whole product and never learn the assistant existed.

**Three layers, one code path.** All three write the same literal (`@TravelAI `) through `insertMention`, so the server-side mention gate, the client-side disclosure and the ask flow are untouched.

- **A visible chip, only while the composer is empty** (`aiDiscovery`). `✨ Ask TravelAI` sits above the input in both shapes — the chat drawer and the Discuss tab. Tapping it types the mention at the caret and focuses the composer; the violet disclosure then appears and states exactly what the ask will send. It hides the moment there is a draft, so it never competes with someone typing, and it re-appears after sending. The chip is not a second send path: it starts an ask the same way typing the mention does.
- **An `@` menu** (`mentionTokenAt` + `mentionMenu`). Typing `@` — at the start or mid-sentence — opens one row: **TravelAI / Answers from the recent messages here**, with an `Enter` hint. Continuing to type filters by prefix (`@t`, `@tr`, …); `Enter` or `Tab` accepts, `Escape` dismisses without closing the drawer, pointer/tap accepts without stealing the caret. The menu is offered **only while the token is still a proper prefix of "travelai"**, so an email address or an `@name` in prose cannot trigger it, and once the full word is typed the menu is gone and `Enter` means send again. Accepting replaces the partial token, so `@tr` becomes `@TravelAI ` rather than `@TravelAI tr`.
- **A one-time tip.** Beside the chip, the first time: *"Each ask includes the last few messages here."* with a dismiss `×` remembered in `localStorage` (`travelai.aiHintDismissed`, per browser). No jargon, no lock icons, no mention of keys — the plain claim is true: the ask carries the last readable messages and the answer comes back into the thread.

**Guard rails added with the affordance.** Because a bare mention is now one tap away, `submit` refuses an ask whose text is only the mention (`"Add your question after @TravelAI."`) instead of posting a stray message that the server would reject. Insertion respects `COMMENT_MAX_LEN`, keeps a single space around a mid-sentence mention, and restores the caret after the token. Nothing is auto-sent; the mention remains the explicit, visible act.

**Tests / verification:** frontend-only change — no API, schema, or storage change. `npm run typecheck` clean, `npm run build` clean, SPA mirror refreshed. Manual matrix: chip in drawer/feed, empty and after send; `@`, `@t`, `@travel`, full `@travelai` (menu closes), mid-sentence insertion, Escape (menu only), Enter accepts then Enter sends, email-like prose (no menu), bare-mention send guard.

**Deliberately not in this increment / honest limits:**

- **No member mentions.** The menu lists the assistant only. `@`-mentioning a person would imply notifications and a member-picker that do not exist; adding the row without the behaviour would be a lie.
- **No arrow-key navigation.** One option makes Up/Down noise; `Enter`/`Tab`/tap cover it. A future multi-row menu should add roving focus and `aria-activedescendant`.
- **The tip is per browser, not per account.** A second device shows it once more; it is a coach mark, not a setting.
- **Viewers see no chip or menu** because they cannot send at all; the assistant is a participant in the conversation, not a read-only search box.
- **Discoverability stops at the chat.** The dashboard does not advertise the assistant, and the landing page does not mention it. This increment fixes the moment of use, not the marketing surface.

### 12.19 P0 — every new trip now carries its creator as owner (production bug, 2026-10-20)

A user-visible contradiction: generation finished, the dashboard toast said *"Failed to load your trips"*, and the new card answered **"Trip not found"** when opened. Duplicate had the same shape. The audit traced it to the Milestone 6 access migration, not to the AI or the dashboard.

**Root cause.** Generate, generate-stream and duplicate each created a `Trip` with `userId` (the creator/audit field) and left `members[]` at its `[]` default. Since sprint E4, `roleOf` reads `members[]` exclusively — deliberately, so a creator who leaves or transfers ownership loses access — and returns `null` for a trip with no member rows. The dashboard list query also matches `userId`, so the trip appeared; every trip-scoped route runs `requireTripRole`, found no row, and returned the standard no-access **404**. The `migrate:members` backfill repairs existing rows but was never a creation-time guard, so every new trip re-broke.

**The fix is a creation invariant, at the model layer.** `ensureCreatorMembership` (in `services/collab/access.ts`, next to `roleOf`) runs from a `Trip` `pre('validate')` hook. On **new documents only** it ensures the creator is present as `owner`: it prepends the row when absent, promotes a weaker creator row instead of duplicating it, and is idempotent. `isNew` is the safety wall — saving an existing trip must never resurrect a creator who transferred ownership or left. Putting it on the schema covers generate, stream, duplicate, seeds, scripts and any future creation path, rather than relying on three controllers to remember.

**The hand-off is now by id.** `TripPlanner` navigated with only `trip.tripDetails`, so the dashboard re-found the trip by `trip_title`. Two trips can share a title; the new route now passes `tripId` and the dashboard opens that exact document, falling back to the old title lookup only for a stale hand-off, then to a read-only preview and an explicit error if even that fails. It no longer reports a list-load failure when only the follow-up open failed.

**Tests / verification.** `tripMembership.test.ts` adds **10** tests: seven for the helper (seed, idempotence, preserve existing rows, promote a weaker creator, leave existing documents alone, no creator → no row, `roleOf` accepts the seeded owner) and three that import the real `Trip` model and call `validate()`, proving the hook is wired (new documents, prepend without loss, promotion). Suite **318/318**. A one-off save against a throwaway local database confirmed the persisted document has exactly one `owner` row and `roleOf` returns `owner`. Backend `tsc --noEmit` clean; frontend typecheck + build clean; SPA mirror refreshed.

**Deployment note.** This prevents *new* ownerless trips; it does not repair rows already in a production database. After deploying, run `npm run migrate:members` once with the production `MONGODB_URI`, then `backend/scripts/db-audit.mts` and confirm `legacyNoMembers` is **0** for every database. The local database audited here had 2 trips and 0 broken, so the production count is still unknown.

**Deliberately not in this increment / honest limits:**

- **No automatic backfill on boot.** A migration that mutates every trip database at startup is a larger operational decision; the idempotent script stays explicit and auditable.
- **No DB-backed integration test in CI.** The model test runs validation and the hook without a connection; there is still no test Mongo service in the pipeline.
- **Duplicate keeps the same creator.** The invariant seeds the duplicating account, which is the existing product behaviour; collaborator rows are not copied.
- **Legacy ownerless trips stay invisible until backfilled.** The dashboard still lists them via `userId` and opening still 404s; that is intentional (no access without a member row), and the backfill is the remedy.

### 12.20 P1 — collaboration truth: editors can edit, history is reachable, share state is honest (2026-10-20)

The Milestone 6 capability matrix said editors could edit the itinerary, but the only path for **add / delete / rename / TravelAI Apply** was the owner-only whole-document `PUT /:id`. Editors saw the controls (the UI only checks `canEdit`) and got a 403 on save. Three smaller truth gaps shipped alongside it: `TripVersions.tsx` existed but was imported nowhere, `ShareExportModal` never received the trip's active `shareId`, and the People tab turned a failed load into a toast plus a silent **0 members**.

**Editors now save content on an editor-ranked route.** `PUT /api/itinerary/:id/itinerary` accepts only `tripDetails`, runs `requireTripRole('editor', { withVersions: true, revMode: 'required' })`, and snapshots/versions exactly like the owner path. `PUT /:id` stays owner-only and remains the only route that can change `Trip.title` or `status`; the content handler only reads `tripDetails`, so those fields cannot ride along. The frontend's `handleSaveTrip` now calls `api.saveTripItinerary`, while `handleStatusChange` still calls `api.updateTrip`. Rename, add, delete and every TravelAI Apply (swap/move/update/title/budget/day tip) flow through the same `onSave` callback, so the capability matrix and the UI finally agree.

**History is a real tab.** `TripVersions` is mounted for every saved trip and visible to every member; restore is enabled only when `onSave` exists (editor+), matching the server's restore guard. A successful restore replaces the open itinerary and clears the dirty flag, and the parent trip is updated so `version`/`rev` stay current. The tab grid grows from 7 to 9 columns only when People/Chat are present.

**Share state round-trips.** `Trip.shareId` is now typed and flows Dashboard → `ItineraryDisplay` → `TripHeader` → `ShareExportModal`. The modal re-syncs from the open trip whenever it opens, and reports generate/revoke back through `onShareIdChange`, so reopening the dialog shows **Active** with the existing URL instead of "Not yet generated". The server still hides `shareId` from non-owners.

**The People tab fails visibly.** Members and invitations load separately: a member-list failure renders an inline red banner with **Retry** and hides the misleading empty list; an invitation failure leaves the loaded members in place and shows the same retry affordance. Successful actions still refresh through the existing `load()`.

**Tests / verification.** `routerCoverage.test.ts` asserts `PUT /:id/itinerary` is editor-ranked, loads `versions`, requires `baseRev`, and that `PUT /:id` remains owner-only. Backend suite **318/318**, `npm run build` clean; frontend `npm run typecheck` + `npm run build` clean; SPA mirror refreshed. Post-deploy manual matrix (not exercised in this offline increment): editor add/edit/delete/rename/Apply, viewer read-only history with restore hidden, owner generate → close → reopen shows the active link, revoke clears it, and a forced member-list failure (offline) shows Retry instead of "0".

**Deliberately not in this increment / honest limits:**

- **Content saves still send the whole `tripDetails` blob.** There are no per-activity POST/DELETE/swap endpoints yet. The required `baseRev` turns concurrent unrelated edits into an honest **409** (the existing reload path), not a silent merge; granular structural endpoints remain the long-term direction from Milestone 6 §3.3.
- **Editors can change content-level titles.** `tripDetails.trip_title`/budget are part of the itinerary blob and are covered by the AI title/budget proposals. `Trip.title` and `status` remain owner-only settings.
- **No version diff view.** History lists versions and restores them; it does not show field-level changes.
- **Share revoke is still one click.** There is no confirmation dialog yet; revoke is immediate and the modal now clears its state correctly.
- **No live member-list push.** The People tab fetches on open/retry, not on every membership event.
- **No automatic refresh of the dashboard list's share token** beyond the open trip row; a full list refetch remains the source of truth.

### 12.21 M7.3 — trust and deploy batch: honest charts, a real fallback, and confirmations (2026-10-20)

The audit's remaining P1s were mostly trust issues rather than missing features: one chart invented data, live collaboration silently disappeared when a feature flag was off, the health check reported healthy while the database was gone, search accepted raw regex input, and three irreversible actions still fired on one click.

**The budget tab no longer invents a daily rhythm.** `BudgetVisualizer` had a "Daily Spending Rhythm" bar chart built from `dailySpend * (0.85 | 1.00 | 1.15)` — a decorative pattern labelled *"Projected day-by-day cashflow based on activities and dining"*. No per-day cost exists in the itinerary model, so that chart was fiction. It is now **Category Totals**, a horizontal bar chart of the same five real budget lines as the donut, with the tooltip *"Planned allocation"*. The dead `daysCount` / `groupType` props were removed from the component and its call site.

**Live collaboration has a floor.** `render.yaml` now sets `ENABLE_TRIP_SSE=true` and declares the optional `CLOUDINARY_URL`. The client still discovers the tier through `/api/health`; when `collab.sse` is false (the local default, or any deployment that leaves the flag off), `useTripComments` polls comments, decisions, polls and the read marker every **20 s** while the tab is visible. Focus and tab-return trigger an immediate catch-up; a hidden tab makes no requests. The three surfaces use `Promise.allSettled`, so a single failing endpoint cannot blank the others, and every merge is race-aware: a response that started before a local edit, vote, close or removal cannot undo the newer local state. The same pass fixed a pre-existing typing-indicator bug — `ingestTyping` wrote a local `setTyping` state while `typingLabels` read `state.typing`, so the indicator never appeared and its expiry interval never started.

**Health tells the truth.** `utils/health.ts` maps Mongoose `readyState` onto one contract: only `connected` is **200 / healthy**; disconnected, connecting, disconnecting and unknown are **503 / unhealthy**. `success` follows the same value, so the SPA's `appFeatures()` probe also stops trusting a dead instance. `/api/health` additionally reports `receiptStorage.durable` (true only when Cloudinary is configured) and the Cloudinary folder, which is the field to check after a deploy. Absolute path and candidate-path diagnostics are now development-only.

**Search is literal.** `utils/escapeRegex.ts` escapes every metacharacter and the controller caps the query at 80 characters before building `$regex`, so a dashboard search cannot become an arbitrary pattern.

**Polish.** The profile page now clears the fixed navbar (`pt-24`, matching Dashboard/Planner) instead of hiding its title underneath it. The invite dialog no longer calls commenters "limited for now": it says they can chat, comment and vote in polls, matching the server's `commenter` rank. Removing a member, revoking an invite, and revoking a public share link now each ask for confirmation; transfer-ownership text prefers the member's display name over an email.

**Tests / verification.** `health.test.ts` +4 (connected, disconnected, startup/shutdown, unknown fails closed) and `escapeRegex.test.ts` +4 (all metacharacters, literal punctuation, no accidental group, ordinary words unchanged). Backend suite **326/326**, `npm run build` clean; frontend `npm run typecheck` + `npm run build` clean; SPA mirror refreshed. Post-deploy checks: `GET /api/health` must return **200** with `database: "connected"`, `collab.sse: true`, and `receiptStorage.provider: "cloudinary"` (and `durable: true`) when the Render env is complete.

**Deliberately not in this increment / honest limits:**

- **Polling is a fallback, not real time.** When SSE is off, remote comments can lag up to 20 s (or until focus). When SSE is advertised but the stream itself fails, this increment does not detect the failure and switch to polling; the next page load re-probes `/api/health`. `appFeatures()` is cached for the session, so changing the flag requires a reload.
- **`ENABLE_TRIP_SSE` in the blueprint is not proof of the running service.** Confirm the value in the Render dashboard and the `collab.sse` field of `/api/health`. Local development still defaults to false.
- **Cloudinary is only checked, not exercised, by health.** `provider`/`durable` reflect environment configuration; an upload is still the end-to-end proof. Without `CLOUDINARY_URL` the local fallback remains and uploads disappear on redeploy.
- **Health still exposes `resolvedPath` and the uploads directory.** They are no longer joined by cwd/candidate paths in production, but a tightened public payload could drop them entirely.
- **Confirmation does not add undo.** Removed members, revoked invites and revoked share URLs remain irreversible even after the dialog. Per-row activity/expense deletes are still one click; itinerary content can be recovered from History, expenses cannot.
- **No CSP was enabled.** This batch removes specific trust defects; turning on a Content-Security-Policy for maps, charts, Cloudinary images and the AI providers is a separate change with its own allow-list.
- **No browser smoke was run for this increment.** Verification was the unit suite, both builds, and the static SPA mirror; the polling and confirmation flows still need the post-deploy manual pass.

### 12.22 M7.4 — security and delete-safety batch: CSP, narrow session payload, throttled rebuilds (2026-10-20)

The M7.3 limits list named four concrete leftovers. This batch closes them rather than adding features: the app now ships a real Content-Security-Policy, `/auth/me` stops returning a user document, the last unthrottled AI route has a brake, production health stops advertising filesystem paths, and the two remaining one-click deletes ask first.

**CSP is an allow-list, not a suggestion.** `helmet` previously ran with `contentSecurityPolicy: false`. `backend/src/config/csp.ts` now defines the policy and exports the pure directive builder so it can be tested: `script-src 'self'` and `script-src-attr 'none'` (no inline scripts, no `eval`), inline styles allowed only because Recharts and Leaflet position elements with `style=""`, images from same-origin plus `data:`/`blob:`, Unsplash covers, Cloudinary assets and both tile providers (CARTO/Esri), and browser connections limited to same-origin plus Nominatim. `upgrade-insecure-requests` is production-only so a local HTTP build still works. The inline theme bootstrap moved to `frontend/public/theme-init.js`; it still runs before first paint and still prevents the theme flash, but no longer requires weakening `script-src`.

**`/auth/me` returns a profile, not a document.** The old query selected `-password` and shipped whatever else the schema held — `chatPubKey(s)`, `googleId`, `updatedAt`, and any future field. `getUserById` now selects only `email name avatarUrl createdAt` and runs the same `publicUser()` projection as signup/signin, so the session payload has one explicit shape. The existing projection test was widened to prove the chat keys and Google id stay absent.

**Day rebuilds are throttled.** `POST /:id/days/:day/indoor-alternative` spends a provider call per press and was the only AI path without a limiter. `dayAlternativeLimiter` allows 20 rebuilds per account per hour (user-or-IP key, F18 pattern), matching the generation window; the router-coverage suite pins the middleware to the route so a refactor cannot silently drop it.

**Health stops publishing absolute paths.** Production responses now omit `staticServing.resolvedPath` and `receiptStorage.localUploadsDir`; `enabled`, `envServeStatic`, provider, durability and folder remain, which is what a monitor or the SPA needs. Development keeps the full candidate-path diagnostics.

**Same-origin is no longer treated as a hostile CORS origin.** Enabling the CSP made the first browser smoke fail for a reason that pre-dated it: Vite's module scripts carry `crossorigin`, so the browser sends `Origin: <this host>` for the SPA's own JS/CSS. The strict allow-list only knew `FRONTEND_URL` (`:8080`), so a unified `SERVE_STATIC` server on `:5059` answered its own assets with **500**. The CORS middleware now uses an options delegate: it compares the `Origin` header with the request's own protocol/host (`isSameOriginRequest`) and reflects it, while every genuinely cross-origin call still goes through the exact allow-list. Same-origin is not a cross-origin read; the F1 protection is unchanged for real third parties.

**The last two row deletes confirm.** Removing an activity and removing an expense now open the same destructive `AlertDialog` pattern used for members, invites and share links. The activity copy names the day and points to History; the expense copy shows the amount and states plainly that expenses have no history and cannot be undone.

**Tests / verification.** New `csp.test.ts` (+4: scripts cannot regain `unsafe-*`, image list covers covers/avatars/tiles, Nominatim is the only external connection, upgrade-insecure-requests is production-only), router coverage (+1: the rebuild route carries its limiter), the CORS same-origin rule (+1), and the widened profile projection assertion. Backend suite **332/332**, `npm run build` clean; frontend `npm run typecheck` + `npm run build` clean; SPA mirror refreshed (including `theme-init.js`). Browser smoke on a local unified server: the landing page rendered with the deployed CSP, `theme-init.js` applied dark mode, and the only console error was `/api/auth/me`'s expected 401 while signed out. Production-mode `/api/health` returned 200 with `staticServing` reduced to `enabled`/`envServeStatic` and no uploads path. Still pending: signed-in map/budget/share views and both confirmation dialogs.

**Deliberately not in this increment / honest limits:**

- **The CSP assumes same-origin API and SPA.** `connect-src` is `'self'` plus Nominatim. A deployment that sets `VITE_API_URL` to a different origin *and* serves the SPA from this backend would have its API calls blocked. The documented unified deployment (`SERVE_STATIC=true` on Render) is same-origin; a split-origin SPA must set its own CSP at the static host.
- **Styles still allow `'unsafe-inline'`.** Recharts/Leaflet style attributes need it today; removing it would require a nonce/hash migration from inline `style` props, not a config change.
- **New third-party origins require a policy edit.** Adding a tile provider, font CDN or image host now fails closed until `config/csp.ts` and its test list are updated. That is the intended trade.
- **Delete confirmation is not undo.** It prevents mis-taps, but neither action has a restore path; expenses in particular are gone for good. Undo would require server-side tombstones or a soft-delete ledger.
- **The throttle is per process.** Like the other `express-rate-limit` brakes, counters reset on restart and are not shared across instances; a multi-instance deployment needs a shared store.
- **The same-origin bypass trusts the proxy's host/protocol.** It is computed with `trust proxy` + `Host`, which is correct on Render and localhost. A reverse proxy that rewrites `Host` or lies about `X-Forwarded-Proto` could make a foreign origin look same-origin; the fix is a correct proxy configuration, not a wider allow-list.
- **`/auth/me` narrows the payload, not the session.** Already-issued JWTs still stay valid after a password change; revocation remains future work.
- **Still no decryptable session revocation, notifications, password reset, account deletion, chat attachments or CI.** Those remain the post-M7 roadmap, not regressions.

### 12.23 M7.5 — the home page speaks traveler, not engineer (2026-10-22)

The landing page still explained the product to the people who built it: provider names, map libraries, chart libraries, JSON, streaming, presets and algorithms. A first-time traveler could read the whole page and not learn the one thing that makes TravelAI different — that the assistant is inside the trip conversation, not a separate chatbot tab.

**The page now answers three plain questions.** The hero says what the product does in one sentence (“Plan a whole trip with the people you're going with — and ask for changes right in the chat”). A three-step strip explains the actual sequence: describe the trip, get a day-by-day plan, then invite people and ask TravelAI for changes together. Every step is written in traveler language, not implementation language.

**The chat preview is the argument.** `LandingChat` shows a realistic trip thread: two travelers discussing a day, the `@TravelAI` mention, a short answer about moving a rainy-day plan, and an inline poll. It includes the exact privacy line — *“Messages are end-to-end encrypted.”* — without claiming that the mock is a live conversation. The preview is the only place on the page that shows how the assistant is reached; the feature cards then point back to that same behaviour.

**Jargon removed.** The page no longer names Gemini, Groq, Leaflet, Recharts, JSON, streaming, presets or algorithms. Those are real parts of the implementation, but they are not reasons for a traveler to trust or use the product. The rewrite keeps the concrete benefits (fast plans, shared edits, private chat, live polls) and drops the stack tour.

**Verification.** Frontend `npm run typecheck` and `npm run build` clean; the SPA mirror was refreshed. Browser smoke covered signed-out and signed-in landing pages in both dark and light themes, including the chat preview, privacy line and both calls to action.

**Deliberately not in this increment / honest limits:**

- **The chat preview is a static component, not a live demo.** It demonstrates the interaction and privacy copy but does not call the AI or open a real trip.
- **No new screenshots or marketing assets.** The page still uses the existing hero image and typography.
- **The navbar still says “AI 2.5.”** It is the last technical-looking label on the public page; renaming it to “Assistant” is a follow-up, not part of this copy pass.
- **Discoverability still ends at the chat.** §12.18 makes the assistant findable inside a trip; the landing page now explains it, but there is still no in-dashboard coach mark outside the chat.

### 12.24 F10 — chat-key recovery that tells the truth (2026-10-22)

A fresh browser profile proved the honest limit of the automatic key exchange: if a device has no envelope for the current trip key and no other open device can re-wrap it, the chat stayed on *“Chat is unlocking on this device…”* forever. Reconnect looped, polls stayed disabled, and the UI offered no way forward. The cryptography was behaving as designed; the product was not.

**Recovery is a new epoch, not a backup code.** While the device is keyless, the composer notice now says plainly that this device cannot open the chat and that messages sent now are unprotected. **Try again** still re-runs the automatic path. A second, quieter action — **Still stuck? Start a new chat** — opens a destructive confirmation, then mints the next conversation key, wraps it for every device currently published on the trip, and saves it through the existing `PUT /chat/keys` route. On success the device is immediately `ready`, polls re-enable, and the normal privacy line returns.

**What is preserved and what is not.** The new key is wrapped locally for every member device; the server still receives only public keys and ciphertext envelopes, so it cannot read the new chat either. The private half never leaves the browser and no recovery secret is stored. But messages sealed under the old key stay unreadable: this is a forward move, not history recovery. The confirmation says that before anything changes. The action is only offered while keyless, and the hook refuses to run if a working conversation key is already present, so recovery can never downgrade a healthy chat.

**Because the whole trip moves epochs, honesty matters.** If another device is simply offline, reopening its chat usually heals this device automatically; the dialog tells the user that. If they reset anyway, all current devices receive the new key and older messages remain locked for everyone. The server already allowed higher epochs and its `assertEpochTransition` contract is unchanged. A concurrent reset from another device produces the existing **409**; the UI reports that the chat changed and asks the user to try again rather than silently retrying into a different key.

**Verification.** Local unified server with the SPA mirror refreshed. Starting from a cleared browser identity: keyless notice and both actions appeared; reset produced epoch **2**, envelopes for all three published device keys of the single account, `Poll` enabled and no lock notice. A full page reload then auto-unlocked from the new self-envelope without another reset, proving the wrap/unwrap round-trip rather than only the status flag. Frontend `npm run typecheck` and `npm run build` clean.

**Deliberately not in this increment / honest limits:**

- **Lost history is permanent.** There is no escrow, password-derived key, recovery code or server-side copy; those would change the threat model. The only recovery for old messages is another device that still holds the old key and is open.
- **Recovery rotates the trip, not one message.** Every current device is moved to the new epoch. A device that never comes back cannot read anything sealed after the reset.
- **No automatic “you seem stuck” prompt.** The recovery link is always visible while keyless, but the app does not count failures and offer it as a modal.
- **No multi-epoch keyring.** Clients keep only the current conversation key; old messages are not decrypted in the background. A future keyring would be required to read history across rotations.
- **The server still trusts any member to publish a higher epoch.** That was already true of the key route; this increment makes the client path usable, not the authorization model stricter.
- **No second-account viewer test here.** The local verification used one account and multiple published devices; member-side unlock still needs a two-account manual pass.

### 12.25 M7.6 — the read-only viewer pass, and the last version badge (2026-10-22)

The previous increments kept deferring the viewer matrix because it needs a second account. This pass created a disposable one, invited it as a **viewer**, accepted the token, and walked every trip tab before removing the account again.

**The read-only shape was correct.** The dashboard listed the trip under **Shared with me** with a `Viewer` badge. Opening it showed every tab but removed every write affordance found: no Save, Add, Edit, Delete, Invite, role picker or poll composer; Expenses had no add form; Chat had no textarea and no Send/Poll buttons. The chat still showed the exact privacy line and the viewer explanation. Version History was visible, and no Restore control appeared. People listed both members and offered **Leave trip** but no owner controls.

**Three copy defects surfaced because the second role finally looked at the same screens.** With no messages, the chat empty state still said *“No messages yet — start the conversation above”* to a viewer who had no composer. The read-only notice said *“ask the owner to change your role to comment”* instead of naming the commenter role. Version History promised *“Restore any snapshot to roll back your itinerary”* and *“Your first edit … will create a restorable snapshot”* to a viewer who can do neither. The empty state now drops the call to action when `canWrite` is false, the notice says *“make you a commenter,”* and the history copy branches on `canRestore` to point viewers at the owner/editors.

**The last version badge is gone.** The navbar chip that read **AI 2.5** now reads **Assistant**, and the PDF footer says **TRAVELAI · ASSISTANT**. Neither is a model version; the old label implied a precision the product does not claim.

**Verification and cleanup.** Backend `npm run migrate:members` was re-run locally: it reported 0 trips to backfill, and `db-audit.mts` reported `legacyNoMembers = 0` for the `travelai` database (2 trips). The viewer left through the normal route, the invite was revoked, and the disposable user, its read marker and the revoked invite row were deleted directly from the local database. The trip is back to one owner. Frontend `npm run typecheck` and `npm run build` clean; the SPA mirror was refreshed and the fixes were smoke-checked as the owner.

**Deliberately not in this increment / honest limits:**

- **No populated version list was tested as a viewer.** The trip had no snapshots, so the check proved the Restore control is absent when `canRestore` is false, not that an existing version row hides its action.
- **No commenter/editor second-account pass.** This covered the lowest role; commenter chat/polls and editor saves still need their own disposable accounts.
- **The viewer can read the chat.** Read-only means no writes; it does not mean the transcript is hidden. A viewer who joins after a key epoch receives an envelope like any other member.
- **Account cleanup was direct-database, not a product feature.** There is still no account deletion or self-service data export; the test user was removed with a one-off local script.
- **No CI coverage for role-shaped UI.** These checks were manual; the server route guards remain the automated part.

### 12.26 CI — the suite runs on every push (2026-10-22)

Every verification so far was a local command run by hand. A regression could merge as long as the person pushing remembered to run the suite. `.github/workflows/ci.yml` now runs the same checks on pushes to `main`, pull requests, and manual dispatches: `npm ci`, the **332-test** backend suite, the backend TypeScript build, frontend `typecheck`, and the frontend Vite build. The root `npm run verify` mirrors those steps locally, so the command in the workflow and the command a developer runs are the same intent.

**CI does not need a database or provider keys.** The backend tests are dependency-free by design; they exercise pure helpers, schemas, route tables and model validation without opening Mongo or calling Gemini, Groq, Cloudinary, OpenStreetMap or Nominatim. That is why the job can run on a bare GitHub runner. The frontend build also uses no secrets; Vite reads only the checked-in code at build time.

**Two deliberate boundaries.** CI runs the workspace build, not `build:frontend`, because that root script copies `frontend/dist` into `backend/public`; a CI checkout has no business rewriting the deploy mirror. It also does not deploy, migrate a database or call production health: those still need Render/Atlas credentials and a human decision. Concurrency cancels an older run on the same ref, and the job is capped at 15 minutes.

**Verification.** `npm run test:backend` passed **332/332** locally, `npm run verify` is the CI-equivalent local command, and the workflow file is the only new runtime surface. No application code or bundle changed in this increment.

**Deliberately not in this increment / honest limits:**

- **No DB-backed integration tests.** The suite still does not start Mongo or exercise a real request/response cycle; that needs a service container and a disposable database.
- **No browser or E2E tests.** The viewer, recovery, map, PDF and CSP checks remain manual browser passes.
- **No frontend component tests.** There is no Vitest/RTL harness; `typecheck` and `build` catch type and bundling breaks, not behaviour.
- **No coverage gate.** The 332 tests run, but no threshold fails a PR for dropping coverage.
- **No deployment verification.** A green workflow means the code compiles and the unit suite passes, not that Render, Cloudinary, Atlas, SSE or the CSP behave correctly in production.
- **No dependency or secret scanning.** `npm audit`, CodeQL and secret scanning are separate workflows not added here.
