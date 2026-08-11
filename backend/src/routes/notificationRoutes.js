import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateUuidParam } from '../middleware/validateParams.js';
import * as notificationController from '../controllers/notificationController.js';

const router = Router();

router.use(requireAuth);
router.param('id', validateUuidParam('id'));

router.get('/', notificationController.listNotifications);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);

export default router;
