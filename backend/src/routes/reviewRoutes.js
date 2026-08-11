import { Router } from 'express';
import * as reviewController from '../controllers/reviewController.js';

const router = Router({ mergeParams: true });

router.get('/', reviewController.listReviews);
router.post('/', reviewController.createReview);
router.get('/:id', reviewController.getReview);
router.patch('/:id/status', reviewController.updateReviewStatus);
router.delete('/:id', reviewController.deleteReview);

export default router;
