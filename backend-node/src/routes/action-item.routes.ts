import { Router } from 'express';
import { ActionItemController } from '../controllers/action-item.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', ActionItemController.list);
router.post('/', ActionItemController.create);
router.get('/:id', ActionItemController.getById);
router.patch('/:id', ActionItemController.update);
router.delete('/:id', ActionItemController.delete);

export const actionItemRouter = router;

