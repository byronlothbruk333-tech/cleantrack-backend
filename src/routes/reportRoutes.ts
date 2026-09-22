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
} from '../controllers/reportController';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// ============================================
// ALL REPORT ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticate);

// ============================================
// SPECIFIC ROUTES FIRST (before /:id)
// ============================================

// GET /api/reports/counts — admin: status counts
router.get(
  '/counts',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getReportCounts
);

// GET /api/reports/by-citizen/:citizenId — admin: reports from a citizen
router.get(
  '/by-citizen/:citizenId',
  authorize(UserRole.ADMIN, UserRole.MANAGEMENT),
  getReportsByCitizen
);

// GET /api/reports/stats — citizen: their own stats
router.get('/stats', getReportStats);

// GET /api/reports/my — citizen: their own reports
router.get('/my', getMyReports);

// ============================================
// GENERAL LISTING (admin/driver)
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
// COMMENT ROUTES
// ============================================
router.get('/:id/comments', getReportComments);
router.post('/:id/comments', addReportComment);
router.delete('/:id/comments/:commentId', deleteReportComment);

export default router;