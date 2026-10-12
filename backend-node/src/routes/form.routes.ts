import { Router } from 'express';
import { FormController } from '../controllers/form.controller';
import { authenticate, requireAnyPermission } from '../middleware/auth.middleware';

const router = Router();

// Require login for all routes
router.use(authenticate);

// Get forms
router.get('/', FormController.listForms);

// Manager only: create/update forms
router.post('/', requireAnyPermission('FORM_CREATE', 'PROJECT_CREATE'), FormController.createForm);
router.get('/:id', FormController.getForm);
router.patch('/:id', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.updateForm);

// Status changes
router.post('/:id/publish', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.publishForm);
router.post('/:id/archive', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.archiveForm);

// Questions
router.post('/:id/questions', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.addQuestion);
router.patch('/:id/questions/:questionId', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.updateQuestion);
router.delete('/:id/questions/:questionId', requireAnyPermission('FORM_UPDATE', 'PROJECT_UPDATE'), FormController.deleteQuestion);

// Submissions
router.get('/:id/submissions/my', FormController.getMySubmission);
router.get('/:id/submissions', requireAnyPermission('FORM_READ', 'PROJECT_READ'), FormController.listSubmissions);
router.post('/:id/submissions', FormController.submitForm);

// Form delete
router.delete('/:id', requireAnyPermission('FORM_DELETE', 'PROJECT_DELETE'), FormController.deleteForm);

export { router as formRouter };
