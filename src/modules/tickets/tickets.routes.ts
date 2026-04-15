import { Router } from 'express';
import { ticketsController } from './tickets.controller';
import { authenticate, requireRole } from '../../shared/middleware/authentication';

const router = Router();

// All ticket routes require authentication
router.use(authenticate);

// Ticket CRUD
router.post('/', ticketsController.create);
router.get('/', ticketsController.list);
router.get('/stats', ticketsController.getStats);
router.get('/:id', ticketsController.getById);
router.patch('/:id', ticketsController.update);
router.delete('/:id', requireRole('ADMIN_3SC', 'CLIENT_ADMIN'), ticketsController.delete);

// AI features
router.post('/:id/ai-triage', ticketsController.runAiTriage);
router.get('/:id/similar', ticketsController.getSimilar);

export default router;
