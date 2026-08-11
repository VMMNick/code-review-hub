import { Router } from 'express';
import { writeLimiter } from '../middleware/rateLimiters.js';
import { validateUuidParam } from '../middleware/validateParams.js';
import * as commentController from '../controllers/commentController.js';

// Mounted under both /api/projects/:projectId/reviews/:reviewId/comments
// (not used directly today) and /api/reviews/:reviewId/comments — mergeParams
// lets it read :reviewId regardless of the parent router. :reviewId itself
// is validated by the parent router that owns that path segment.
const router = Router({ mergeParams: true });

router.param('commentId', validateUuidParam('commentId'));

router.get('/', commentController.listComments);
router.post('/', writeLimiter, commentController.createComment);
router.delete('/:commentId', commentController.deleteComment);

export default router;
