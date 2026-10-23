import { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';
import { isAllowedReceiptMime, maxUploadBytes, maxUploadMb } from '../services/finance/receipt.js';
import {
  avatarMaxBytes,
  avatarMaxMb,
  isAllowedAvatarMime,
} from '../services/user/avatar.js';
import {
  AGENCY_FONT_MAX_BYTES,
  AGENCY_FONT_MAX_MB,
  AGENCY_FONT_MIME_TYPES,
  AGENCY_IMAGE_MIME_TYPES,
  normalizeAgencyAssetMime,
} from '../services/agency/assets.js';
import { AGENCY_TEMPLATE_MAX_BYTES } from '../services/agency/exports/templateValidation.js';

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

/**
 * A3 agency brand assets. The cap is the larger font limit; the service then
 * applies the tighter 2 MB image cap based on the declared `kind`. Declared
 * MIME types are only a first filter — the service sniffs every file's bytes
 * before writing it.
 */
const agencyAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AGENCY_FONT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const mime = normalizeAgencyAssetMime(file.mimetype);
    const allowed =
      mime === 'application/octet-stream' ||
      (AGENCY_IMAGE_MIME_TYPES as readonly string[]).includes(mime) ||
      (AGENCY_FONT_MIME_TYPES as readonly string[]).includes(mime);
    if (!allowed) {
      callback(
        new AppError(
          'Choose a JPEG, PNG, WebP, WOFF, WOFF2, TTF or OTF file.',
          400
        )
      );
      return;
    }
    callback(null, true);
  },
}).single('file');

export const handleAgencyAssetUpload: RequestHandler = (req, res, next) => {
  agencyAssetUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(
          new AppError(
            `Brand assets must be smaller than ${AGENCY_FONT_MAX_MB} MB.`,
            413
          )
        );
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError('Attach one file under the "file" field.', 400));
        return;
      }
      next(new AppError('We could not process that upload. Please try again.', 400));
      return;
    }

    next(error);
  });
};

/**
 * A6 template sources. The 512 KiB cap matches the contract validator, so an
 * oversized file fails here before it is buffered. The source is decoded with
 * a fatal UTF-8 decoder later; this filter only checks the declared type.
 */
const TEMPLATE_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/octet-stream',
]);

const agencyTemplateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AGENCY_TEMPLATE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const mime = String(file.mimetype ?? '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (!TEMPLATE_MIME_TYPES.has(mime)) {
      callback(new AppError('Choose an HTML template file.', 400));
      return;
    }
    callback(null, true);
  },
}).single('file');

export const handleAgencyTemplateUpload: RequestHandler = (req, res, next) => {
  agencyTemplateUpload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('Templates must be smaller than 512 KB.', 413));
        return;
      }
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        next(new AppError('Attach one template file under the "file" field.', 400));
        return;
      }
      next(new AppError('We could not process that upload. Please try again.', 400));
      return;
    }

    next(error);
  });
};
