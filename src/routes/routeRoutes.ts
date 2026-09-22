import { Router } from 'express';
import {
  createRoute,
  getTodaysRoute,
  getAllRoutes,
  getRouteById,
  updateRouteStatus,
  deleteRoute,
  getRouteStats,
  completeStop,
  skipStop,
  updateStopNotes,
  addStopsToRoute,
  deleteStop,
  createRouteFromComplaints,
} from '../controllers/routeController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// ============================================
// ALL ROUTE ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticate);

// ============================================
// SPECIFIC ROUTES FIRST (before /:id)
// ============================================

// GET /api/routes/today — driver's route for today
router.get('/today', authorize(UserRole.DRIVER), getTodaysRoute);

// GET /api/routes/stats — admin route statistics
router.get(
  '/stats',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getRouteStats
);

// ============================================
// LIST ALL ROUTES (admin/management)
// ============================================
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getAllRoutes
);

// ============================================
// CREATE ROUTE (admin/management)
// ============================================
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  createRoute
);

// POST /api/routes/from-complaints — auto-create route from pending complaints
router.post(
  '/from-complaints',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  createRouteFromComplaints
);

// ============================================
// SPECIFIC RESOURCE ROUTES
// ============================================
router.get('/:id', getRouteById);
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  deleteRoute
);

// PATCH /api/routes/:id/status — update route status
router.patch('/:id/status', updateRouteStatus);

// ============================================
// STOP MANAGEMENT ROUTES
// ============================================

// POST /api/routes/:id/stops — add stops to route (admin)
router.post(
  '/:id/stops',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  addStopsToRoute
);

// PATCH /api/routes/:routeId/stops/:stopId/complete — complete a stop
router.patch('/:routeId/stops/:stopId/complete', completeStop);

// PATCH /api/routes/:routeId/stops/:stopId/skip — skip a stop
router.patch('/:routeId/stops/:stopId/skip', skipStop);

// PATCH /api/routes/:routeId/stops/:stopId/notes — update stop notes
router.patch('/:routeId/stops/:stopId/notes', updateStopNotes);

// DELETE /api/routes/:routeId/stops/:stopId — delete a stop (admin)
router.delete(
  '/:routeId/stops/:stopId',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  deleteStop
);

export default router;