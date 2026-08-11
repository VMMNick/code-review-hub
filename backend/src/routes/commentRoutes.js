import { Router } from 'express';
import { writeLimiter } from '../middleware/rateLimiters.js';
import { validateUuidParam } from '../middleware/validateParams.js';
import * as commentController from '../controllers/commentController.js';

// Mounted at /api/reviews/:reviewId/comments (see reviewDetailRoutes.js).
// mergeParams lets it read :reviewId from the parent router; :reviewId
// itself is validated there, not here.
const router = Router({ mergeParams: true });

router.param('commentId', validateUuidParam('commentId'));

router.get('/', commentController.listComments);
router.post('/', writeLimiter, commentController.createComment);
router.patch('/:commentId/resolved', writeLimiter, commentController.setCommentResolved);
router.delete('/:commentId', commentController.deleteComment);

export default router;
