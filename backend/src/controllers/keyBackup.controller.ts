import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../utils/AppError.js';
import { AuthenticatedRequest } from '../types/index.js';
import { tripContext } from '../middleware/tripAccess.middleware.js';
import { BACKUP_BODY_MAX, keyBackupEpochParam } from '../schemas/keyBackup.schema.js';
import {
  getAccountBackup, enrollAccountBackup, recoverAccountBackup,
  getBackupEpochs, getBackupTrips, getTripBackups, putTripBackup, parseBackupInput,
} from '../services/auth/keyBackup.js';

/** Global JSON parsing is bounded too; apply a tighter limit before backup work. */
export function backupBodyLimit(req: Request, _res: Response, next: NextFunction) {
  if (Number(req.get('content-length') || 0) > BACKUP_BODY_MAX ||
      Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8') > BACKUP_BODY_MAX) {
    return next(new AppError('Key backup requests must be at most 8 KB.', 413));
  }
  next();
}
export const getKeyBackup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, backup: await getAccountBackup(String(req.userId)) });
});
export const enrollKeyBackup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, backup: await enrollAccountBackup(String(req.userId), req.body) });
});
export const recoverKeyBackup = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, backup: await recoverAccountBackup(String(req.userId), req.body) });
});
export const getKeyBackupTrips = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...await getBackupTrips(String(req.userId), req.query) });
});
export const getKeyBackupEpochs = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { trip } = tripContext(req);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...await getBackupEpochs(String(trip._id), String(req.userId), req.query) });
});
export const getKeyBackupRows = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { trip } = tripContext(req);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...await getTripBackups(String(trip._id), String(req.userId), req.query) });
});
export const putKeyBackupRow = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
  const { trip } = tripContext(req);
  const epoch = parseBackupInput(keyBackupEpochParam, req.params.epoch);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, backup: await putTripBackup(String(trip._id), String(req.userId), epoch, req.body) });
});
