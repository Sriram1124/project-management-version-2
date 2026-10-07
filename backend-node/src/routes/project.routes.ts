import { Router } from 'express';
import multer from 'multer';
import { ProjectController } from '../controllers/project.controller';
import { authenticate, requirePermission, requireAnyPermission } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const router = Router();

// All project routes require authentication
router.use(authenticate);

// ── Project CRUD ─────────────────────────────────────────────────────────────
router.get('/', requirePermission('PROJECT_READ'), ProjectController.list);
router.post('/', requirePermission('PROJECT_CREATE'), ProjectController.create);
router.get('/:id', requirePermission('PROJECT_READ'), ProjectController.getById);
router.patch('/:id', requirePermission('PROJECT_UPDATE'), ProjectController.update);
router.post('/:id/archive', requirePermission('PROJECT_UPDATE'), ProjectController.archive);

// ── Project Members ──────────────────────────────────────────────────────────
router.get('/:id/members', requirePermission('PROJECT_READ'), ProjectController.getMembers);
router.post('/:id/members', requirePermission('PROJECT_UPDATE'), ProjectController.addMember);
router.delete('/:id/members/:userId', requirePermission('PROJECT_UPDATE'), ProjectController.removeMember);

// ── Project Documents ────────────────────────────────────────────────────────
router.get('/:id/documents', requirePermission('PROJECT_READ'), ProjectController.getDocuments);
router.post('/:id/documents', requireAnyPermission('DOCUMENT_UPLOAD', 'PROJECT_UPDATE'), upload.single('file'), ProjectController.createDocument);
router.get('/:id/documents/:documentId/download', requirePermission('PROJECT_READ'), ProjectController.downloadDocument);
router.get('/:id/documents/:documentId/preview', requirePermission('PROJECT_READ'), ProjectController.previewDocument);
router.patch('/:id/documents/:documentId', requirePermission('PROJECT_UPDATE'), ProjectController.updateDocument);
router.delete('/:id/documents/:documentId', requirePermission('PROJECT_UPDATE'), ProjectController.deleteDocument);

export { router as projectRouter };
