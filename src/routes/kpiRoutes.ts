import { Router } from 'express';
import {
  getKPIs,
  getFleetStatus,
  getRoutePerformance,
} from '../controllers/kpiController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// All KPI routes require admin/management role
router.use(authenticate);
router.use(authorize(UserRole.ADMIN, UserRole.MANAGEMENT));

// GET /api/kpis — main KPI overview
router.get('/', getKPIs);

// GET /api/kpis/fleet — fleet status
router.get('/fleet', getFleetStatus);

// GET /api/kpis/routes — route performance
router.get('/routes', getRoutePerformance);

export default router;