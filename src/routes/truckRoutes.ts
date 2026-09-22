import { Router } from 'express';
import {
  createTruck,
  getAllTrucks,
  getTruckById,
  getMyTruck,
  updateTruck,
  updateTruckStatus,
  deleteTruck,
  getTruckStats,
} from '../controllers/truckController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// ============================================
// ALL TRUCK ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticate);

// ============================================
// SPECIFIC ROUTES FIRST (before /:id)
// ============================================

// GET /api/trucks/stats — fleet statistics
router.get('/stats', getTruckStats);

// GET /api/trucks/my — driver's own truck
router.get('/my', authorize(UserRole.DRIVER), getMyTruck);

// ============================================
// LIST ALL TRUCKS (any authenticated user)
// ============================================
router.get('/', getAllTrucks);

// ============================================
// CREATE (admin/management only)
// ============================================
router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  createTruck
);

// ============================================
// SPECIFIC RESOURCE ROUTES
// ============================================
router.get('/:id', getTruckById);

// PUT /api/trucks/:id — full update (admin only)
router.put(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  updateTruck
);

// PATCH /api/trucks/:id/status — status update (driver on own truck OR admin)
router.patch('/:id/status', updateTruckStatus);

// DELETE /api/trucks/:id — admin only
router.delete(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  deleteTruck
);

export default router;