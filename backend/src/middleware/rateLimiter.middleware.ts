import rateLimit from 'express-rate-limit';

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
