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
