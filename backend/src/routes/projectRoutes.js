import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as projectController from '../controllers/projectController.js';
import reviewRoutes from './reviewRoutes.js';

const router = Router();

router.use(requireAuth);

router.get('/', projectController.listProjects);
router.post('/', projectController.createProject);
router.get('/:id', projectController.getProject);
router.patch('/:id', projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

// Reviews are nested under a project: /api/projects/:projectId/reviews
router.use('/:projectId/reviews', reviewRoutes);

export default router;
