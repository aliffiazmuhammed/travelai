import { Router } from 'express';
import {
  deleteBlock,
  getBlocks,
  postBlock,
} from '../controllers/blocks.controller.js';
import { protectPersonal } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { blockUserSchema } from '../schemas/gallery.schema.js';

/**
 * Personal block list (Milestone 8 G5).
 *
 * The list is an account setting, not a trip resource: no `:id` trip guard
 * here, because a block applies to every trip the owner has (and will have).
 * Every route is `protectPersonal`; agency/platform sessions are refused.
 */
const router = Router();

router.get('/', protectPersonal, getBlocks);
router.post('/:userId', protectPersonal, validate(blockUserSchema), postBlock);
router.delete('/:userId', protectPersonal, deleteBlock);

export default router;
