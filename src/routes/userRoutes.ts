import { Router } from 'express';
import { getDrivers, getAllUsers } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);
router.use(authorize(UserRole.ADMIN, UserRole.MANAGEMENT));

// GET /api/users — list all users
router.get('/', getAllUsers);

// GET /api/users/drivers — list all drivers
router.get('/drivers', getDrivers);

export default router;