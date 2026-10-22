import { Router } from 'express';
import multer from 'multer';
import { ProjectController } from '../controllers/project.controller';
import { SprintController } from '../controllers/sprint.controller';
import { authenticate, requirePermission, requireAnyPermission, requireRoleOrPermission } from '../middleware/auth.middleware';
import { MAX_PROJECT_DOCUMENT_SIZE } from '../services/object-storage.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PROJECT_DOCUMENT_SIZE,
    files: 1,
  },
});

const router = Router();

// All project routes require authentication
router.use(authenticate);

// ── Tech Leads Oversight ───────────────────────────────────────────────────
router.get('/tech-leads', requirePermission('PROJECT_READ'), ProjectController.getTechLeads);
router.get('/permissions/registry', requirePermission('PROJECT_READ'), ProjectController.getAvailablePermissions);

// ── Project CRUD ─────────────────────────────────────────────────────────────
router.get('/health-overview', requirePermission('PROJECT_READ'), ProjectController.getHealthOverview);
router.get('/', requirePermission('PROJECT_READ'), ProjectController.list);
router.post('/', requirePermission('PROJECT_CREATE'), ProjectController.create);
router.get('/user/:userId/memberships', requirePermission('PROJECT_READ'), ProjectController.getUserMemberships);
router.get('/:id', requirePermission('PROJECT_READ'), ProjectController.getById);
router.patch('/:id', requirePermission('PROJECT_UPDATE'), ProjectController.update);
router.post('/:id/archive', requirePermission('PROJECT_UPDATE'), ProjectController.archive);
router.delete('/:id', requireAnyPermission('PROJECT_DELETE', 'PROJECT_UPDATE'), ProjectController.delete);
router.get('/:id/extension-requests', requirePermission('PROJECT_READ'), ProjectController.getExtensionRequests);

// ── Project Members & Roles ────────────────────────────────────────────────────
router.get('/:id/members', requirePermission('PROJECT_READ'), ProjectController.getMembers);
router.get('/:id/members/:userId/check', requirePermission('PROJECT_READ'), ProjectController.checkMemberStatus);
router.post('/:id/members', requireAnyPermission('PROJECT_UPDATE', 'PROJECT_MEMBER_MANAGE', 'PROJECT_MEMBER_CREATE'), ProjectController.addMember);
router.patch('/:id/members/roles', requireAnyPermission('ROLE_ASSIGN', 'PROJECT_ROLE_ASSIGN', 'PROJECT_UPDATE'), ProjectController.updateMemberRoles);
router.patch('/:id/members/:userId/permissions', requireRoleOrPermission(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), ProjectController.updateMemberPermissions);
router.delete('/:id/members/:userId', requireAnyPermission('PROJECT_UPDATE', 'PROJECT_MEMBER_MANAGE', 'PROJECT_MEMBER_DELETE'), ProjectController.removeMember);
router.get('/:id/roles', requirePermission('PROJECT_READ'), ProjectController.getProjectRoles);
router.post('/:id/roles', requirePermission('PROJECT_UPDATE'), ProjectController.createCustomRole);

// ── Project Sprints ──────────────────────────────────────────────────────────
router.get('/:id/sprints', requirePermission('PROJECT_READ'), SprintController.list);
router.post('/:id/sprints', requireAnyPermission('CYCLE_CREATE', 'SPRINT_CREATE', 'PROJECT_UPDATE'), SprintController.create);
router.get('/:id/sprints/:sprintId', requirePermission('PROJECT_READ'), SprintController.getById);
router.patch('/:id/sprints/:sprintId', requireAnyPermission('CYCLE_UPDATE', 'SPRINT_UPDATE', 'PROJECT_UPDATE'), SprintController.update);
router.post('/:id/sprints/:sprintId/start', requireAnyPermission('CYCLE_ACTIVATE', 'SPRINT_ACTIVATE', 'PROJECT_UPDATE'), SprintController.start);
router.post('/:id/sprints/:sprintId/complete', requireAnyPermission('CYCLE_UPDATE', 'SPRINT_UPDATE', 'PROJECT_UPDATE'), SprintController.complete);
router.post('/:id/sprints/:sprintId/reopen', requireAnyPermission('CYCLE_UPDATE', 'SPRINT_UPDATE', 'PROJECT_UPDATE'), SprintController.reopen);
router.delete('/:id/sprints/:sprintId', requirePermission('PROJECT_UPDATE'), SprintController.delete);

// ── Project Documents ────────────────────────────────────────────────────────
router.get('/:id/documents', requirePermission('PROJECT_READ'), ProjectController.getDocuments);
router.post('/:id/documents', requireAnyPermission('DOCUMENT_UPLOAD', 'PROJECT_UPDATE'), upload.single('file'), ProjectController.createDocument);
router.get('/:id/documents/:documentId/download', requirePermission('PROJECT_READ'), ProjectController.downloadDocument);
router.get('/:id/documents/:documentId/preview', requirePermission('PROJECT_READ'), ProjectController.previewDocument);
router.patch('/:id/documents/:documentId', requirePermission('PROJECT_UPDATE'), ProjectController.updateDocument);
router.delete('/:id/documents/:documentId', requireAnyPermission('DOCUMENT_DELETE', 'PROJECT_UPDATE'), ProjectController.deleteDocument);

export { router as projectRouter };

