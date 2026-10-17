import { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { isAllowedReceiptMime, maxUploadBytes, maxUploadMb } from '../services/finance/receipt.js';

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
