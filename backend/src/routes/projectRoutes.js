import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiters.js';
import * as projectController from '../controllers/projectController.js';
import reviewRoutes from './reviewRoutes.js';

const router = Router();

router.use(requireAuth);

router.get('/', projectController.listProjects);
router.post('/', writeLimiter, projectController.createProject);
router.get('/:id', projectController.getProject);
router.patch('/:id', writeLimiter, projectController.updateProject);
router.delete('/:id', projectController.deleteProject);

router.get('/:id/members', projectController.listMembers);
router.post('/:id/members', writeLimiter, projectController.addMember);
router.patch('/:id/members/:userId', writeLimiter, projectController.updateMemberRole);
router.delete('/:id/members/:userId', projectController.removeMember);

// Reviews are nested under a project: /api/projects/:projectId/reviews
router.use('/:projectId/reviews', reviewRoutes);

export default router;
