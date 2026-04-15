import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate, requireRole } from '../../shared/middleware/authentication';
import { authLimiter } from '../../shared/middleware/rate-limiter';

const router = Router();

// Public routes with rate limiting
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);

// Protected routes
router.use(authenticate);

router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.get('/me', authController.me);
router.post('/change-password', authController.changePassword);
router.get('/sessions', authController.sessions);

// Admin only
router.get('/admin/users', requireRole('ADMIN_3SC'), async (_req, res) => {
  // Placeholder for user management
  res.json({ success: true, message: 'User management endpoint' });
});

export default router;
