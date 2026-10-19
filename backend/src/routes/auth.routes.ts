import { Router } from 'express';
import { signup, signin, logout, getMe, getCsrfToken, publishChatKey } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { issueCsrfCookie } from '../middleware/csrf.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { signupSchema, signinSchema } from '../schemas/auth.schema.js';
import { publishChatKeySchema } from '../schemas/chatKey.schema.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.post('/signup', authLimiter, validate(signupSchema), signup);
router.post('/signin', authLimiter, validate(signinSchema), signin);
router.post('/logout', logout);
// CSRF bootstrap: hands the token to cross-origin SPAs in the body, because a
// cross-site client cannot read the `csrf` cookie set on this origin. The
// cookie is issued app-wide by `issueCsrfCookie`; this route just re-issues
// when missing and echoes the value.
router.get('/csrf', issueCsrfCookie, getCsrfToken);
router.get('/me', protect, getMe);
// Chat identity (Milestone 7, F10): the browser publishes ONLY its public
// ECDH key half. The private half never travels — that is the E2EE premise.
router.put('/chat-key', protect, validate(publishChatKeySchema), publishChatKey);

export default router;
