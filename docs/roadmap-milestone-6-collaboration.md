# Milestone 6 — Collaboration & Trip Sharing

**Status:** approved. **Milestone 6 is complete: E1–E5 all shipped and verified** (E4 = concurrency + live tier, E5 = hardening pass). **Phase E6 (comments) SHIPPED: F6a backend + F6b frontend, both verified.**

**Scope:** let more than one person plan the same trip — invite people, assign what they can do, edit the itinerary together without overwriting each other, and track who changed what.

**Reading order:** §1 defines the feature. §2 audits what the code does today. §3 is the target architecture. **§4 is the flaw register — the part that answers "check every flaw"**. §5 is the sprint plan. §6–§9 are testing, migration, rejected options and config. §10–§12 are residual risks, open decisions and the recommendation.

> **On "no loopholes".** No design is provably loophole-free, and claiming otherwise would be dishonest. What this design *can* do is make loopholes structurally hard to introduce and loudly visible if someone tries:
> 1. **One authorization choke point.** Every trip-scoped request passes through a single guard. The 2 duplicated helpers and ~20 inline ownership filters that exist today are deleted.
> 2. **A CI test that walks the Express router stack** and fails if any trip-scoped route lacks a role guard (§6.3). A new endpoint that forgets a guard breaks the build.
> 3. **An explicit residual-risk register** (§10) listing what is still *knowingly* unsolved.
>
> That is the strongest guarantee available. Everything else is flagged in §4 with evidence.

---

## 1. The feature

### 1.1 Three sharing modes that must never be conflated

The single most common way this feature goes wrong is treating "sharing" as one thing. TravelAI needs three distinct, non-overlapping modes:

| Mode | Audience | Auth | Persistence | Exists today |
|---|---|---|---|---|
| **Private** | the creator only | yes | `userId` | ✅ |
| **Members** | authenticated collaborators with roles | yes | `members[]` | ❌ **this milestone** |
| **Public link** | anyone with the URL (read-only, no account) | no | `shareId` + `isPublic` | ✅ (partially — no revoke) |

They are independent: a trip can have members *and* an active public link, and the public link must never expose anything that only members may see (expenses, member emails, the share link itself).

### 1.2 Jobs to be done

- *"My partner and I are planning the same trip — we shouldn't have to trade screenshots."*
- *"I planned it, but my friend knows the city and should be able to swap day 3."*
- *"Show my family the plan, but don't let them change it."*
- *"Let my sibling add what they paid, without letting them delete the itinerary."*
- *"Who changed day 4, and can we undo it?"*

### 1.3 Roles and the permission matrix

Role rank is the security primitive: `viewer 0 < commenter 1 < editor 2 < owner 3`. A route declares the minimum rank it needs.

`commenter` ships in the type but has no UI until comments exist (Phase E6); it is reserved so no data migration is needed later.

| Capability | owner | editor | commenter | viewer | public link |
|---|:--:|:--:|:--:|:--:|:--:|
| View the itinerary | ✅ | ✅ | ✅ | ✅ | ✅ |
| View expenses / settlement | ✅ | ✅ | ✅ | ✅ | ❌ |
| View who else is on the trip | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add / edit / delete activities, reorder days | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI "indoor alternative" for a day | ✅ | ✅ | ❌ | ❌ | ❌ |
| Expenses, custom routes, travellers, currency | ✅ | ✅ | ❌ | ❌ | ❌ |
| Restore an old version | ✅ | ✅ | ❌ | ❌ | ❌ |
| Comment | ✅ | ✅ | ✅ | ❌ | ❌ |
| Rename trip / change status | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete trip | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite / remove people, change roles | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create or revoke the public link | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ |
| See AI generation metadata / quality score | ✅ | ❌ | ❌ | ❌ | ❌ |

Two deliberate calls:

- **Viewers see the money.** A traveller in the group who cannot see what the room costs is not actually on the trip. The public link still shows nothing financial.
- **Editors cannot delete or re-share.** Deleting is irreversible and re-sharing is a privacy action. Owner-only.

### 1.4 Invitations

Two channels, deliberately asymmetric:

- **Invite link (primary).** The owner generates a link and sends it however they like — WhatsApp, SMS, email. Zero new infrastructure, and it matches how this audience actually communicates. Optionally bound to one email address and optionally single-use.
- **Email invite (optional, Phase E5).** Requires a transactional email provider. Recommended: Resend (HTTP API, ~3,000 emails/month free, no SMTP setup). This is the only new third-party dependency the milestone needs, and it is optional.

---

## 2. Current-state audit

### 2.1 What exists

| Concern | Reality |
|---|---|
| Ownership | `Trip.userId: ObjectId` (required, indexed) is the only ownership field. |
| Enforcement | Inline `Trip.findOne({ _id, userId: req.userId, isDeleted: { $ne: true } })` in `itinerary.controller.ts` (~20 sites), plus a `findOwnedTrip()` helper **duplicated** in `expense.controller.ts:28` and `route.controller.ts:14`. |
| Auth | `protect` (`middleware/auth.middleware.ts`) verifies a JWT from an httpOnly cookie or Bearer header and sets `req.userId: string`. No roles anywhere. |
| `User` | `{ email, password, googleId, timestamps }`. **No name, no roles, no deleted flag.** |
| Public link | `shareId` (unique, sparse) + `isPublic`; `POST /:id/share` creates it; `GET /api/itinerary/shared/:shareId` serves a narrow allow-list projection. **No revoke endpoint.** |
| People | `Trip.participants: [{ _id, name, isMe? }]` — **free-text names for expense splitting, not linked to users**. |
| Versioning | `version: number` + `hasEdited` + `versions[]` (`select: false`), snapshot on itinerary content change. |
| Concurrency | **None.** Last write wins. No revision, no `If-Match`, no optimistic locking. |
| Rate limiting | `authLimiter` (10 / 15 min / IP) and `generateLimiter` (20 / hour / IP). |
| Frontend | React Query v5 (`staleTime` 5 min, `refetchOnWindowFocus: false`). Routes `/`, `/auth`, `/plan`, `/shared/:shareId`, `/dashboard` (only protected route). |
| Email / realtime | **Neither exists.** No mailer dependency, no websocket/SSE anywhere. |

### 2.2 What blocks collaboration

1. **Access is a `userId` equality check in 20 places.** There is no policy object to extend, so adding roles means touching every site — and missing one is a silent security hole.
2. **A trip has exactly one possible viewer-relative field** (`isMe`) stored on the document — already incorrect once two people look at the same trip.
3. **No conflict detection**, so two editors on day 3 silently destroy each other's work.
4. **`GET /api/itinerary` filters on `userId`**, so a shared trip would never appear in the collaborator's dashboard.
5. **The trips list returns whole documents** including the full expense ledger, which will grow with members.
6. **The public payload is an allow-list** (good) but has no contract test, so adding a field to `tripDetails` could leak it anonymously.

---

## 3. Target architecture

### 3.1 Data model

**`Trip` — additions only** (no field is removed, so existing documents stay readable):

```ts
export type TripRole = 'owner' | 'editor' | 'commenter' | 'viewer';

export interface ITripMember {
  userId: Types.ObjectId;          // ref User
  role: TripRole;
  invitedBy?: Types.ObjectId;
  joinedAt: Date;
}

export interface ITrip {
  // --- unchanged ---
  userId: Types.ObjectId;          // creator; audit trail + back-compat only
  // --- new ---
  members: ITripMember[];          // authoritative access list
  rev: number;                     // optimistic-concurrency counter (default 1)
}
```

New indexes:

```ts
tripSchema.index({ 'members.userId': 1, isDeleted: 1, createdAt: -1 });
```

**Why keep `userId` instead of replacing it.** It is the creator, it preserves the existing index and every existing query during rollout, and it lets the access helper treat the creator as owner even before the backfill runs (§7). It is never used for authorization once §3.2 lands.

**Why `members` instead of a separate `TripMember` collection.** Membership is always read together with the trip (every access check needs the role), bounded (≤ 25), and never queried independently. A separate collection would add a join to the hottest path for no benefit.

**Why not derive members from participants.** `participants` are free-text names for splitting money and must survive a member being removed (their past expenses still count). Members are authenticated identities. Merging them would corrupt the ledger. Instead, link them (§3.9).

**`TripInvite` — new collection:**

```ts
export interface ITripInvite {
  tripId: Types.ObjectId;    // indexed
  tokenHash: string;         // sha256(raw token) — unique, indexed
  tokenHint: string;         // first 6 chars, for the owner's own list UI
  role: Exclude<TripRole, 'owner'>;
  kind: 'link' | 'email';
  email?: string;            // lowercased; binds the invite when kind === 'email'
  createdBy: Types.ObjectId;
  expiresAt: Date;           // TTL index (expireAfterSeconds: 0)
  maxUses: number;
  acceptedBy: Types.ObjectId[];  // atomic $addToSet; its length enforces maxUses
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**The raw token is never stored.** A database dump therefore cannot be replayed into trip access. `tokenHash` is the lookup key; `acceptedBy` makes usage accounting exact and race-free (§3.5).

### 3.2 The authorization choke point

One module owns all trip-access decisions. Nothing else may query `Trip` for access.

```ts
// backend/src/services/collab/access.ts

export const ROLE_RANK: Record<TripRole, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };

/** The caller's role, or null when they have no access at all. */
export function roleOf(trip: Pick<ITrip, 'userId' | 'members'>, userId: string): TripRole | null {
  const member = (trip.members || []).find((m) => String(m.userId) === String(userId));
  if (member) return member.role;
  // Pre-backfill fallback: the creator is always the owner (removed in E5).
  return String(trip.userId) === String(userId) ? 'owner' : null;
}

export function can(role: TripRole | null, min: TripRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Loads a trip the caller may see, or throws 404 (never 403 — no existence leak). */
export async function loadTripForMember(
  tripId: string,
  userId: string,
  opts: { withVersions?: boolean } = {}
): Promise<ITrip> { /* findOne({_id, isDeleted:{$ne:true}}) then roleOf() check */ }

/** Guard factory used by the router. */
export function requireTripRole(min: TripRole, opts?: { withVersions?: boolean }): RequestHandler
```

**404 vs 403.** No access at all → **404**, identical to a nonexistent trip, so trip ids cannot be probed. A member who lacks the *rank* for an action → **403**, because they already know the trip exists and a useful error beats a confusing one. This distinction is deliberate and must be documented in the API docs.

**`requireTripRole` also does the concurrency check** (§3.6) so no controller can forget it, and stashes the loaded document on `req.trip` so controllers reuse one query instead of re-scoping:

```ts
if (min !== 'viewer' && baseRev !== undefined && Number(baseRev) !== trip.rev) {
  return res.status(409).json({ success: false, code: 'REV_CONFLICT', currentRev: trip.rev, updatedAt: trip.updatedAt, message: '...' });
}
req.trip = trip;
```

### 3.3 Route guard matrix

Every trip-scoped route declares its minimum rank. `requireTripRole` is applied at the **router**, not inside controllers.

| Route | Guard |
|---|---|
| `GET /api/itinerary` | `protect` + membership filter in the query |
| `GET /api/itinerary/:id` | `requireTripRole('viewer')` |
| `PUT /api/itinerary/:id` | `requireTripRole('owner')` |
| `DELETE /api/itinerary/:id` | `requireTripRole('owner')` |
| `POST /api/itinerary/:id/duplicate` | `requireTripRole('viewer')` (any member may fork) |
| `POST /api/itinerary/:id/share` | `requireTripRole('owner')` |
| `DELETE /api/itinerary/:id/share` **(new)** | `requireTripRole('owner')` |
| `PUT /:id/activities`, `PUT /:id/activities/reorder`, `PUT /:id/days/reorder` | `requireTripRole('editor')` + rev |
| `POST /:id/days/:day/indoor-alternative` | `requireTripRole('editor')` + limiter |
| `GET /:id/versions`, `GET /:id/versions/:v` | `requireTripRole('viewer', { withVersions: true })` |
| `POST /:id/versions/:v/restore` | `requireTripRole('editor', { withVersions: true })` + rev |
| `POST /:id/feedback` | `requireTripRole('owner')` (see F12) |
| `GET /:id/insights` (aggregate) | `protect` (owner-scoped query — see F17) |
| `GET/POST/PUT/DELETE /:id/expenses*` | `requireTripRole('editor')` |
| `PUT /:id/participants` | `requireTripRole('editor')` + rev |
| `PUT /:id/finance` | `requireTripRole('editor')` |
| `GET /:id/weather-routing` | `requireTripRole('viewer')` |
| `POST/PUT/DELETE /:id/routes*` | `requireTripRole('editor')` |
| `GET /:id/members` **(new)** | `requireTripRole('viewer')` |
| `POST/GET/DELETE /:id/invites*` **(new)** | `requireTripRole('owner')` |
| `PATCH/DELETE /:id/members/:userId` **(new)** | `requireTripRole('owner')` |
| `DELETE /:id/members/me` **(new)** | `requireTripRole('viewer')` + owner blocked |
| `POST /:id/transfer` **(new)** | `requireTripRole('owner')` + rev |
| `GET /:id/events` **(new, E4)** | `requireTripRole('viewer')` |
| `GET /api/itinerary/shared/:shareId` | **public** (`isPublic` only — unchanged) |
| `POST /api/invites/:token/accept` | `protect` + token validation |
| `GET /api/invites/:token` | `protect` + token validation |

> **Route-ordering trap:** `/members/me` must be declared **before** `/members/:userId`, and `/shared/:shareId` and `/insights` before `/:id`. Express matches in declaration order, so a misplaced route silently turns `me` into a userId. The coverage test (§6.3) asserts the ordering.

**New top-level router** `invites.routes.ts` mounted at `/api/invites` — the token identifies the resource, not the trip, so it does not belong under `/api/itinerary`.

### 3.4 API surface

| Method | Path | Rank | Body / notes |
|---|---|---|---|
| `GET` | `/api/itinerary?scope=owned\|shared\|all` | member | adds `role` to each row |
| `GET` | `/api/itinerary/:id` | viewer | returns `rev`, `role`, `members` (projection varies by caller) |
| `POST` | `/api/itinerary/:id/invites` | owner | `{ role, kind, email?, maxUses?, ttlHours? }` → returns the raw link **once** |
| `GET` | `/api/itinerary/:id/invites` | owner | hashes + hints only, never raw tokens |
| `DELETE` | `/api/itinerary/:id/invites/:inviteId` | owner | revoke |
| `GET` | `/api/itinerary/:id/members` | viewer | role-dependent projection |
| `PATCH` | `/api/itinerary/:id/members/:userId` | owner | `{ role }` — cannot demote the last owner |
| `DELETE` | `/api/itinerary/:id/members/:userId` | owner | remove |
| `DELETE` | `/api/itinerary/:id/members/me` | viewer | leave; owner gets 409 "transfer first" |
| `POST` | `/api/itinerary/:id/transfer` | owner | `{ toUserId, baseRev }` |
| `GET` | `/api/invites/:token` | auth | preview (trip title, role, inviter) — **does not consume a use** |
| `POST` | `/api/invites/:token/accept` | auth | consume + join (idempotent) |
| `GET` | `/api/itinerary/:id/events` | viewer | SSE (E4) |

### 3.5 Invitation mechanics

**Token.** `crypto.randomBytes(32)` → base64url (256 bits). Only `sha256(token)` is stored. Entropy makes brute force infeasible; the acceptance endpoint is rate-limited anyway.

**Redemption — idempotent, race-free, ordered for the safe failure direction:**

```ts
const hash = sha256(rawToken);
const invite = await TripInvite.findOne({ tokenHash: hash, revokedAt: null, expiresAt: { $gt: now } });
if (!invite) throw new AppError('This invite link is invalid or has expired.', 404);   // generic

// (a) Email binding
if (invite.email && invite.email !== user.email.toLowerCase())
  throw new AppError('This invitation was sent to a different email address.', 403);

// (b) Already a member → success, no use consumed (makes double-click harmless)
const already = await Trip.findOne({ _id: invite.tripId, 'members.userId': userId });
if (already) { ensureRoleAtLeast(already, userId, invite.role); return 200; }   // never downgrade

// (c) Add membership first (idempotent via the $ne guard), THEN claim the use.
await Trip.updateOne(
  { _id: invite.tripId, isDeleted: { $ne: true }, 'members.userId': { $ne: userId } },
  { $push: { members: { userId, role: invite.role, invitedBy: invite.createdBy, joinedAt: new Date() } } }
);

// (d) Claim the use atomically — $expr makes reads and writes one operation,
//     so two concurrent accepts cannot both pass a maxUses check.
const claimed = await TripInvite.findOneAndUpdate(
  { _id: invite._id, revokedAt: null, expiresAt: { $gt: now },
    $expr: { $lt: [{ $size: '$acceptedBy' }, '$maxUses'] } },
  { $addToSet: { acceptedBy: userId } },
  { new: true }
);
if (!claimed) throw new AppError('This invite link is no longer valid.', 410);
```

**Why membership before the claim.** Without multi-document transactions (unavailable on a standalone MongoDB — see §8), a crash between the two writes is possible. Ordering them this way makes the failure mode *"a member was added but a use was not counted"* — bounded, owner-revocable, and harmless. The reverse order would silently swallow an invitation. No transaction is worth requiring a replica set for local development.

**Why `$expr` + `$addToSet` instead of a counter.** A `uses: {$lt: maxUses}` filter plus `{$inc: {uses:1}}` is *not* atomic against a concurrent read-then-write, and it double-counts a user who accepts twice. Sized-array comparison in a single `findOneAndUpdate` is atomic and deduplicates naturally.

**Single-use vs multi-use.** `maxUses: 1` for "invite this specific person"; a larger value for a group link. Default from `INVITE_DEFAULT_MAX_USES`.

**Token handling in the browser.** The frontend reads the path segment, immediately `POST`s it, then `history.replaceState`s the URL to strip it, so it never lingers in history or leaks via `Referer`. Helmet already sets `Referrer-Policy: no-referrer`.

### 3.6 Concurrency

**Mechanism: a monotonic `rev` + a 409 on mismatch.** Deliberately *not* a CRDT (§8).

- `rev` starts at 1 and increments on **every** write to the trip document.
- Enforced centrally by schema hooks so no controller can forget:
  ```ts
  tripSchema.pre('save', function () { if (this.isModified()) this.rev = (this.rev ?? 1) + 1; });
  for (const op of ['findOneAndUpdate', 'updateOne', 'updateMany'] as const) {
    tripSchema.pre(op, function () { this.setUpdate({ ...this.getUpdate(), $inc: { ...(this.getUpdate().$inc ?? {}), rev: 1 } }); });
  }
  ```
- Clients send `baseRev`. **Required** where a stale write can destroy work: itinerary content, reorders, day moves, version restore, participant replacement, ownership transfer. **Optional** for id-addressed writes (one expense, one route), where the worst case is losing a concurrent edit to *that one item* and the response carries the new `rev`.
- Any direct `updateOne`/`findOneAndUpdate` outside the hooks is a hole, so §6.3 includes a test asserting `rev` increments across every write path.

**Why not the whole-document `PUT` as the collaboration primitive.** It maximises the conflict surface: two people editing unrelated days both rewrite the entire `tripDetails` blob. The app already has granular endpoints (activity, reorder, day move, route, expense) — collaboration should push *more* work through them, not less. `PUT /:id` becomes owner-only metadata.

**Conflict UX.** 409 → toast *"This plan changed while you were editing"* with **Reload latest**, plus the existing version history to see what happened. Optimistic UI rolls back to the server's `rev`.

### 3.7 Notifications and presence

**Phase E4 ships presence only — not collaborative editing.**

- **Awareness tier (E4a):** `refetchOnWindowFocus` enabled for the trip query, `refetchInterval` ~20 s while the editor is open, and `rev`-driven invalidation. Cheap, no new infrastructure.
- **Live tier (E4b):** `GET /api/itinerary/:id/events` — **SSE**, not WebSocket. Native `EventSource`, works over plain HTTP, no dependency, auto-reconnects. Emits `{type:'trip:updated', rev}` and `{type:'presence', users:[…]}`. Auth via the existing cookie (`withCredentials: true`).
- Presence uses an in-process map with a TTL (`PRESENCE_TTL_MS`, 30 s) refreshed by heartbeat. **Presence is never an authorization input** — it is decoration; the guard remains the only gate.
- **Scaling limitation, stated openly:** the in-process bus does not cross multiple server instances. With one instance (current Render setup) it is correct; with horizontal scaling it degrades to "no live presence" while `rev` conflicts keep data correct. Redis pub/sub is the upgrade path.

**Version restore and collaboration.** Restoring an old version must snapshot the *current* state first (append-only history) so a restore is never destructive and is itself undoable, and it must bump `rev` so other open clients see it. Verify the existing `restoreTripVersion` does the former.

### 3.8 Frontend architecture

```
pages/InviteAccept.tsx                 /invite/:token  — preview, join, redirect-if-signed-out
components/dashboard/TripMembers.tsx   member list, role change, remove, leave, transfer
components/dashboard/InviteDialog.tsx  role picker, expiry, single/multi-use, copy link, QR
hooks/useTripAccess.ts                 role → canEdit / canManageMembers / canDelete / isOwner
```

- **`useTripAccess` is cosmetic only.** It hides or disables controls; the server decides. Stated here because "the UI hides the button" is a classic thing to mistake for authorization.
- Dashboard gains a **"Shared with me"** section (trips where `role !== 'owner'`) with a role badge.
- Editing components are already gated on optional `onSave`/`readOnly` props — collaboration reuses that path, so a viewer gets a genuinely non-editable render, not just hidden buttons.
- **Sign-in round-trip:** `/invite/:token` while signed out → `/auth` with `state.from` (the existing `ProtectedRoute` pattern) **plus `sessionStorage`**, because a full page reload drops router state.
- **Cache hygiene:** clear the React Query cache on logout and on user change (see F21).

### 3.9 Reconciling members with expense participants

Two sources of truth for "who is on this trip" is a design smell, so link rather than merge:

- `ITripParticipant` gains `userId?: Types.ObjectId`.
- When a member joins, the server links them to an existing participant by name or creates one. Removing a member **unlinks** their participant (keeps the name) so historical expenses and settlement stay valid.
- Fix the existing `_id` churn bug first (F4) — it is a prerequisite for member removal not corrupting the ledger.

---

## 4. Flaw register

Severity: **Critical** = data loss / account compromise · **High** = wrong results or a security hole under realistic conditions · **Medium** = degraded UX or latent risk · **Low** = hygiene.

### 4.1 Critical

| # | Flaw | Evidence | Mitigation |
|---|---|---|---|
| **F1** | **Credentialed CORS accepts any `*.vercel.app` / `*.onrender.com` origin, and production cookies are `SameSite=None`.** Any attacker can deploy a free `evil.vercel.app` page, make `fetch(..., {credentials:'include'})` calls to the API, read the response, and mutate trips. There is no CSRF token anywhere. Trip data is exfiltratable today; with collaboration an attacker could add themselves as a member. | `index.ts:53-66` (suffix allow-list + `credentials: true`), `auth.controller.ts:13` (`sameSite: 'none'` in prod) | Replace suffix matching with a strict explicit allow-list **and** add an `Origin`/`Sec-Fetch-Site` verification middleware, **and** move to a same-origin deployment with `SameSite=Lax`, **and** add a double-submit CSRF token on state-changing routes. Ship as E1.0 — before members exist. |
| **F2** | **Authorization is scattered across 2 duplicated helpers and ~20 inline `userId` filters.** Extending it to roles means touching every site; one miss is a silent access-control hole. There is no policy object and no test that a route is guarded. | `expense.controller.ts:28`, `route.controller.ts:14`, `itinerary.controller.ts` (20 sites) | §3.2 single choke point; §6.3 router-coverage test that fails CI; ESLint `no-restricted-syntax` banning `userId: req.userId` outside the access module. |
| **F3** | **No concurrency control.** Two editors on the same trip silently overwrite each other; `PUT /:id` sends the whole `tripDetails` blob. Data loss with no error and no detection. | No `rev`/`__v`/`If-Match` anywhere; `updateTrip` writes the whole object | §3.6 `rev` + schema hooks + 409; granular endpoints; UI conflict recovery. |

### 4.2 High

| # | Flaw | Evidence | Mitigation |
|---|---|---|---|
| **F4** | **`updateTripParticipants` regenerates every participant `_id`,** orphaning `shares[].participantId` and `paidBy` on **custom-split** expenses (equal splits are recomputed, custom ones are not). Settlement then computes against participants that no longer exist. Pre-existing bug; member removal would trigger it constantly. | `expense.controller.ts:333-336` (new subdocuments ⇒ new `_id`s); only `splitMode === 'equal'` is re-derived (line 341) | Match by `_id` and preserve ids; never recreate the array. Validate that removed ids are unreferenced, or reassign explicitly. Add a settlement regression test. **Prerequisite for E2.** |
| **F5** | **`isMe` is stored per-document but means "the person looking at this screen".** Only one viewer can ever be "me". | `Trip.ts:51`, `expense.controller.ts:335`, `TripParticipant.isMe` | Derive "me" client-side from `participant.userId === currentUser.id`; stop writing/trusting `isMe`. Keep the field readable for legacy data. |
| **F6** | **`sanitizeTrip` only deletes `versions`.** It is not role-aware, so once members exist it would ship every member's email, the `shareId` (letting a viewer re-share a private trip) and `generationMeta` to everyone. | `utils/sanitizeTrip.ts:6-9` | Make it `sanitizeTripFor(trip, role)`: an **allow-list** projection. `shareId`/`isPublic` owner-only; full member emails owner-only; `generationMeta` owner-only; public-link projection unchanged and separate. Add a contract test. |
| **F7** | **A public link can never be revoked.** Once `POST /:id/share` runs, `isPublic` stays true forever; only deleting the trip removes it. | `itinerary.controller.ts:839-865`; no revoke route | `DELETE /:id/share` (owner) → `isPublic = false`, clear `shareId` (old URLs die permanently). |
| **F8** | **Collaboration turns AI endpoints into a shared cost centre.** The AI indoor-alternative endpoint has **no rate limiter**; `generateLimiter` covers only `/generate*`. A recruited "editor" could burn quota indefinitely. | `itinerary.routes.ts:157` (no limiter), `rateLimiter.middleware.ts` | Require `editor` rank **and** add a per-trip + per-user AI limiter; keep the existing cache. |
| **F9** | **The dashboard lists only trips where `userId === me`,** so a shared trip would never appear. Feature-blocking. | `itinerary.controller.ts:365-368` | `$or: [{ userId: me }, { 'members.userId': me }]` + `role` per row + `?scope=`. |

### 4.3 Medium

| # | Flaw | Evidence | Mitigation |
|---|---|---|---|
| **F10** | **The client never refetches on focus and caches for 5 minutes,** so a collaborator's changes are invisible until a manual reload. | `App.tsx:19-26` | Enable `refetchOnWindowFocus` and a ~20 s `refetchInterval` for the trip-detail query only, plus `rev`-driven invalidation. |
| **F11** | **`shareId` is 48 bits and the public endpoint is unauthenticated and unrate-limited.** Guessing is impractical online but weak by modern standards, and there is no abuse brake. | `itinerary.controller.ts:854` (12 hex chars), route has no limiter | 16 random bytes (128 bits) for new links; old links keep resolving; add a limiter to the shared endpoint. |
| **F12** | **`feedback` is a single per-trip field,** so with collaborators only one opinion can exist and the endpoint is writable by any owner-adjacent caller. | `Trip.ts:94` | Owner-only in E1; per-user `feedbacks[]` as a later change. |
| **F13** | **Unbounded embedded arrays** (`versions`, `expenses`, `members`, `customRoutes`) push toward Mongo's 16 MB document ceiling; each version snapshot is a full itinerary. | `Trip.ts:236-268` | Cap `versions` (keep the newest N, e.g. 30) and page `expenses` when it grows. Raise now so it is a known boundary. |
| **F14** | **The public payload omits `customRoutes`** while `SharedTrip.tsx` passes `trip.customRoutes` — drawn routes silently never render on shared pages. | `itinerary.controller.ts:881-887` vs `SharedTrip.tsx:127` | Add `customRoutes` to the public projection (it is not sensitive) and assert the projection in a contract test. |
| **F15** | **No email capability at all,** so email invites require a new dependency. Not a bug — a scope fact. | `backend/package.json` (no mailer) | Link invites are the primary channel; Resend only if email invites are wanted (§1.4). |
| **F21** | **The React Query cache is never cleared on logout or user change.** On a shared browser, the next user can be served the previous user's trips from memory for up to 5 minutes. | `UserContext.tsx:124-138` (`logout` only calls `setUser(null)`); no `queryClient.clear()` | `queryClient.clear()` on auth change. |

### 4.4 Low

| # | Flaw | Evidence | Mitigation |
|---|---|---|---|
| **F16** | The trips list returns **whole documents** including the full expense ledger. Grows with members and expenses. | `itinerary.controller.ts:382` | Later: return a `TripSummary` projection; keep the full fetch for the detail view. |
| **F17** | **`GET /insights` scope becomes ambiguous** — it aggregates `userId: me`, but after collaboration should "trips I can see" include trips I merely edit? That would expose someone else's generation cost/quality metadata. | `itinerary.controller.ts:726` | Keep it **owner-only** and say so. |
| **F18** | **`authLimiter` and `generateLimiter` are per-IP.** A shared college/office NAT can lock everyone out, and per-IP limits are the wrong shape for invite endpoints that are per-user. | `rateLimiter.middleware.ts` | Key invite limiters on `userId` with an IP fallback; keep IP for `authLimiter` but raise the ceiling or key on IP+email. |
| **F19** | **Deleting an owner's account would orphan trips and invites.** No delete-account endpoint exists today, so this is latent — but collaboration makes "the owner vanished" a real state. | No delete-account route; `User` has no `isDeleted` | When account deletion is built: block it for owners with members, or auto-transfer, or keep trips readable. Record the dependency. |
| **F20** | **A `shareId` collision would throw a duplicate-key error (500).** 48 bits makes it rare, not impossible. | `itinerary.controller.ts:854` + unique index | Retry generation on `11000`; 128-bit ids make it moot. |
| **F22** | `authLimiter`'s 10/15 min is counted per IP, so a legitimate user behind a shared egress can be locked out. Pre-existing; noted because invite actions add more auth-adjacent traffic. | `rateLimiter.middleware.ts:3-13` | Consider IP+email keying. |

### 4.5 Flaws considered and closed *by design* (not left to chance)

| Risk | Why it cannot happen |
|---|---|
| Invite token recovered from a database leak | Only `sha256(token)` is stored; the raw value is shown once and never persisted. |
| Two concurrent accepts both passing a `maxUses` check | `$expr: {$lt:[{$size:'$acceptedBy'},'$maxUses']}` and `$addToSet` execute as one atomic operation. |
| Double-clicking "Join" consuming two uses | Already-a-member returns early without claiming a use. |
| An invite escalating someone to owner | `TripInvite.role` excludes `owner` at the type **and** schema level. |
| A viewer re-sharing a private trip | `shareId` is stripped by `sanitizeTripFor` for non-owners, and `POST /:id/share` requires owner rank. |
| A removed member keeping access via cache | Every trip request re-checks membership server-side; the UI shows "you no longer have access" on 404. |
| A trip left with zero owners | Removing/leaving/demoting the last owner returns 409; ownership transfer is a single atomic `$set` of both members. |
| An orphaned member entry from a partial write | Members are matched by `userId` with `$ne` guards, so re-running any write is idempotent. |
| Trip existence probing via errors | No access ⇒ 404, identical to a nonexistent trip. |
| Token leaking through `Referer` | Immediately `replaceState`d away; helmet sends `Referrer-Policy: no-referrer`. |
| A route silently missing a guard | §6.3 router-coverage test fails the build. Signing out | see | 128b | | |
| A new trip route written after this milestone | Same coverage test — it fails until a rank is declared. |

---

## 5. Execution plan

Five sprints, each independently shippable and independently reversible.

### E1 — Authorization core *(no user-visible change)*

**Goal:** replace scattered ownership checks with one policy, add `rev`, and fix the security prerequisite. Single-user behaviour must be byte-identical at the end.

- **E1.0 Security prerequisite:** F1 — strict CORS allow-list, `Origin`/`Sec-Fetch-Site` verification, `SameSite=Lax` with a same-origin deployment, CSRF double-submit token. *Can ship alone.*
- `services/collab/access.ts` — `roleOf`, `can`, `loadTripForMember`, `requireTripRole`.
- `Trip.members[]` + `Trip.rev` + the `{ 'members.userId': 1, isDeleted: 1, createdAt: -1 }` index.
- `rev` schema hooks (`pre('save')` + `pre('findOneAndUpdate'|'updateOne'|'updateMany')`) and 409 mapping in the error handler.
- **Delete** both `findOwnedTrip` copies and every inline `userId: req.userId` trip filter; controllers consume `req.trip`.
- `sanitizeTripFor(trip, role)` (F6) with the owner-only fields stripped.
- Migration script + `npm run migrate:members` (§7).
- Tests: role matrix (table-driven), guard behaviour (404 vs 403), `rev` hooks on every write path, sanitizer projections, **router-coverage** and **route-ordering** tests.

**Exit criteria:** full existing suite green; new tests green; a request as a non-owner to any trip route returns 404; any trip route without a guard fails a test.

*Effort: L. Risk: the refactor touches ~25 call sites — mitigated by the coverage test landing before the refactor.*

### E2 — Membership and invitations *(backend)*

**Goal:** the API can express everything in §1.3–§1.5.

- `TripInvite` model, indexes, TTL.
- `services/collab/invites.ts` — token mint/hash/verify, `redeemInvite()` per §3.5.
- `controllers/collab.controller.ts` — members CRUD, role change, remove, leave, transfer, invite create/list/revoke, invite preview/accept.
- `routes/invites.routes.ts` + new trip routes in the correct order.
- `GET /` membership scoping + `role` + `?scope=` (F9).
- Participant linking (`userId`) and the F4 `_id`-preservation fix.
- Rate limiters keyed on `userId` (F18) + `TRIP_MAX_MEMBERS` cap.
- Tests: invite lifecycle, expiry, revoke, email binding, `maxUses` races (concurrent `Promise.all` accepts), idempotent re-accept, last-owner protection, transfer atomicity, participant-id preservation + settlement regression.

*Effort: L. Risk: the atomicity of membership-then-claim — covered by ordered writes + a concurrent-accept test.*

### E3 — Collaboration UI

- `useTripAccess`, `TripMembers`, `InviteDialog`, `pages/InviteAccept` (`/invite/:token`), `App.tsx` route.
- Dashboard "Shared with me" section + role badges.
- Gate editing components on rank via the existing `onSave`/`readOnly` props; hide owner-only controls.
- `queryClient.clear()` on auth change (F21); `refetchOnWindowFocus` for the trip query (F10).
- Invite link copy + QR; token stripped from the URL after use.
- Types: `Trip.rev`, `Trip.role`, `TripMember`, `TripInvite`, `InvitePreview`.

*Effort: L. Risk: none structural — the read-only rendering path already exists.*

### E4 — Concurrency and live awareness

- Enforce `baseRev` on content mutations; 409 responses; optimistic-UI rollback.
- Conflict toast + "Reload latest" + link to version history.
- E4a: polling/refetch; E4b: SSE `/:id/events` + presence TTL + avatar stack behind `ENABLE_TRIP_SSE`.
- Tests: 409 on a stale `baseRev`; two sequential writers; SSE connect/disconnect and TTL expiry.

*Effort: M. Risk: SSE is single-instance only — documented, and correctness never depends on it.*

### E5 — Hardening and the rest of the register

- F7 revoke link, F11 128-bit ids + limiter, F14 public projection fix, F17 insights owner-only, F20 collision retry, F13 versions cap.
- Optional: **email invites** via Resend (`RESEND_API_KEY`, `EMAIL_FROM`) + a provider abstraction so it can be disabled.
- Remove the `roleOf` pre-backfill fallback once the backfill is confirmed everywhere.
- Optional: `User.name` so the members UI has a human label instead of an email local-part.

*Effort: M.*

### Dependency order

```
E1.0 (security) ─┐
E1 (access core) ┴─► E2 (invites + members) ─► E3 (UI) ─► E4 (concurrency + presence) ─► E5 (hardening)
                     ▲
                     └── F4 participant-id fix must land here
```

---

## 6. Testing strategy

1. **Unit — policy.** `roleOf`/`can` table-driven across every role × capability in §1.3. Pure functions, fast, exhaustive.
2. **Unit — invite logic.** Token mint/hash round-trip, expiry boundary, revoke, email binding, `maxUses` arithmetic, and a **concurrent redemption test** (`await Promise.all([accept(), accept()])` asserting exactly one use is consumed).
3. **Unit — `rev`.** Assert the counter increments on `save()`, `findOneAndUpdate`, `updateOne` and `updateMany`, and that a stale `baseRev` yields 409.
4. **Unit — sanitizer.** For each role, assert `shareId`/`isPublic`/`generationMeta` are absent for non-owners and full member emails are owner-only; assert the public projection is an exact allow-list (a "no new field leaks" contract test).
5. **Structural — the anti-loophole tests (most valuable here):**
   - **Router coverage:** walk `itineraryRoutes.stack`, find every route whose path contains `:id`, and assert its handler chain includes a `requireTripRole` guard tagged `__tripGuard`, against an explicit allow-list (`/shared/:shareId`). Also assert every *non*-`/:id` trip route is intentional.
   - **Route ordering:** assert the resolved order puts `/members/me` before `/members/:userId`, and `/shared/:shareId` and `/insights` before `/:id`.
   - **No direct ownership filters:** grep/ESLint assertion that `userId: req.userId` appears only inside `services/collab/`.
6. **Regression — the ledger.** Extend the settlement suite to prove that adding/removing members and participants never corrupts custom splits (F4) or `paidBy`.
7. **Integration — end to end.** Owner invites → second account accepts → edits a day → owner sees it with a new `rev` → removed member gets 404. Against a real test database.

---

## 7. Migration and rollout

**Backfill** (`backend/scripts/backfill-members.ts`, `npm run migrate:members`) — idempotent, one aggregation-pipeline update:

```js
await Trip.updateMany(
  { 'members.0': { $exists: false } },
  { $set: {
      members: [{ userId: '$userId', role: 'owner', invitedBy: null, joinedAt: '$createdAt' }],
      rev: { $ifNull: ['$rev', 1] },
  } }
);
```

Safe to run repeatedly; matches only documents with no members.

**Zero-downtime order:**
1. Deploy the schema + indexes (additive; old code ignores them).
2. `roleOf` keeps the creator fallback, so authorization is correct with **or** without the backfill.
3. Run the backfill.
4. Deploy the code that lists by membership (F9). Until step 3 completes, the `$or` query covers both shapes.
5. Remove the fallback in E5 once the backfill is verified.

**Rollback:** every step is additive. Reverting the code leaves `members`/`rev` populated but ignored, and the old `userId` path still works — `userId` is never dropped.

---

## 8. Explicitly rejected options

| Option | Why rejected |
|---|---|
| **CRDT / Yjs / Automerge real-time editing** | Requires replacing the persistence model and reworking the AI-generated JSON blob (a coarse, deeply nested object with string arrays) into fine-grained ops. Enormous rewrite for a feature whose real conflicts are rare and coarse ("we both edited day 3"). `rev` + granular endpoints + history covers it. Revisit only if simultaneous editing becomes the norm. |
| **Pessimistic locking** ("trip is locked while someone edits") | Hostile for asynchronous collaborators and creates stuck locks after a closed tab. |
| **Whole-document `PUT` as the collaboration primitive** | Maximises the conflict surface. Use the granular endpoints instead. |
| **Email-only invitations** | Deliverability risk, a new dependency, and the audience lives on WhatsApp. Link-first, email optional. |
| **Replacing `userId` with `members`** | Forces a destructive migration and breaks the existing index and queries during rollout. Keep `userId` as creator/audit. |
| **Reusing `Trip.version` for concurrency** | It is the user-visible itinerary-history counter, and restore semantics depend on it. Conflating it with a concurrency token breaks restore. Hence a separate `rev`. |
| **Multi-document MongoDB transactions for invite acceptance** | Requires a replica set; standalone local MongoDB would break. Idempotent ordered writes plus a documented bounded window instead. |
| **Making `participants` the member list** | Free-text names vs authenticated identities, and participants must outlive membership for the ledger. Link instead of merge. |
| **Trusting a client-supplied role** | The guard reads the role from the database on every request. The client's role is for rendering only. |
| **WebSocket** | SSE is sufficient, simpler, dependency-free, and reconnects natively. |
| **Storing raw invite tokens** | A database leak would become trip access. Hash only. |

---

## 9. Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRIP_MAX_MEMBERS` | `25` | Cap per trip (abuse + document size). |
| `INVITE_TTL_HOURS` | `168` | Default invite lifetime (7 days). |
| `INVITE_DEFAULT_MAX_USES` | `1` | Single-use by default. |
| `INVITE_LINK_BASE` | `FRONTEND_URL` | Base URL used to build the invite link. |
| `INVITE_CREATE_PER_HOUR` | `30` | Per-user invite-creation limiter. |
| `AI_DAY_LIMIT_PER_HOUR` | `10` | Per-user AI day-alternative limiter (F8). |
| `PRESENCE_TTL_MS` | `30000` | Presence heartbeat expiry (E4). |
| `ENABLE_TRIP_SSE` | `false` | Feature flag for the live tier. |
| `VERSIONS_MAX` | `30` | Cap retained version snapshots (F13). |
| `RESEND_API_KEY`, `EMAIL_FROM` | — | Only if email invites ship (E5, optional). |

---

## 10. Residual risks (knowingly unsolved)

1. **Not real-time.** Two people editing the same day within the polling window both hit a 409 and one redoes their edit. Accepted; alternative rejected in §8.
2. **Presence is single-instance.** Correct on one server, degraded on many; never a correctness dependency.
3. **No transaction boundary.** A crash between "add member" and "claim use" over-counts a use. Bounded, ordered, and documented.
4. **`rev` completeness depends on the hooks.** A future direct `collection.updateOne` (bypassing Mongoose) would not bump `rev`; the hook test covers Mongoose paths only.
5. **Member emails are visible to the owner** (masked for other members). Adding `User.name` is the cleaner fix; deferred.
6. **Feedback remains single-valued** per trip until `feedbacks[]` (F12).
7. **F19** becomes real only when account deletion exists.
8. **A determined owner can still take a screenshot.** Everything above protects access control, not the humans holding the data.

---

## 11. What "done" looks like

- I can invite someone by link, they join with the role I chose, and both of us can edit without silently overwriting each other.
- A viewer genuinely cannot change anything, even with a crafted request.
- An invitation can be revoked and expires; a removed member loses access immediately.
- A public link shows the itinerary and nothing financial, and can now be revoked.
- I can see who changed what, and undo it.
- Every trip-scoped route is provably guarded by a test, not by review.
- The Critical CORS/CSRF flaw (F1) is closed.

---

## 12. Open decisions

1. **Scope of the first sprint.** E1 (access core + security prerequisite) only, or E1+E2 together?
2. **Email invites?** Link-only (no new dependency) or add Resend in E5?
3. **Fix the pre-existing bugs now or separately?** F1 (CORS/CSRF, Critical) and F4 (participant `_id` churn) are not collaboration features but are prerequisites for doing this safely.
4. **Comments** (the `commenter` role) — in scope for this milestone or a later one? → Later. Landed in E1–E5; the plan is drafted in **§19 (Phase E6)**.


---

## 14. E1 — shipped (appendix)

> Ship notes, 2026-10-18. Anything that differs from the blueprint above is listed under **Deviations** (§14.2); everything else matches §3.

### 14.1 What landed

| Area | Result |
| --- | --- |
| `services/collab/access.ts` | Roles/ranks (`viewer(0) < commenter(1) < editor(2) < owner(3)`), capability matrix (`TRIP_CAPABILITIES`), `can()`/`roleCan()`, `roleOf()` with the creator fallback and a test that a corrupted member role grants nothing. |
| `middleware/tripAccess.middleware.ts` | `requireTripRole(min, { withVersions, revMode })` — one authorization choke point. Loads the doc once, 404-vs-403 semantics per §3.2, optional `baseRev` → 409 `REV_CONFLICT` (machinery live; `required` mode flips on in E4), stashes `req.trip`/`req.tripRole`. Tagged `TRIP_GUARD_TAG` for CI. `tripContext(req)` gives controllers the guarded document and fails loudly (500) when a route forgot its guard. |
| Router | Every `/:id…` route in `itinerary.routes.ts` declares its guard: `viewer` reads, `editor` content writes, `owner` settings/delete/share/feedback; `duplicate` requires only viewer. `withVersions` replaces the old `+versions` selects. |
| Controllers | All 3 controllers read `req.trip` — zero `Trip.findOne` left in controllers. `duplicateTrip` response is sanitized; `getSharedTrip` moved to `services/collab/publicTrip.ts`. |
| Trip model | `members[] (userId, role, invitedBy?, joinedAt)` + index `{'members.userId':1, isDeleted:1, createdAt:-1}` + `rev (default 1)` with hooks: `pre('save')` bumps on modified non-new saves; `findOneAndUpdate`/`updateOne`/`updateMany` merge `$inc: {rev:1}` (operator-aware, including the no-$ shorthand form). |
| Sanitizer | `sanitizeTripFor(trip, role)` — owner output identical to the old `sanitizeTrip`; non-owners never see `shareId`, `isPublic`, `generationMeta` (F6 first cut). |
| **F1 fix** | CORS: exact allow-list only (`services/collab/httpOrigins.ts`; `*.vercel.app`/`*.onrender.com` suffix matching deleted; `ALLOWED_EXTRA_ORIGINS` + comma-separated `FRONTEND_URL` opt-in). CSRF: double-submit (`middleware/csrf.middleware.ts`) — `csrf` cookie issued app-wide, `GET /api/auth/csrf` returns the token in the body (works for the cross-origin Vercel→Render SPA), `X-CSRF-Token` required on writes (Bearer-token and signup/signin/logout/csrf exempt). Frontend `api.ts` fetches/caches the header, self-heals on a 403/refresh. |
| **F4 fix** | `reconcileParticipants()` keeps surviving participants' `_id` — via echoed `_id` (schema passes it through) or a same-name match against an unclaimed existing row; removed rows are dropped as before; equal splits re-derived. Frontend `ExpenseTracker` now echoes `_id`s. |
| Migration | `scripts/backfill-members.ts` (`npm run migrate:members`) — idempotent aggregated `updateMany` via the raw collection so rev hooks don't double-count; `$createdAt`/`$$NOW` fallback note for MongoDB < 5. |
| Verification | Build clean · **150/150** backend tests · frontend `tsc --noEmit` clean. **Live smoke test**: health OK, `csrf` issues a token, signup (exempt) 201, authenticated POST without header 403, with header 400 (validation) → the defense works; wildcard `evil.vercel.app` preflight rejected, known origin 204 with the right allow-origin. Smoke data removed afterward. |

### 14.2 Deviations from the blueprint

1. **CSRF token instead of SameSite=Lax.** The doc proposed cookie hardening via `SameSite=Lax`; with the SPA deployed cross-origin that signs users out (cross-site `fetch` stops sending the cookie). The double-submit token closes the same CSRF hole without touching deployment. Cookies stay `SameSite=None` in production (unchanged).
2. **Full-document loads in the guard.** A few handlers previously did narrow `.select()` projections (`expenses participants finance`); they now consume the whole guarded document — one query instead of two, no second source of truth.
3. **Lists unchanged.** `getUserTrips`/`getTripInsights` stay creator-scoped (`Trip.find`); membership-aware listing lands with E2 (F9) per the plan.
4. **Guard tag placement.** `TRIP_GUARD_TAG` is set on the *outer* handler Express mounts (the `catchAsync` wrapper), so the coverage test introspects exactly what runs.

### 14.3 Honest limits

- `baseRev` is accepted but **not yet required** (clients don't send it yet) — the schema + guard machinery is live; `revMode: 'required'` flips on in E4 together with frontend rev plumbing.
- `roleOf`'s creator fallback keeps legacy trips working **before** `migrate:members` runs; run it once per environment, after which it is a safety net only.
- The strict CORS allow-list means **Vercel preview deployments** no longer get access implicitly — list them explicitly in `ALLOWED_EXTRA_ORIGINS` (documented in `backend/.env.example`).
- Unknown roles in `members[]` grant nothing (tested); anonymous users can never pass `can()` (tested).

## 15. E2 — shipped (appendix)

> Ship notes, 2026-10-18. Members, invites, ownership transfer and the membership-aware dashboard landed. Everything below the line matches §3 §3.4/§3.5/§3.9 unless flagged under **Deviations** (§15.2).

### 15.1 What landed

| Area | Result |
| --- | --- |
| `models/TripInvite.ts` | `tripId, tokenHash (unique), tokenHint, role, kind (link/email), email, createdBy, expiresAt, maxUses, acceptedBy[], revokedAt`. **The raw token is never stored** — only `sha256(token)`; a DB leak cannot be replayed into trip access. Model-level validate block makes an `owner` invite un-mintable. TTL index on `expiresAt` (`expireAfterSeconds: 0`). |
| `services/collab/invites.ts` | Mint (256-bit base64url) → hash → hint; `createTripInvite` (email invites forced single-use); `revokeTripInvite`; `previewInvite` (never consumes); **`redeemInvite` per §3.5**: token lookup → email binding (403) → already-member short-circuit (idempotent, no use consumed, role *upgraded* if the invite ranks higher, never downgraded) → real `TRIP_MAX_MEMBERS` cap (409) → membership-first guarded write (`members.userId $ne` idempotency) → use claimed atomically with `$expr { $lt:[{$size:$acceptedBy}, $maxUses]}` + `$addToSet` (lost race → 410). |
| `services/collab/members.ts` | Pure invariant rules + participant plumbing: emails to the owner only in `projectMembers`; `assertRoleChange` (PATCH can never assign `owner` or touch an owner); `assertMemberRemoval`; `assertLeave` (owner must transfer first); `resolveTransfer`; `performTransfer` = promote-then-demote (two hook-driven writes; a transient 2-owner window is safe, a 0-owner window is not); `linkParticipant` / `unlinkParticipant`. |
| `controllers/collab.controller.ts` + routes | Trip-scoped: `GET/DELETE /:id/members/me`, `GET /:id/members`, `PATCH/DELETE /:id/members/:userId`, `POST /:id/transfer`, `POST/GET/DELETE /:id/invites*` — all guarded on the router (`me` declared before `:userId`, covered by the ordering test). Token-identified `GET /api/invites/:token` + `POST /api/invites/:token/accept` mounted at their own router: the invite **is** the authorization there (hashed lookup + expiry + revocation), and `TripInvite.role` still cannot be `owner`. |
| F9 (dashboard) | `GET /api/itinerary` now accepts `?scope=owned\|shared\|all` (default `all`) over `$or: [creator, members.userId]`; each row is annotated with `roleOf(trip, caller)` and passed through `sanitizeTripFor`, so a shared member never receives `shareId`/`isPublic`/`generationMeta` in the list either. Search composes under `$and` instead of clobbering the scope filter. |
| F18 (limiters) | `inviteManageLimiter` (30/h), `inviteAcceptLimiter` (20/15min), `invitePreviewLimiter` (60/15min) — **user-keyed** with IP fallback. |
| Participant linking (§3.9) | `participants[].userId` added to the schema; on accept, a matching **unlinked** participant (email local-part name) gets `userId`; member removal unlinks without deleting; `reconcileParticipants` now carries `userId` across re-saves so the F4 `_id` fix never silently unlinks people. |
| Config | `TRIP_MAX_MEMBERS=25`, `INVITE_TTL_HOURS=168`, `INVITE_DEFAULT_MAX_USES=1` (documented in `.env.example`/README). |
| Tests | `services/collab/invites.test.ts` (token hygiene, owner-role un-mintable via schema + model validate, clamp knobs, invariants beyond rank, ledger linking/unlinking); `routerCoverage.test.ts` extended: 8 new guarded-rank spot checks, `me`-before-`:userId` ordering, plus a new structural test asserting **zero `Trip.findOne`/`findById` in controllers**. |
| Verification | Build clean · **161/161** backend tests · frontend `tsc --noEmit` clean. **Live smoke test** (`scripts/smoke-e2.mts`, throwaway data, self-cleaning): 31/31 checks — owner-role invite rejected, invite minted with hint only, preview without consuming, accept → editor member, idempotent re-accept without consuming, `?scope=shared` row with `role: editor` and owner-side fields hidden, member emails owner-only, editor rank-blocked from inviting/role-changing, viewer→editor PATCH, member link survives participant re-save, transfer to a non-member refused, transfer promotes/demotes correctly, new owner can't leave without transferring, editor leaves cleanly. |

### 15.2 Deviations from the blueprint

1. **Transfer is two writes, not one atomic `$set` of both members.** `bulkWrite` bypasses the mongoose rev hooks (§3.6 needs `rev` to move on every write). Promote first, then demote: the transient window has *two* owners — the safe direction — instead of the zero-owner window a single write would raster differently.
2. **Participant linking does not invent rows.** §3.9 sketches "link by name **or create one**"; an unmatched member creates nothing — silently adding a "john.doe" participant to the expense ledger nobody entered would corrupt counts nobody asked for. Unlinked members simply don't appear in splits until the owner adds them (or names align).
3. **Member emails are owner-only in the members list** (masked nothing for others — the field is absent). The doc's "full emails owner-only, masked for editors" was simplified to absence for non-owners; nothing E3-planned needs masked emails, and absence cannot leak.
4. **The transfer's old-owner fallback role is `editor`.** §12 left the role open; editor keeps work-in-progress rights while making unambiguous who owns the trip now.
5. **`ensureRoleAtLeast` (re-accept upgrade) added.** Not explicit in §3.5: an editor member re-opening a *viewer* invite that ranks lower simply keeps their role (no downgrade — matches the doc), and an invite that ranks *higher* upgrades them in place; both idempotent, neither consumes a use.

### 15.3 Honest limits

- Redemption accepts the doc's bounded failure mode: a member can join in the window where the use-claim then loses the race (they stay a member while `usedCount < acceptedBy` by one). Owner-revocable and harmless; surfaced in `projectInvite` as consistent counts.
- `GET /api/itinerary` list rows are still full documents (F16 projection tightening is E5).
- Transfer/promote writes do not yet take a `baseRev` check — `revMode: 'required'` flips on globally in E4.
- Invite TTL index: Mongo runs TTL once per minute, so an expired invite may exist visibly for up to ~60s; redemption already treats expiry as authoritative.
- The writing smoke script (`scripts/smoke-e2.mts`) mutates the real DB by design (throwaway docs, and cleans up after itself); keep it out of CI.

## 16. E3 — shipped (appendix)

> Ship notes, 2026-10-18. The collaboration UI landed; every rank decision stays server-side.

### 16.1 What landed

| Area | Result |
| --- | --- |
| `hooks/useTripAccess.ts` | `role → isOwner / canEdit / canManage / atLeast()`. Cosmetic gating only (per §3.8): missing annotation falls back to creator/owner for legacy payloads and the temp generated preview, so single-user behaviour is unchanged. |
| API client | `getTrips` gained `?scope=`; new calls: members list/patch/remove/leave, transfer, invites create/list/revoke (raw link returned exactly once), invite `preview` + `accept`. CSRF plumbing reused — no bypass. |
| `pages/InviteAccept.tsx` + route | `/invite/:token`: preview (title, role, inviter, expiry, email binding), join, per §3.5 the token is `history.replaceState`d off the URL after use and re-remembered through the auth round trip in `sessionStorage` (location.state can be dropped by a full reload). Signed-out visitors → `/auth?state.from` → back. Errors (invalid/expired/wrong email) render with the server's message. |
| `components/dashboard/TripMembers.tsx` | Member list w/ role badges + owner actions (role select → PATCH, remove, transfer with confirm dialog), leave button (non-owner), and the owner's sent-invitations list (token hints only, revoke buttons). |
| `components/dashboard/InviteDialog.tsx` | Role picker (editor/commenter/viewer), uses (1/5/15/25), expiry (24h→30d), copyable result view; created invite shows once. QR was dropped (no QR dep in the SPA; copy + native share cover it — see deviations). |
| Dashboard | "Shared with me" section with per-trip role badges; delete button only offered on owned trips (mirrors the owner-only server rule); `onSave`/`onStatusChange` reach the display **only** for editor/owner; People tab (members+invites) appears for real trips with a Milestone-6 payload. |
| Rank-aware components | `TripFeedback` renders read-only for non-owners (rating is owner-only, F12); `TripVersions` hides Restore for viewer/commenter; `ShareExportModal` hides create/copy of the public link for non-owners. |
| Cache hygiene (F21) | `lib/queryClient.ts` shared client; `queryClient.clear()` on signin, signup **and** logout. |
| Server touch-up | Every trip payload (`GET /:id`, updates, granular edits, duplicate, generate) now carries `role` so the SPA can gate exactly what the guard allows. |
| Verification | backend build ✅ · 161/161 tests ✅ · frontend `tsc --noEmit` ✅ · `vite build` ✅. |

### 16.2 Deviations from the blueprint

1. **No QR code on the invite dialog.** The SPA has no QR dependency and copying/sharing the link covers the same reach; QR would be additive polish in E5+ if wanted.
2. **People tab instead of a separate members page.** The doc sketches `TripMembers` as a panel; placing it as the 8th tab of the itinerary display keeps members, invites and history one click apart.
3. **Rating widget stays visible but read-only** for non-owners instead of hidden — it explains why the buttons are gone rather than leaving an odd gap.
4. **Delete stays visible-and-blocked in the handler** (friendly toast) rather than being fully hidden for shared trips in the library, because the row-level "role" annotation is the only distinction and it is authoritative.

### 16.3 Honest limits

- Presence/rollback UX is E4; two people editing simultaneously still reconcile server-side only (409 handling lands next).
- The People tab needs a trip payload annotated with a role — trips opened through the sha link (`/shared/:shareId`) correctly never show it.
- `TripMembers` falls back to "Traveler ····id" labels because `User.name` does not exist yet (E5 optional item).

## 17. E4 — shipped (appendix)

> Ship notes, 2026-10-18. One increment: concurrency enforcement + the live tier.

### 17.1 What landed

| Area | Result |
| --- | --- |
| `revMode: 'required'` flips on | `PUT /:id`, `PUT /:id/activities`, `PUT /:id/activities/reorder`, `PUT /:id/days/reorder`, `PUT /:id/participants`, version restore, ownership transfer. Id-addressed writes (expense/route/finance) stay `optional` per §3.6. Router-coverage spots both claim groups in CI. |
| Guard change | A **missing** `baseRev` under `required` now answers the same structured `409 { code: 'REV_CONFLICT', currentRev, updatedAt }` as a stale rev, so the client has one conflict path instead of two. |
| `participants` no-op writes | The reconcile reuses identical subdocs → `save()` became a no-op and `rev` stuck. `markModified('participants')` now guarantees a user-visible write always moves `rev` (caught by the smoke before any user could). |
| api.ts rev plumbing | `ApiError` keeps `{status, code, currentRev}`; the client remembers the latest `rev` from every trip-shaped payload and injects `baseRev` into the seven required mutations automatically — no component had to thread revs through. |
| Conflict UX | `lib/conflicts.ts` + "Reload latest" toast action wired into the itinerary persist flow, the dashboard save/status handlers and version restore; a remote `trip:updated` triggers a silent refetch that yields to unsaved local edits instead of clobbering them. |
| E4a refreshing | Dashboard listens to `focus`/`visibilitychange` and polls every 20s (quiet — no spinner, no toast on failure), keeping both the list and the open trip's rev fresh. |
| E4b presence | `services/collab/presence.ts` (in-process TTL map + tiny bus, §3.7 exactly as scoped), `GET /:id/events` SSE (viewer-guarded, keepalive ping every 15s), `POST /:id/events/heartbeat` (204), `Trip` write hooks fan out `trip:updated` (`post('save')`/`post('findOneAndUpdate')`; the three direct `Trip.updateOne` call sites emit explicitly because mongoose has no post-update query middleware). |
| SPA live tier | `hooks/useTripEvents.ts` — subscribes only after a cached `/api/health` probe reports `collab.sse` (a disabled tier means zero event-source attempts, no retry spam); heartbeats every 10s via the CSRF-plumbed client; TripHeader renders the live collaborator avatar stack (own entry filtered out, +N overflow). |
| Env | `ENABLE_TRIP_SSE` (default false, string-parsed — `Boolean('false')` is a trap), `PRESENCE_TTL_MS` (30000), both in `.env.example`. Health reports `collab.sse` for feature discovery. |
| Tests | presence.service suite (TTL prune, dedup, roster projection, bus fan-out + a throwing subscriber can't break the bus), router-coverage spots for `required`/`optional` groupings and the two live-tier routes. 171/171 backend tests. |
| Smoke | `smoke-e2.mts` extended to 45 checks: no-rev write → 409 REV_CONFLICT; stale rev → 409 + `currentRev`; two sequential writers chained through published revs, then the leftover rev authoritatively rejected; participants/transfer now carry baseRev; SSE frames (`trip:updated`, `presence` roster via heartbeat) observed on a real stream; **non-member refused the stream (404)** — which caught the flaw below. |

### 17.2 The one shipped early (E5 item pulled forward)

`roleOf`'s **creator fallback is gone**, in E4 rather than E5, because the smoke proved it was a live hole: an owner who *left* (or was transferred away from) their own trip kept owner access to everything — including the new SSE stream — because `trip.userId === userId` returned `'owner'` with zero regard for `members[]`. The `migrate:members` backfill has run on the served database (1 legacy trip backfilled, 0 remaining), so `members[]` is authoritative everywhere; the tests were rewritten to pin "creator with no member row ⇒ no access".

### 17.3 Honest limits

- Presence state is single-instance (by design, §8/§10). The toggle degrades cleanly; rev-based conflicts keep the data honest without it.
- `trip:updated` fires on member-role/invite mutations too — the SPA treats each as "refetch the trip", which is correct but slightly eager.
- The smoke's SSE checks need the server started with `ENABLE_TRIP_SSE=true`; with the tier off the script stops at the heartbeat step's neighbouring checks rather than the full stream assertions (documented in the header).

## 18. E5 — shipped (appendix)

> Ship notes, 2026-10-18. The hardening pass. Milestone 6 is now functionally complete: E1–E5 all landed.

### 18.1 What landed

| Area | Result |
| --- | --- |
| **F7 — share revoke** | New `DELETE /api/itinerary/:id/share` (owner): `isPublic = false` **and** `shareId` cleared, so scrubbed-from-history URLs are permanently 404, not paused. Re-sharing rotates to a different link (verified in smoke). `ShareExportModal` gains a destructive "Stop sharing (revoke link)" action with inline feedback. |
| **F11 — shareId strength + abuse brake** | New links mint 16 random bytes (`crypto.randomBytes(16).toString('hex')` — 128 bits); every historical 48-bit id keeps resolving because lookup is by exact string. The anonymous `GET /shared/:shareId` now runs behind `publicShareLimiter` (120 reads / 15 min / IP). |
| **F20 — shareId collision retry** | `shareTrip` retries mint-up-to-5-times on a Mongo duplicate-key (impossible-but-planned at 128 bits), so a collision turns into "try again" rather than a 500. |
| **F14 — public projection as an allow-list** | `projectPublicTrip()` in `publicTrip.ts` decrees the exact payload shape; the controller just serializes it. Adds `customRoutes` (drawn routes are part of the shared plan, not sensitive). `publicProjection.test.ts` pins the key set — including a 19-field "maximal trip" fixture whose sensitive keys (`shareId`, `members`, `expenses`, `finance`, `generationMeta`, `versions`…) must all be structurally absent. |
| **F16 — lean list rows** | `GET /api/itinerary` selects only what the dashboard cards render (title, status, `version`/`hasEdited`/`rev`, members for role, the five `tripDetails` card fields) — no ledger, no full itinerary, no meta. Opening a trip changed to an explicit full fetch (`Dashboard.handleSelectTrip` → `GET /:id`) behind a backdrop-veil loader; the same applies to the TripPlanner hand-off reselect. |
| **F17 — insights are membership-scoped** | `GET /api/itinerary/insights` now filters `members: { $elemMatch: { userId, role: 'owner' } }` instead of `trip.userId`, matching the transfer semantics (an `$elemMatch` keeps the userId/role pair on the same member row). Smoke: the demoted owner's aggregate drops the trip while the promoted owner's picks it up. |
| **F13 — version cap configurable** | `snapshotCurrent`'s trim now reads `env.VERSIONS_MAX` (default 30; documented in `.env.example` + README). |
| Tests / smoke | 176/176 backend tests (new: public-projection contract, router-coverage spots for the revoke route + limiter). New `smoke-e5.mts` — 19 live checks covering F7/F11/F14/F16/F17 through real HTTP. |

### 18.2 Deferred (by prior scope decision)

- Email invites — the link-only decision stands; Resend integration stays out of the milestone.
- `User.name` display names for member rows — the collaborators list keeps email-derived labels ("Traveler ····id" only when email is absent); pure polish.

### 18.3 Honest limits

- The F20 retry loop still saves the trip inside the retry: a fifth consecutive collision surfaces the raw 500 (statistically a heat-death-of-the-universe event at 128 bits).
- `VERSIONS_MAX` trims the oldest snapshots at push time; trips that already exceeded 20 shrink on their next edit, not retroactively.
- Insight aggregates cap at the 50 most recent trips (unchanged).

---

## 19. Phase E6 — Comments (SHIPPED: F6a + F6b, see §20–§21)

> Planned 2026-10-18. Two independently shippable sprints: **F6a backend** — **shipped** (see §20) — and **F6b frontend** — **shipped** (see §21).
>
> **Roles are already the API.** `commenter` (rank 1) has existed in `TRIP_ROLES`, the rank arithmetic, `InviteDialog`'s role picker and the invite schema since E1 — comments only add the routes and UI that the rank has been waiting for. No data migration is needed.

### 19.1 What the user can do

- *"Let my mom leave a note on Day 2 without touching the itinerary."*
- *"I ask a question next to what it is about — pinned to the day it concerns."*
- *"An owner tidies up: a vandal comment disappears for everyone, but I keep an audit trail."*
- *"A viewer just reads — and the UI tells them why they can't write."*

### 19.2 Data model — a separate collection, deliberately

The F13 lesson from this milestone: embedded arrays under `Trip` (`members`, `versions`, `expenses`, `customRoutes`) are bounded by pattern in a single trip, but comments are a social stream and grow with *people*, not trip content. Embedding them would repeat the unbounded-array mistake and repaginate every trip read.

```ts
// backend/src/models/TripComment.ts
export interface ITripComment {
  tripId: Types.ObjectId;    // indexed — the only lookup key besides _id
  userId: Types.ObjectId;    // ref User — never denormalized away; audit field
  body: string;              // trimmed, 1..COMMENT_MAX_LEN (default 2000)
  day?: number;              // optional day anchor (1..999); undefined = general
  editedAt?: Date;           // set on PATCH
  deletedAt?: Date;          // soft-delete tombstone (moderation)
  createdAt: Date;           // cursor + ordering
  updatedAt: Date;
}
```

Indexes:

```ts
commentSchema.index({ tripId: 1, createdAt: -1 });   // pagination + the POST cap check
```

**Why `createdAt` also serves as the pagination cursor.** ObjectId monotonicity plus an insert-only row (writes never change `createdAt`) makes `{ createdAt, _id }` a stable cursor; ties across the same millisecond resolve by `_id` for a deterministic order.

**Why soft-delete.** A hard-removed row breaks threads, hides moderation evidence, and cannot be undone. The tombstone keeps `userId` and timing; the body is replaced. (Comments outlive a trip's hard delete — same as `TripInvite` rows today; §19.8.)

**Explicitly not embedded into `Trip`, and not rev-coupled.** A comment write never touches the `Trip` document — no `rev` bump, so collaborators' open edits never see a spurious 409 from someone leaving a remark. Comment arrival is a separate message lane (§19.4) on the existing SSE channel.

### 19.3 API surface and guard matrix

| Method | Path | Rank | Notes |
|---|---|---|---|
| `GET` | `/api/itinerary/:id/comments` | `viewer` | `?before="<createdAt ISO>\|_id"` cursor, `limit` ≤ 50. Returns `{ success, comments, nextCursor, dayCounts }` — `dayCounts` is a parallel `countDocuments`-per-day aggregation for the day badges. |
| `POST` | `/api/itinerary/:id/comments` | `commenter` | `{ body, day? }` → 201 hydrated comment. Per-user rate limiter (§19.6). |
| `PATCH` | `/api/itinerary/:id/comments/:commentId` | `viewer` + author-of-record | `{ body }`; author-only (rank is irrelevant to *authorship* — an ex-editor demoted to viewer still owns their old comments); sets `editedAt`. |
| `DELETE` | `/api/itinerary/:id/comments/:commentId` | `viewer` + author-or-owner | Author deletes own; **owner moderates anyone's**. Sets `deletedAt`, empties the body. |

**Rank-vs-authorship is a two-layer check, like member management.** The uniform rank gates at the router (`viewer` for the author/owner routes is intentionally *any member*), and `services/collab/comments.ts` does the ownership decision: author-xor-owner. This is the same shape as `assertMemberRemoval` and gets the same service-level tests.

- **404 vs 403 semantics unchanged (§3.2):** no membership → 404 (the trip guard loads the trip first, so this is free); wrong rank when POSTing → 403 with the copy "You don't have permission to comment on this trip."
- **New zod schema** `comments.schema.ts`: `body` = trimmed non-empty string ≤ `COMMENT_MAX_LEN` (rejects whitespace-only), `day` optional positive int; `validate()` strips everything else.
- **Route placement:** appended to `itinerary.routes.ts` with the other `:id` routes — the router-coverage test forces a rank declaration for each, immediately, which is exactly the E1 defense working as designed.

### 19.4 Live delivery — one channel, a new frame type

The E4 bus (`presence.ts`) is content-agnostic: any frame `{ type, ... }` fanned to per-trip subscribers by trip id. Comments extend it — no new channel, no new connection:

```ts
// services/collab/presence.ts — one new export beside emitTripUpdated
export function emitCommentEvent(tripId: string, frame: unknown): void { ... }
```

Frame kinds emitted (service-level, after hydration — the same pattern as the three explicit `Trip.updateOne` emitters):

- `{ type: 'comment:new', comment }` — the full hydrated row (includes `label`, `isYou` computed per-recipient? **No — `isYou` is a projection concern,** see §19.5; the frame carries `userId` and the SPA filters locally).
- `{ type: 'comment:update', comment }` — edited row or a `{ body: '', deletedAt }` tombstone, for in-place patching.

**Emission must not touch `emitTripUpdated`** — the SPA's generic "refetch the trip" path stays reserved for document changes so a comment storm cannot trigger itinerary refetches.

### 19.5 Backend service surface

```ts
// services/collab/comments.ts
listTripComments(tripId, { before?, limit })     → { rows, nextCursor, dayCounts }
createTripComment(trip, userId, { body, day? })  → hydrated row; enforces the per-trip cap
ensureCommentAuthor(commentId, userId)           → row or 404 (ownership check only)
editTripComment(row, userId, { body })           → author-only, sets editedAt
removeTripComment(row, userId, role)             → author-or-owner, tombstone
projectComment(row, viewerId)                    → { _id, tripId, userId?, label, body, day?, isYou,
                                                     createdAt, editedAt?, deletedAt? }
```

- **`label` comes from `User.email`'s local-part** — the exact pattern the members UI uses since E2 (§18.2). Adding `User.name` later upgrades every label at once; nothing in the comment shape changes.
- **`userId` is not published to clients other than... actually is:** only `label` + `isYou` ship; the raw `userId` stays server-side (consistent with member-row projection, and it removes any user-id enumeration from the comment surface). The SPA needs no ids for live frames — matching is by `_id`.
- **Hydration reads `User` in one `$in` projection per page** (`email` only); single-comment frames hydrate one row.
- **Per-trip write cap:** `COMMENT_MAX_PER_TRIP` (default 200) checked via one indexed `countDocuments` on POST — bounds abuse and document growth while staying O(1)-ish. Full-trip → 409 with a plain message.
- **Rate limiter:** `commentCreateLimiter` — `userOrIpKey` (F18 pattern), 60 posts / 15 min, on POST only; reads/edits/deletes stay unthrottled beyond the general API surface.

### 19.6 Configuration

| Variable | Default | Purpose |
|---|---|---|
| `COMMENT_MAX_LEN` | `2000` | Body length cap (chars, zod-enforced). |
| `COMMENT_MAX_PER_TRIP` | `200` | Per-trip cap on non-deleted comments; POST 409 above it. |
| `COMMENT_CREATE_PER_15MIN` | `60` | Per-user POST limiter (keyed user-or-IP per F18). |
| `COMMENTS_PAGE_SIZE` | `50` | Server max per page regardless of a larger `limit`. |

### 19.7 Frontend

```
hooks/useTripComments.ts                page state + cursor "load more" + live ingest (§19.4)
components/dashboard/CommentsTab.tsx    list, composer, day filter chips, tombstones, locked state
```

- **`CommentsTab` (a 9th tab on real trips, alongside People):** shown for any member with `role` (`showCommentsTab = isRealTrip && Boolean(role)`, the E3 cosmetic pattern — the *server* enforces who can write). Renders: day filter chips (from `dayCounts`), the comment stream (own bubbles right-aligned, others left, "(edited)" markers, tombstones as thin "comment removed" rows), and the composer.
- **The composer is rank-aware in three states:** open for `commenter`+ (textarea, plain text rendered via text nodes — no rich text, no markdown → XSS-safe by construction); *disabled with "Viewers can't comment — ask the owner to change your role"* for viewers; hidden entirely on the public share page (route guards answer 404 for anonymous callers there, so it must not be attempted).
- **Live ingest through the existing `useTripEvents` hook:** it already receives every frame for the subscribed trip; extend its callback surface with `onCommentEvent` (typed discriminated union) so `useTripComments` appends/patches in place. Dedupe by `_id` (idempotent frames, since a participating client can also be the author echoing their own write).
- **Optimistic add with rollback:** the POST response truth-serializes the row (`createTripComment` returns the hydrated projection), so the app pattern stays manual-`useState`, matching how the codebase avoids React Query hooks (F21 aside).
- **Stretch item (F6b2, cuttable):** per-day comment-count badges inline in `DayTimeline`. Requires threading `dayCounts` down; the day-chip filter inside the tab is the first cut and ships alone.
- **Moderation affordance in `TripMembers`: nothing.** Owner deletion lives where the comment lives: an inline owner-only delete on others' bubbles, with a confirm.

### 19.8 Sprints

### F6a — Comments backend *(ships alone; zero UI change)*

- `models/TripComment.ts` + indexes; `schemas/comments.schema.ts`.
- `services/collab/comments.ts` — list/panel cap/author rules/hydration (§19.5).
- `controllers/collab.controller.ts` — the four handlers; routes appended to `itinerary.routes.ts` with guards; `commentCreateLimiter`.
- `presence.ts` — `emitCommentEvent` export; service-level emissions per frame kind (§19.4).
- `env.ts` + `.env.example` + README: the four variables of §19.6.
- Tests: router-coverage spots (the three routes' ranks POST=`commenter`, DELETE=`viewer`+author-or-owner); service tests — whitespace body rejected, length boundary, tombstone preserving `userId` while emptying `body`, cap arithmetic at `COMMENT_MAX_PER_TRIP`, author-xor-owner matrix including the demoted-author edge (a demoted-to-viewer author can still edit/delete their own), cursor pagination (tie-break determinism), and `dayCounts` aggregation. **Live smoke** `smoke-e6.mts` reusing the `smoke-e5.mts` harness: viewer denied POST (403), commenter full lifecycle, non-member 404, public share endpoint untouched.

*Effort: M. Risk: low — the guard, limiter, sanitize and SSE machinery all exist; the work is glue + tests.*

### F6b — Comments frontend

- Types (`TripComment`), four `api.ts` methods, `useTripComments`, `CommentsTab` + the 9th-tab wiring and conditional grid span (mirroring the 8th-tab pattern), `useTripEvents.onCommentEvent`.
- Locked/empty states; optimistic add + conflict-free load-more; tombstone rendering; owner moderation control.
- Stretch: `DayTimeline` badges (F6b2).

*Effort: M. Risk: none structural — the tab scaffolding, gating and live-tier plumbing are all E3/E4 patterns.*

**Dependency order:** `F6a ─► F6b` (plus the stretch item last). Each lands as one commit, built/tests/smoke-verified per the established workflow, ship-note appendix (§19.x shipped) added to this document.

### 19.9 Flaws this plan closes by design

| Risk | Why it cannot happen |
|---|---|
| A viewer or anonymous user writing a comment | `requireTripRole('commenter')` at the router; the rank ladder already outlaws viewer 0 < 1. |
| Comment-id usability for enumeration probing | Non-members get 404 (existing trip guard); comment routes never return existence for strangers. |
| XSS through comment bodies | Plain text, ≤ 2000 chars, rendered as React text nodes; no HTML/markdown parsing anywhere. |
| A comment storm inflating the trip document | Comments live in their own collection with per-trip and per-user caps; the trip document never grows. |
| A spurious 409 from concurrent commentary | Comment writes never touch `rev` and never emit `trip:updated`. |
| A demoted author losing moderation over their own words | Author-of-record checks binds to `userId`, not current rank. |
| A vandal noted in the removal | Soft-delete tombstones: the owner's removals keep `userId` + timestamp for the audit trail. |
| A route silently unguarded | Appended routes fail the router-coverage test until ranked — the E1 §6.3 test does its job again. |

### 19.10 Residual risks (stated openly)

1. **Comment edit is allowed forever** (no window). Fine for a travel-planning context; revisit only if cross-trip reputation matters someday.
2. **Day-anchor is free-floating text so far as UI goes** — day chips reflect what people actually attached; nothing validates that `day` corresponds to a real itinerary day.
3. **Orphaned comment rows after a hard trip delete** linger (tripId lookup never matches). Cleanup is a periodic script—only worth writing if collection size ever matters.
4. **Multi-instance parity:** `emitCommentEvent` rides the same in-process bus as presence — live comment frames degrade to the E4a focus-refetch across instances exactly like the roster does.
5. **`label` collision:** email ≤2 people with the same local-part on one trip (e.g. two "kiran" Gmail) label identically. Cosmetic; the deferred `User.name` is the fix.

---

## 20. Appendix — Phase E6 sprint F6a (comments backend) SHIPPED

> Shipped 2026-10-18, one commit. Zero UI change. 195/195 backend tests (19 new), live smoke `smoke-e6.mts` — 31 checks — **ALL PASS** against `127.0.0.1:5059` with `ENABLE_TRIP_SSE=true`.

### 20.1 What shipped

| Piece | File / change |
|---|---|
| Model + indexes | `models/TripComment.ts` — `{ tripId, userId, body, day?, editedAt?, deletedAt? }`; indexes `{tripId, createdAt:-1, _id:-1}` (pagination + cap check) and `{tripId, day, deletedAt}` (day badges). Tombstone invariant is a **cross-field validator** ("non-empty unless `deletedAt`"), not `required`. |
| Zod schemas | `schemas/comments.schema.ts` — `createCommentSchema` (`body` trimmed 1..`COMMENT_MAX_LEN`, rejects whitespace-only; `day` coerced 1..999) + `updateCommentSchema`. |
| Service | `services/collab/comments.ts` — pure rules (`parseCursor`, `buildCursorFilter`, `resolveLimit`, `assertCommentCap`, `assertCommentAuthor`, `assertCommentRemoval`, `projectComment`, `dayCountsFrom`, `emailLabel`) + data access (`listTripComments`, `createTripComment`, `loadTripComment`, `editTripComment`, `removeTripComment`). Comments **never touch `Trip`/`rev`** and never emit `trip:updated`. |
| Controllers | `collab.controller.ts` — `getTripComments` / `postTripComment` / `patchTripComment` / `deleteTripComment`. |
| Routes | `GET/POST /:id/comments` + `PATCH/DELETE /:id/comments/:commentId`; ranks `viewer` / `commenter` / `viewer`+author / `viewer`+author-or-owner; `commentCreateLimiter` on POST only. **First consumer of the `commenter` rank.** |
| Bus | `presence.ts` — `emitCommentEvent` + `comment:new` / `comment:update` frame kinds on the existing SSR channel. |
| Config | `COMMENT_MAX_LEN=2000`, `COMMENT_MAX_PER_TRIP=200`, `COMMENT_CREATE_PER_15MIN=60`, `COMMENTS_PAGE_SIZE=50` in `env.ts`, `.env.example`, README. |
| Tests | `comments.test.ts` (19 pure-rule tests: schemas, cursors, caps, author/moderation matrix, tombstone projection, labels) + 4 router-coverage rank spots. |
| Smoke | `scripts/smoke-e6.mts` — ranks (403 below commenter), non-member 404s, schema 400s, full author/owner lifecycle, tombstones, `dayCounts`, composite-cursor pagination, authorship surviving demotion, rev-untouched invariant, live `comment:new` SSE frame. |

### 20.2 Deviations from the §19 plan (with reasons)

1. **Cursor format is the exact composite `"<ISO>|<_id>"`.** The plan's looser `?before` shape was first implemented as a bare ObjectId mint, which the live smoke exposed: an ObjectId's embedded timestamp is *second*-resolution while `createdAt` is millisecond, so the cursor's time never matched and page 2 came back **empty**. The minted cursor is now full-millisecond plus the `_id` tie-break; a bare ObjectId or ISO string is still accepted leniently. Single-index pagination stays O(log n).
2. **`body` is not `required: true`.** The first live run failed with `Path 'body' is required.` because a tombstone legitimately stores `body: ''`. The invariant is cross-field ("non-empty unless removed") and lives in a schema validator instead.
3. **Frames carry no `userId` and ship the author's own `isYou`.** One broadcast frame reaches every member, so `isYou` cannot be per-recipient server-side. The contract is therefore: the SPA **never trusts `frame.isYou`** — it dedupes by `_id` against rows it already holds (its own POST responses mark authorship), which also removes user-id enumeration from the wire (stronger than the plan's "frame carries `userId`").
4. **`ensureCommentAuthor` (plan) split into `loadTripComment` (trip-scoped 404) + `assertCommentAuthor` (403)** — the 404 and the 403 are different branches of the same guard matrix and get tested separately.

### 20.3 Honest limits

- The per-trip cap counts live (non-deleted) comments only; tombstones do not consume it (deliberate — moderation should not eat a trip's quota).
- The comment-create limiter is per-user in-process; behind multiple instances it degrades exactly like presence (§8/§19.10).
- Orphaned rows after a hard trip delete linger (§19.10 unchanged).
- No `editedAt` window and no notification payloads yet — those arrive with F6b/F10.

---

## 21. Appendix — Phase E6 sprint F6b (comments frontend) SHIPPED

> Shipped 2026-10-18, one commit. `npx tsc --noEmit` clean + `vite build` green (the comment surface code-splits inside the existing `ItineraryDisplay` chunk).

### 21.1 What shipped

| Piece | File / change |
|---|---|
| Types | `types/trip.ts` — `TripComment` (no `userId` on the wire; the doc-comment codifies "never trust `frame.isYou`"). |
| API | `services/api.ts` — `getTripComments` / `addTripComment` / `editTripComment` / `removeTripComment`; deliberately **no `baseRev`** — comment writes never touch the trip document. |
| SSE hook | `hooks/useTripEvents.ts` — new `onCommentEvent` callback + `CommentFrame` union; the ref-callback pattern avoids resubscribing the stream. |
| State | `hooks/useTripComments.ts` — newest-first list, cursor "Load earlier", **optimistic add with rollback** (limiter 429 / cap 409 roll back the placeholder + the day-chip bump), optimistic tombstone blanking, `_id`-deduped live ingest. |
| UI | `components/dashboard/CommentsTab.tsx` — the 9th tab: day filter chips (`dayCounts`), day-anchored composer (⌘/Ctrl+Enter), own bubbles right-aligned, tombstones as hairlines, inline edit, author/owner removal behind a confirm, viewer locked-state copy, empty/error/retry states. |
| Wiring | `ItineraryDisplay.tsx` — `useTripComments` lives next to the ONE EventSource; `onCommentEvent` lands frames no matter which tab is open; `Discuss` trigger + content are gated by the same `isRealTrip && Boolean(role)` pattern as People. |

### 21.2 Decisions worth remembering

1. **One state owner, one stream.** The commenter state lives in `ItineraryDisplay` (not in `CommentsTab`) so comment frames merge even while the user is on another tab, and there is never a second SSE/heartbeat connection per trip.
2. **Tab mounts are lazy** (Radix unmounts inactive `TabsContent`), so the first page fetch happens `onTabOpen` via `ensureLoaded()` (idempotent, retried on the next open after a failure) — a visitor who never opens *Discuss* never pays for the query.
3. **The identity contract:** HTTP responses' `isYou` is authority; live frames' `isYou` is ignored (it is the author's view). Dedupe by `_id` makes the author's optimistic echo idempotent even when their own frame arrives mid-flight.
4. **`dayCounts` stay server-truth:** the first load reads the aggregation; the composer/removal nudge locally in between; live frames never guess at the aggregate (they only prepend/patch rows).

### 21.3 Honest limits

- **Stretch F6b2 (per-day badges in `DayTimeline`) is not shipped** — the tab's day chips are the cut that made the sprint; the badges need `dayCounts` threaded into the timeline component.
- **Unread counts are not shipped** — that is the F10 notification-center work (a `TripReadState` collection, never embedded in `Trip`).
- **Frames during the initial load** prepend ahead of the pending page read; the page read replaces the list wholesale, which is correct (server truth) but can transiently hide a frame-arrived row until the reader catches up — invisible in practice (the reader and the sheet land within one round-trip).
