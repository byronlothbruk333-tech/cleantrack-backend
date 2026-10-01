import { Router } from 'express';
import {
  getKPIs,
  getFleetStatus,
  getRoutePerformance,
  getDashboardData,
  resetWeekData,
} from '../controllers/kpiController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// All KPI routes require authentication
router.use(authenticate);

// ============================================
// COMBINED DASHBOARD ENDPOINT (MUST be first)
// ============================================
router.get(
  '/dashboard',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getDashboardData
);

// ============================================
// RESET WEEK ENDPOINT
// ============================================
router.post(
  '/reset-week',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  resetWeekData
);

// ============================================
// INDIVIDUAL ENDPOINTS
// ============================================
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getKPIs
);

router.get(
  '/fleet',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getFleetStatus
);

router.get(
  '/routes',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getRoutePerformance
);

export default router;