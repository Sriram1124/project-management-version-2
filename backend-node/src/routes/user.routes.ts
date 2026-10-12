import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/user.controller';
import { TimesheetController } from '../controllers/timesheet.controller';
import { authenticate, requireRole, requirePermission } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
});

// All user routes require authentication
router.use(authenticate);

// List organization users (scoped to user's organization)
router.get('/', requirePermission('USER_READ'), UserController.list);

// Manager provisions individual user
router.post('/', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.create);

// Manager downloads schema-aware CSV template
router.get('/bulk/template', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.getTemplate);

// Manager validates CSV for bulk preview
router.post('/bulk/validate', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), upload.any(), UserController.validateCsv);

// Manager confirms bulk creation
router.post('/bulk', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), upload.any(), UserController.createBulk);

// User updates own profile
router.patch('/profile', UserController.updateProfile);

// Manager-authorized individual work report for a selected organization user
router.get('/:userId/timesheet/report', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), TimesheetController.getIndividualReport);

// Manager resets an organization user's password
router.post('/:id/reset-password', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.resetPassword);

// Manager deactivates an organization user
router.post('/:id/deactivate', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.deactivate);

// Manager updates an organization member's permitted details (name, batch, subbatch)
router.patch('/:id', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.updateMember);

export { router as userRouter };
