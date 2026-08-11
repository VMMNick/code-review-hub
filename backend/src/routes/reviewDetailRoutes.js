import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validateParams.js';
import * as reviewController from '../controllers/reviewController.js';
import commentRoutes from './commentRoutes.js';

// Top-level access to a single review by id, without needing the
// project id up front (e.g. deep-linking to /reviews/:id in the UI).
// Access control still happens inside the controller via assertProjectAccess.
const router = Router();

router.use(requireAuth);

router.param('id', validateUuidParam('id'));
router.param('reviewId', validateUuidParam('reviewId'));

router.get('/:id', reviewController.getReview);
router.patch('/:id/status', reviewController.updateReviewStatus);
router.delete('/:id', reviewController.deleteReview);

// Comments: /api/reviews/:reviewId/comments
router.use('/:reviewId/comments', commentRoutes);

export default router;
