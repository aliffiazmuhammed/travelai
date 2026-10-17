import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Operational application errors (custom thrown AppErrors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      message: err.message,
    });
  }

  // MongoDB / Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    const friendlyMessage =
      field === 'email'
        ? 'An account with this email already exists. Please sign in instead.'
        : `An account with this ${field} already exists. Please try another or sign in.`;

    return res.status(409).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e: any) => e.message);
    const friendlyMessage = messages[0] || 'Invalid input data provided.';
    return res.status(400).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
      details: messages,
    });
  }

  // Mongoose invalid ObjectId / Cast error
  if (err.name === 'CastError') {
    const friendlyMessage = 'The requested resource could not be found with the provided identifier.';
    return res.status(400).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
    });
  }

  // JWT Token Expiration
  if (err.name === 'TokenExpiredError') {
    const friendlyMessage = 'Your session has expired. Please sign in again to continue.';
    return res.status(401).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
    });
  }

  // JWT Invalid Token
  if (err.name === 'JsonWebTokenError') {
    const friendlyMessage = 'Authentication session is invalid. Please sign in again.';
    return res.status(401).json({
      success: false,
      error: friendlyMessage,
      message: friendlyMessage,
    });
  }

  // Unhandled / Internal Server Error
  console.error('Unhandled internal server error:', err);

  const isProd = process.env.NODE_ENV === 'production';
  const friendlyMessage = isProd
    ? 'Something went wrong on our end. Please try again in a few moments.'
    : err.message || 'An unexpected error occurred. Please try again.';

  return res.status(500).json({
    success: false,
    error: friendlyMessage,
    message: friendlyMessage,
  });
};
