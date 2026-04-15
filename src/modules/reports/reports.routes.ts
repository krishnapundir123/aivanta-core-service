import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../shared/middleware/authentication';

const router = Router();

router.use(authenticate);

router.get('/', reportsController.generate);
router.get('/saved', reportsController.listSaved);
router.post('/save', reportsController.save);
router.get('/dashboard', reportsController.getDashboardMetrics);

export default router;
