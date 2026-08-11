import { Router } from 'express';
import * as commentController from '../controllers/commentController.js';

// Mounted under both /api/projects/:projectId/reviews/:reviewId/comments
// (not used directly today) and /api/reviews/:reviewId/comments — mergeParams
// lets it read :reviewId regardless of the parent router.
const router = Router({ mergeParams: true });

router.get('/', commentController.listComments);
router.post('/', commentController.createComment);
router.delete('/:commentId', commentController.deleteComment);

export default router;
