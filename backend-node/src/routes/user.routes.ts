import { Router } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/user.controller';
import { TimesheetController } from '../controllers/timesheet.controller';
import { authenticate, requireRole, requirePermission, requireRoleOrPermission } from '../middleware/auth.middleware';

const router = Router();
const MAX_CSV_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB limit for bulk CSV user import
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_CSV_IMPORT_FILE_SIZE,
    files: 1,
  },
});

// All user routes require authentication
router.use(authenticate);

// List organization users (scoped to user's organization)
router.get('/', UserController.list);

// Manager provisions individual user (or user with USER_CREATE permission)
router.post('/', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_CREATE'), UserController.create);

// Manager downloads schema-aware CSV template
router.get('/bulk/template', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_BULK_CREATE', 'USER_CREATE'), UserController.getTemplate);

// Manager validates CSV for bulk preview
router.post('/bulk/validate', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_BULK_CREATE', 'USER_CREATE'), upload.any(), UserController.validateCsv);

// Manager confirms bulk creation
router.post('/bulk', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_BULK_CREATE', 'USER_CREATE'), upload.any(), UserController.createBulk);

// Manager confirms bulk deletion with password verification
router.post('/bulk/delete', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_DELETE'), UserController.deleteBulk);

// User updates own profile
router.patch('/profile', UserController.updateProfile);

// Manager-authorized individual work report for a selected organization user
router.get('/:userId/timesheet/report', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'ATTENDANCE_READ', 'EVALUATION_READ', 'USER_READ'), TimesheetController.getIndividualReport);

// Manager resets an organization user's password
router.post('/:id/reset-password', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_DELETE', 'USER_UPDATE'), UserController.resetPassword);

// Manager deactivates an organization user
router.post('/:id/deactivate', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_DELETE'), UserController.deactivate);

// Manager updates an organization member's permitted details (name, batch, subbatch)
router.patch('/:id', requireRoleOrPermission(['MANAGER', 'ADMIN', 'SUPER_ADMIN'], 'USER_UPDATE'), UserController.updateMember);

// Manager inspects an intern's permissions
router.get('/:id/permissions', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.getUserPermissions);

// Manager updates an intern's explicitly granted permissions
router.put('/:id/permissions', requireRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN']), UserController.updateUserPermissions);

export { router as userRouter };
