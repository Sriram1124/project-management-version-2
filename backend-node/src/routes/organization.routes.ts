import { Router } from 'express';
import { OrganizationController } from '../controllers/organization.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All organization routes require authentication and SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole(['SUPER_ADMIN']));

// Audit logs
router.get('/audit-logs', OrganizationController.getAuditLogs);

// Platform Overview
router.get('/platform-overview', OrganizationController.getPlatformOverview);

// Organization CRUD & Directory
router.post('/', OrganizationController.create);
router.get('/', OrganizationController.list);
router.get('/:id', OrganizationController.getById);
router.patch('/:id', OrganizationController.update);
router.post('/:id/toggle-status', OrganizationController.toggleStatus);

// Organization Members & Manager Management
router.get('/:id/members', OrganizationController.getMembers);
router.post('/:id/managers', OrganizationController.addManager);
router.get('/:id/managers/template', OrganizationController.getManagerTemplate);
router.post('/:id/managers/validate-csv', OrganizationController.validateBulkCsv);
router.post('/:id/managers/bulk', OrganizationController.importManagersBulk);
router.post('/:id/managers/:managerId/reset-password', OrganizationController.resetManagerPassword);

export { router as organizationRouter };
