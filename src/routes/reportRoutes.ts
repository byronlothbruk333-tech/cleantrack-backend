import { Router } from 'express';
import {
  createReport,
  getMyReports,
  getAllReports,
  getReportById,
  updateReportStatus,
  updateReport,
  deleteReport,
  getReportStats,
  getReportCounts,
  getReportsByCitizen,
  getReportComments,
  addReportComment,
  deleteReportComment,
  assignTruckToComplaint, // ADDED
} from '../controllers/reportController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

router.use(authenticate);

// ============================================
// SPECIFIC ROUTES (must be before /:id)
// ============================================
router.get(
  '/counts',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getReportCounts
);

router.get(
  '/by-citizen/:citizenId',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getReportsByCitizen
);

router.get('/stats', getReportStats);
router.get('/my', getMyReports);

// ============================================
// GENERAL LISTING
// ============================================
router.get(
  '/',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT, UserRole.DRIVER),
  getAllReports
);

// ============================================
// CREATE
// ============================================
router.post('/', createReport);

// ============================================
// SPECIFIC RESOURCE ROUTES
// ============================================
router.get('/:id', getReportById);
router.put('/:id', updateReport);
router.delete('/:id', deleteReport);

// ============================================
// ADMIN-ONLY STATUS UPDATE
// ============================================
router.patch(
  '/:id/status',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  updateReportStatus
);

// ============================================
// ASSIGN TRUCK TO COMPLAINT (NEW)
// ============================================
router.post(
  '/:id/assign-truck',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  assignTruckToComplaint
);

// ============================================
// COMMENT ROUTES
// ============================================
router.get('/:id/comments', getReportComments);
router.post('/:id/comments', addReportComment);
router.delete('/:id/comments/:commentId', deleteReportComment);

export default router;