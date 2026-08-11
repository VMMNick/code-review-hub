import { Router } from 'express';
import { writeLimiter } from '../middleware/rateLimiters.js';
import * as reviewController from '../controllers/reviewController.js';

const router = Router({ mergeParams: true });

router.get('/', reviewController.listReviews);
router.post('/', writeLimiter, reviewController.createReview);
router.get('/:id', reviewController.getReview);
router.patch('/:id/status', writeLimiter, reviewController.updateReviewStatus);
router.delete('/:id', reviewController.deleteReview);

export default router;
