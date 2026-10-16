import { Response } from 'express';
import * as authService from '../services/auth.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthenticatedRequest } from '../types/index.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none' as const,
  maxAge: 3600000, // 1 hour
};

export const signup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signup(email, password);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(201).json({ success: true, user });
});

export const signin = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  const { user, token } = await authService.signin(email, password);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(200).json({ success: true, user });
});

export const logout = catchAsync(async (_req: AuthenticatedRequest, res: Response) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const getMe = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const user = await authService.getUserById(req.userId!);
  res.status(200).json({ success: true, user });
});
