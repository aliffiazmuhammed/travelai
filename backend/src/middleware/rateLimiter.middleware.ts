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
