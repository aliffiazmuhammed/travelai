import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: 'Too many attempts. Please try again after 15 minutes.',
    message: 'Too many attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * PA0: each realm signs in through its own limiter instance. Separate stores
 * mean an attacker burning personal attempts cannot lock out agency staff (and
 * vice versa), and the plan requires per-realm throttling.
 */
export const agencyAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Too many workspace sign-in attempts. Please try again after 15 minutes.',
    message: 'Too many workspace sign-in attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * PA1: the platform realm gets its own store for the same isolation reason —
 * burning personal or agency attempts must not lock an operator out of the
 * admin panel. Admin login is intentionally stricter than the other realms.
 */
export const platformAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Too many admin sign-in attempts. Please try again after 15 minutes.',
    message: 'Too many admin sign-in attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    error: 'You have reached the maximum trip generation limit for this hour. Please try again shortly.',
    message: 'You have reached the maximum trip generation limit for this hour. Please try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Weather-aware day rebuilds (M4.4): one provider call per press, like a
 * generation. It was the only AI route without a brake — an editor could hold
 * the button and spend the provider budget. Keyed per account (F18 pattern) so
 * a shared household IP does not lock everyone out; the generous hour window
 * matches `generateLimiter`.
 */
export const dayAlternativeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any): string => String(req?.userId ?? req?.ip ?? 'anonymous'),
  validate: false,
  message: {
    success: false,
    error: 'You have asked for a lot of day rebuilds. Please try again in an hour.',
    message: 'You have asked for a lot of day rebuilds. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * F12a @TravelAI asks: the provider spends money per answer and mentions are
 * inherently bursty ("ask it one more thing!"). Two brakes stacked:
 * - THIS burst limiter: 5 asks / minute, user-keyed (pattern of flaw F18);
 * - the service-layer `BOT_DAILY_LIMIT` per user × trip × day inside
 *   `assistant.ts` (in-process, resets on restart — an honest cost brake).
 * The mention gate itself remains the primary brake by product design.
 */
export const assistantAskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req: any): string => String(req?.userId ?? req?.ip ?? 'anonymous'),
  validate: false,
  message: {
    success: false,
    error: 'TravelAI needs a breath — wait a minute before the next ask.',
    message: 'TravelAI needs a breath — wait a minute before the next ask.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * User-keyed limiters (Milestone 6, flaw F18): collaboration actions are
 * per-account, so a shared NAT should not lock a college dorm out. They fall
 * back to the IP key when a request has no authenticated user, and validation
 * checks are disabled because the keys are no longer raw IPs.
 */

const userOrIpKey = (req: any): string => String(req?.userId ?? req?.ip ?? 'anonymous');

export const inviteManageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many invitations created. Please try again in an hour.',
    message: 'Too many invitations created. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const invitePreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many invite lookups. Please try again shortly.',
    message: 'Too many invite lookups. Please try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const inviteAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many join attempts. Please try again shortly.',
    message: 'Too many join attempts. Please try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Comment creation (Milestone 6 §19.5, F6a): user-keyed like the other collab
 * actions. Comments are chattier than invites, so the window is per 15 minutes
 * and the cap is configurable (`COMMENT_CREATE_PER_15MIN`).
 */
export const commentCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.COMMENT_CREATE_PER_15MIN,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'You are commenting too quickly. Please wait a moment and try again.',
    message: 'You are commenting too quickly. Please wait a moment and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Typing pings (F8a): client sends at most one per ~2.5s while composing; the
 * cap leaves comfortable headroom for normal use while bounding a stuck tab.
 */
export const typingPingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many typing signals. Please wait a moment.',
    message: 'Too many typing signals. Please wait a moment.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Milestone 8 G4: cloning a published trip writes a whole new document from a
 * public source, so it is capped per account per day. Ten is generous for a
 * real "save this idea" workflow and hostile to using the gallery as a bulk
 * copy API.
 */
export const TRIP_CLONE_DAILY_LIMIT = 10;

export const tripCloneLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: TRIP_CLONE_DAILY_LIMIT,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'You have cloned the maximum number of trips for today. Please try again tomorrow.',
    message: 'You have cloned the maximum number of trips for today. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Milestone 8 G5: join requests are stranger-to-stranger messages, so they are
 * capped per account per day. Five is enough to ask about a handful of trips a
 * person actually wants to join, and far too few for spraying requests across
 * the gallery. The duplicate-pending rule is the unique index in the model, not
 * this limiter — the two brakes cover different abuses.
 */
export const JOIN_REQUEST_DAILY_LIMIT = 5;

export const joinRequestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: JOIN_REQUEST_DAILY_LIMIT,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'You have sent the maximum number of join requests for today. Please try again tomorrow.',
    message: 'You have sent the maximum number of join requests for today. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Milestone 8 G6: reports are a safety action, so the brake is generous enough
 * for a person flagging several bad listings while still bounding scripted
 * report brigading. A report is also unique per reporter+target, so this cap
 * governs how many *different* pieces of content one account can flag a day.
 */
export const REPORT_DAILY_LIMIT = 10;

export const reportCreateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: REPORT_DAILY_LIMIT,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'You have sent the maximum number of reports for today. Please try again tomorrow.',
    message: 'You have sent the maximum number of reports for today. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * F14 account security: a password change is a credential check, so it gets the
 * same brake shape as sign-in but keyed on the account (a shared NAT must not
 * lock everyone out). 10 tries / 15 min is generous for a human typing and
 * useless for guessing.
 */
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many password attempts. Please try again in a few minutes.',
    message: 'Too many password attempts. Please try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * PA2: account management writes are rare and high-impact (disable, password
 * reset, super-admin creation). The limit is per platform account, generous for
 * an operator working through a support queue and hostile to scripted abuse.
 */
export const platformWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many platform account changes. Please wait a few minutes and try again.',
    message: 'Too many platform account changes. Please wait a few minutes and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Agency Workspace A1: creating a tenant is a rare, high-impact action. Keep a
 * modest daily cap per account so a compromised session cannot fill the
 * database with empty agencies. Team/invite writes reuse the collaboration
 * limiters above.
 */
export const agencyCreateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'You have created the maximum number of agencies for today. Please try again tomorrow.',
    message: 'You have created the maximum number of agencies for today. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** F14 avatar uploads: bounded storage churn (20 photos / hour / account). */
export const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many photo uploads. Please try again in an hour.',
    message: 'Too many photo uploads. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** A3 brand assets: same storage-churn brake as avatars, slightly larger cap. */
export const agencyAssetUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: userOrIpKey,
  validate: false,
  message: {
    success: false,
    error: 'Too many brand asset uploads. Please try again in an hour.',
    message: 'Too many brand asset uploads. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * A6 template sources and snapshots are written to private storage and then
 * rendered in previews. Admin-only, but still bounded per user + agency.
 */
export const agencyTemplateUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any): string =>
    `${String(req?.userId ?? req?.ip ?? 'anonymous')}:${String(req?.params?.agencyId ?? '')}`,
  validate: false,
  message: {
    success: false,
    error: 'Too many template uploads. Please try again in an hour.',
    message: 'Too many template uploads. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * A5 proposal exports: each job starts a headless Chrome process, so the brake
 * is per user AND agency. Twenty per hour is generous for a desk while
 * bounding both CPU and an accidental double-click storm.
 */
export const agencyExportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any): string =>
    `${String(req?.userId ?? req?.ip ?? 'anonymous')}:${String(req?.params?.agencyId ?? '')}`,
  validate: false,
  message: {
    success: false,
    error: 'Too many exports requested. Please try again in an hour.',
    message: 'Too many exports requested. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public, unauthenticated endpoint — keyed on IP (F11, E5): the shared-trip
 * read needs an abuse brake because guessing share ids is exactly the model
 * of the attack. 120 reads / 15 min / IP comfortably covers a human opening
 * links (and the SPA's own refetches) while capping enumeration speed.
 */
export const publicShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    error: 'Too many requests. Please slow down and try again shortly.',
    message: 'Too many requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public traveler profiles (G2). Handles are short and guessable, so profile
 * reads get the same IP brake as unlisted shares: 120 reads / 15 min covers a
 * person browsing several profiles (and the SPA's refetches) while capping
 * enumeration speed.
 */
export const publicTravelerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    error: 'Too many profile requests. Please slow down and try again shortly.',
    message: 'Too many profile requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public gallery (G3). The listing is anonymous and each card is a small
 * projection, so it is priced per IP rather than per account: 180 reads /
 * 15 min covers a person paging through the gallery (each "load more" is one
 * request) while still capping scripted scraping. The single-trip page shares
 * this bucket on purpose — a scraper would walk both.
 */
export const publicGalleryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: {
    success: false,
    error: 'Too many gallery requests. Please slow down and try again shortly.',
    message: 'Too many gallery requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public agency events (M10 E1). Listing, event page and covers share one IP
 * bucket, for the same reason as the gallery: one Explore visit fires all
 * three. 180 reads / 15 min matches the other public surfaces.
 */
export const publicEventsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: {
    success: false,
    error: 'Too many event requests. Please slow down and try again shortly.',
    message: 'Too many event requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public agency directory (M9 D3). Listing, facets, profile and logo share one
 * IP bucket: a single directory page fires the listing, the facets and up to a
 * page of logos, so splitting them would only multiply the allowance. 180
 * reads / 15 min matches the gallery brake.
 */
export const publicDirectoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: {
    success: false,
    error: 'Too many directory requests. Please slow down and try again shortly.',
    message: 'Too many directory requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Public proposal accept (A7) — the only public write. The 256-bit token is
 * the capability, but acceptance changes commercial state, so the brake is
 * tighter than the read limiter: 20 accepts / 15 min / IP.
 */
export const proposalAcceptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many requests. Please slow down and try again shortly.',
    message: 'Too many requests. Please slow down and try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * A8 per-agency buckets. These share one bucket across every member of a
 * tenant (the per-user limiters above stay stacked in front), so one busy
 * desk cannot exhaust a shared hour budget on its own. They must run after
 * the tenant guard — `req.agency` is set there; the params fallback only
 * covers routes where the guard has not run yet, which never mounts these.
 */

const agencyKey = (req: any): string =>
  String(req?.agency?._id ?? req?.params?.agencyId ?? 'unknown');

export const agencyWideExportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: agencyKey,
  validate: false,
  message: {
    success: false,
    error: 'This agency has reached its hourly export limit. Please try again in an hour.',
    message: 'This agency has reached its hourly export limit. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const agencyInviteCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: agencyKey,
  validate: false,
  message: {
    success: false,
    error: 'This agency has reached its hourly invitation limit. Please try again in an hour.',
    message: 'This agency has reached its hourly invitation limit. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const agencyAssetUploadAgencyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  keyGenerator: agencyKey,
  validate: false,
  message: {
    success: false,
    error: 'This agency has reached its hourly asset upload limit. Please try again in an hour.',
    message: 'This agency has reached its hourly asset upload limit. Please try again in an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------------------------------------------------------------- */
/*  Public agency enquiries (M9 D5)                                           */
/* -------------------------------------------------------------------------- */

/**
 * The enquiry form is the directory's only anonymous **write**, so it carries
 * three stacked daily buckets. Each covers a different abuse:
 *
 * - **IP** — one household or office cannot flood an agency from one address.
 * - **Email** — a single traveller cannot spray every agency from changing IPs
 *   (and a typo'd retry does not eat the whole IP budget).
 * - **Agency** — no single listing can be buried in a lead flood meant to make
 *   the inbox useless.
 *
 * The email key is the submitted address, lowercased and trimmed. A missing or
 * malformed address falls back to the IP key rather than a shared `unknown`
 * bucket, so bad input cannot lock every visitor out at once.
 */
export const ENQUIRY_IP_DAILY_LIMIT = 5;
export const ENQUIRY_EMAIL_DAILY_LIMIT = 3;
export const ENQUIRY_AGENCY_DAILY_LIMIT = 50;

const enquiryEmailKey = (req: any): string => {
  const raw = req?.body?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email ? `email:${email}` : `ip:${req?.ip ?? 'anonymous'}`;
};

const enquiryAgencyKey = (req: any): string => {
  const slug = typeof req?.params?.slug === 'string' ? req.params.slug.trim() : '';
  return slug ? `agency:${slug}` : `ip:${req?.ip ?? 'anonymous'}`;
};

const ENQUIRY_LIMIT_COPY = 'You have sent the maximum number of enquiries for today. Please try again tomorrow.';

export const enquiryIpLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: ENQUIRY_IP_DAILY_LIMIT,
  message: {
    success: false,
    error: ENQUIRY_LIMIT_COPY,
    message: ENQUIRY_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const enquiryEmailLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: ENQUIRY_EMAIL_DAILY_LIMIT,
  keyGenerator: enquiryEmailKey,
  validate: false,
  message: {
    success: false,
    error: ENQUIRY_LIMIT_COPY,
    message: ENQUIRY_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const enquiryAgencyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: ENQUIRY_AGENCY_DAILY_LIMIT,
  keyGenerator: enquiryAgencyKey,
  validate: false,
  message: {
    success: false,
    error:
      'This agency has received the maximum number of enquiries for today. Please try again tomorrow.',
    message:
      'This agency has received the maximum number of enquiries for today. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------------------------------------------------------------- */
/*  Public event interest (M10 E2)                                            */
/* -------------------------------------------------------------------------- */

/**
 * The "I'm interested" form is anonymous, so it is guarded from several sides:
 *
 * - **Network** — a cheap outer ceiling across every event, sized for a shared
 *   household, office, school or carrier-NAT address rather than one person.
 * - **Network × event** — the bucket that actually stops one listing flooding,
 *   without spending a traveller's room to ask about a different camp.
 * - **Email** — one person cannot queue up on many events from rotating IPs;
 *   the key falls back to the network when the address is missing or malformed.
 * - **Event** — no single listing can be buried in interest at all.
 *
 * Every ceiling is env-tunable (M10-QA-13) so ops can widen it for an audience
 * behind one address, and every refusal names the 24-hour reset: the window is
 * rolling, not "until midnight", and visitors were reading it as the latter.
 */
export const EVENT_INTEREST_IP_DAILY_LIMIT = env.EVENT_INTEREST_IP_DAILY_LIMIT;
export const EVENT_INTEREST_EVENT_IP_DAILY_LIMIT =
  env.EVENT_INTEREST_EVENT_IP_DAILY_LIMIT;
export const EVENT_INTEREST_EMAIL_DAILY_LIMIT = env.EVENT_INTEREST_EMAIL_DAILY_LIMIT;
export const EVENT_INTEREST_EVENT_DAILY_LIMIT = env.EVENT_INTEREST_EVENT_DAILY_LIMIT;

const EVENT_INTEREST_WINDOW_MS = 24 * 60 * 60 * 1000;

const eventInterestNetworkOf = (req: any): string => String(req?.ip ?? 'anonymous');

const eventInterestEmailKey = (req: any): string => {
  const raw = req?.body?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email ? `email:${email}` : `ip:${eventInterestNetworkOf(req)}`;
};

const eventInterestEventIpKey = (req: any): string => {
  const eventId =
    typeof req?.params?.eventId === 'string' ? req.params.eventId.trim() : '';
  return eventId
    ? `event-ip:${eventId}:${eventInterestNetworkOf(req)}`
    : `ip:${eventInterestNetworkOf(req)}`;
};

const eventInterestEventKey = (req: any): string => {
  const eventId =
    typeof req?.params?.eventId === 'string' ? req.params.eventId.trim() : '';
  return eventId ? `event:${eventId}` : `ip:${eventInterestNetworkOf(req)}`;
};

const EVENT_INTEREST_LIMIT_COPY =
  'You have reached the daily limit for event requests from this network. Please try again in 24 hours.';
const EVENT_INTEREST_EMAIL_LIMIT_COPY =
  'You have reached the daily limit for event requests from this email address. Please try again in 24 hours.';
const EVENT_INTEREST_EVENT_IP_LIMIT_COPY =
  'You have reached the daily limit for requests about this event from your network. Please try again in 24 hours.';
const EVENT_INTEREST_EVENT_LIMIT_COPY =
  'This event has received the maximum number of requests for today. Please try again in 24 hours.';

export const eventInterestIpLimiter = rateLimit({
  windowMs: EVENT_INTEREST_WINDOW_MS,
  max: EVENT_INTEREST_IP_DAILY_LIMIT,
  message: {
    success: false,
    error: EVENT_INTEREST_LIMIT_COPY,
    message: EVENT_INTEREST_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const eventInterestEmailLimiter = rateLimit({
  windowMs: EVENT_INTEREST_WINDOW_MS,
  max: EVENT_INTEREST_EMAIL_DAILY_LIMIT,
  keyGenerator: eventInterestEmailKey,
  validate: false,
  message: {
    success: false,
    error: EVENT_INTEREST_EMAIL_LIMIT_COPY,
    message: EVENT_INTEREST_EMAIL_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const eventInterestEventIpLimiter = rateLimit({
  windowMs: EVENT_INTEREST_WINDOW_MS,
  max: EVENT_INTEREST_EVENT_IP_DAILY_LIMIT,
  keyGenerator: eventInterestEventIpKey,
  validate: false,
  message: {
    success: false,
    error: EVENT_INTEREST_EVENT_IP_LIMIT_COPY,
    message: EVENT_INTEREST_EVENT_IP_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const eventInterestEventLimiter = rateLimit({
  windowMs: EVENT_INTEREST_WINDOW_MS,
  max: EVENT_INTEREST_EVENT_DAILY_LIMIT,
  keyGenerator: eventInterestEventKey,
  validate: false,
  message: {
    success: false,
    error: EVENT_INTEREST_EVENT_LIMIT_COPY,
    message: EVENT_INTEREST_EVENT_LIMIT_COPY,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------------------------------------------------------------- */
/*  Enquiry conversations (M9 D8)                                             */
/* -------------------------------------------------------------------------- */

/**
 * A guest thread is a capability link, not a session, so it gets its own pair of
 * buckets instead of the enquiry-form ones: reading is cheap and can be
 * generous, while writing is the spam surface. The read limit also leaves room
 * for a traveller refreshing the thread and the proposals beside it.
 */
export const conversationReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: {
    success: false,
    error: 'This conversation is being opened too often. Please try again shortly.',
    message: 'This conversation is being opened too often. Please try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const conversationWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'You have sent a lot of messages. Please try again in a few minutes.',
    message: 'You have sent a lot of messages. Please try again in a few minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/* -------------------------------------------------------------------------- */
/*  Enquiry live streams (M9 R1)                                              */
/* -------------------------------------------------------------------------- */

/**
 * One SSE connection is one tab; EventSource reconnects after a deploy, a wake
 * from sleep or a flaky network. Sixty per quarter hour per signed-in account
 * (falling back to the IP) absorbs that churn while still bounding a client
 * that reconnects in a tight loop. The per-channel stream cap is the backstop.
 */
const enquiryStreamKey = (req: any): string =>
  req?.userId ? `user:${req.userId}` : `ip:${req?.ip ?? 'anonymous'}`;

export const enquiryStreamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: enquiryStreamKey,
  validate: false,
  message: {
    success: false,
    error: 'Live updates are reconnecting too often. Please refresh in a moment.',
    message: 'Live updates are reconnecting too often. Please refresh in a moment.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
