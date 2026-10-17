import { Response } from 'express';
import * as authService from '../services/auth.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const getCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true, // Prevents client-side scripts from reading the cookie (protects against XSS)
    secure: isProd, // Requires HTTPS transmission in production
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax', // 'none' allows secure cross-origin in production; 'lax' for local dev
    path: '/', // Available across all backend and frontend routes
    maxAge: SESSION_DURATION_MS,
    expires: new Date(Date.now() + SESSION_DURATION_MS),
  };
};

export const signup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signup(email, password);
  res.cookie('token', token, getCookieOptions());
  res.status(201).json({ success: true, user });
});

export const signin = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signin(email, password);
  res.cookie('token', token, getCookieOptions());
  res.status(200).json({ success: true, user });
});

export const logout = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  const opts = getCookieOptions();
  res.clearCookie('token', {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const getMe = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getUserById(req.userId!);
  res.status(200).json({ success: true, user });
});
