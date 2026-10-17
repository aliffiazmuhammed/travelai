import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthenticatedRequest } from '../types/index.js';

export const protect = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    let token = req.cookies?.token;

    // Optional Bearer token header fallback (e.g. for API clients or external tools)
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      const message = 'Please sign in to access this feature.';
      return res.status(401).json({ success: false, error: message, message });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    const message = 'Your session has expired or is invalid. Please sign in again.';
    return res.status(401).json({ success: false, error: message, message });
  }
};
