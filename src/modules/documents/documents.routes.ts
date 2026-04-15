import { Router } from 'express';
import { documentsController } from './documents.controller';
import { authenticate, requireRole } from '../../shared/middleware/authentication';

const router = Router();

router.use(authenticate);

// Document CRUD
router.post('/', documentsController.create);
router.get('/', documentsController.list);
router.get('/search', documentsController.search);
router.get('/:id', documentsController.getById);
router.patch('/:id', documentsController.update);
router.delete('/:id', requireRole('ADMIN_3SC', 'CLIENT_ADMIN'), documentsController.delete);

// Ticket links
router.post('/:id/link', documentsController.linkTicket);
router.post('/:id/unlink', documentsController.unlinkTicket);

export default router;
