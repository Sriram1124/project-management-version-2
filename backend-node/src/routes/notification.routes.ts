import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate, requireRoleOrPermission } from '../middleware/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Authenticated user: retrieve notifications and unread counts
router.get('/', NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.patch('/read-all', NotificationController.markAllRead);
router.patch('/:id/archive', NotificationController.archive);
router.patch('/:id/unarchive', NotificationController.unarchive);
router.patch('/:id/read', NotificationController.markRead);
router.patch('/:id', NotificationController.markRead);

// Manager / Tech Lead / Admin: create and dispatch broadcast notification
router.post('/', requireRoleOrPermission(['MANAGER', 'TECH_LEAD', 'ADMIN', 'SUPER_ADMIN'], 'NOTIFICATION_CREATE'), NotificationController.create);

export { router as notificationRouter };
