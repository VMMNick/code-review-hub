import { Router } from 'express';
import { writeLimiter } from '../middleware/rateLimiters.js';
import { validateUuidParam } from '../middleware/validateParams.js';
import * as reviewController from '../controllers/reviewController.js';

const router = Router({ mergeParams: true });

router.param('id', validateUuidParam('id'));
router.param('revisionId', validateUuidParam('revisionId'));

router.get('/', reviewController.listReviews);
router.post('/', writeLimiter, reviewController.createReview);
router.get('/:id', reviewController.getReview);
router.patch('/:id/status', writeLimiter, reviewController.updateReviewStatus);
router.delete('/:id', reviewController.deleteReview);

router.get('/:id/revisions', reviewController.listRevisions);
router.post('/:id/revisions', writeLimiter, reviewController.addRevision);
router.get('/:id/revisions/:revisionId', reviewController.getRevision);

export default router;
