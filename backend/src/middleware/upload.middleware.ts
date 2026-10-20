import { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { isAllowedReceiptMime, maxUploadBytes, maxUploadMb } from '../services/finance/receipt.js';
import {
  avatarMaxBytes,
  avatarMaxMb,
  isAllowedAvatarMime,
} from '../services/user/avatar.js';

/**
 * Receipt uploads are buffered in memory (capped by `MAX_UPLOAD_MB`) so the
 * file's magic bytes can be verified before anything is written to disk, and a
 * rejected upload leaves no partial file behind.
 *
 * This `fileFilter` only rejects the *declared* MIME type; the controller also
 * sniffs the actual bytes (`contentMatchesMime`), so a renamed file cannot slip
 * through.
 */
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes(), files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedReceiptMime(file.mimetype)) {
      callback(new AppError('Receipts must be a JPEG, PNG or WebP image, or a PDF.', 400));
      return;
    }
    callback(null, true);
  },
}).single('receipt');

/**
 * Runs the multer middleware and converts its errors into friendly `AppError`s
 * (a raw `MulterError` would otherwise surface as an opaque 500).
 */
export const handleReceiptUpload: RequestHandler = (req, res, next) => {
  receiptUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(`Receipts must be smaller than ${maxUploadMb()} MB.`, 413));
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError('Please upload a single receipt file.', 400));
        return;
      }
      next(new AppError('We could not process that upload. Please try again.', 400));
      return;
    }

    next(error);
  });
};

/**
 * F14 profile photos: same in-memory-then-sniff contract as receipts, but the
 * allow-list is images only and the cap is smaller (`AVATAR_MAX_MB`, 2 MB by
 * default). The declared MIME is only a first filter — the controller sniffs
 * the bytes before anything is stored.
 */
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: avatarMaxBytes(), files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedAvatarMime(file.mimetype)) {
      callback(new AppError('Choose a JPEG, PNG or WebP photo.', 400));
      return;
    }
    callback(null, true);
  },
}).single('avatar');

export const handleAvatarUpload: RequestHandler = (req, res, next) => {
  avatarUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(`Photos must be smaller than ${avatarMaxMb()} MB.`, 413));
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError('Please upload a single photo.', 400));
        return;
      }
      next(new AppError('We could not process that photo. Please try again.', 400));
      return;
    }

    next(error);
  });
};
