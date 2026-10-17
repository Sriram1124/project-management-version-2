import { Router } from 'express';
import { WorkItemController } from '../controllers/work-item.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All work-item routes require authentication
router.use(authenticate);

// ── WorkItem CRUD ─────────────────────────────────────────────────────────────
router.post('/', WorkItemController.create);
router.get('/', WorkItemController.list);
router.get('/analytics', WorkItemController.getAnalytics);
router.get('/:id', WorkItemController.getById);
router.patch('/:id', WorkItemController.update);
router.put('/:id', WorkItemController.update);
router.delete('/:id', WorkItemController.delete);

// ── Assignees ─────────────────────────────────────────────────────────────────
router.post('/:id/assignees', WorkItemController.addAssignees);
router.delete('/:id/assignees/:userId', WorkItemController.removeAssignee);

// ── WorkItem Comments ────────────────────────────────────────────────────────
router.get('/:id/comments', WorkItemController.getComments);
router.post('/:id/comments', WorkItemController.addComment);
router.put('/:id/comments/:commentId', WorkItemController.updateComment);
router.delete('/:id/comments/:commentId', WorkItemController.deleteComment);

export { router as workItemRouter };
