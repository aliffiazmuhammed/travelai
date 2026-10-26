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
