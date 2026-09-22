import { Router } from 'express';
import {
  register,
  login,
  getMe,
  logout,
  googleAuth,
  changePassword,
  refresh,
  reactivate,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

// ============================================
// PUBLIC ROUTES
// ============================================
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/refresh', refresh);
router.post('/reactivate', authLimiter, reactivate);

// ============================================
// PROTECTED ROUTES (authentication required)
// ============================================
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.post('/change-password', authenticate, changePassword);

export default router;