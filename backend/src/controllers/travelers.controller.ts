import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync.js';
import { loadTravelerProfile } from '../services/gallery/traveler.js';

/** GET /api/travelers/:handle — anonymous gallery profile (Milestone 8 G2). */
export const getTravelerProfile = catchAsync(async (req: Request, res: Response) => {
  const traveler = await loadTravelerProfile(req.params.handle);
  res.status(200).json({ success: true, traveler });
});
