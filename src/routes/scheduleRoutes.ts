import { Router } from 'express';
import {
  getSuburbs,
  getSuburbSchedule,
  getZoneSchedule,
  getAllZonesSchedules,
} from '../controllers/scheduleController';

const router = Router();

// ============================================
// PUBLIC ROUTES (no authentication required)
// ============================================

// GET /api/schedules/suburbs — list all suburbs
router.get('/suburbs', getSuburbs);

// GET /api/schedules — all zone schedules
router.get('/', getAllZonesSchedules);

// GET /api/schedules/suburb/:suburb — schedule for a suburb
router.get('/suburb/:suburb', getSuburbSchedule);

// GET /api/schedules/zone/:zone — schedule for a zone
router.get('/zone/:zone', getZoneSchedule);

export default router;