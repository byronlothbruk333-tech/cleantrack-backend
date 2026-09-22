import { Router } from 'express';
import {
  uploadSingleFile,
  uploadMultipleFilesController,
  uploadBeforeAfter,
  deleteUploadedFile,
} from '../controllers/uploadController';
import { authenticate } from '../middleware/auth';
import { uploadSingle, uploadMultiple, uploadBeforeAfter as uploadBeforeAfterMiddleware } from '../middleware/upload';

const router = Router();

// ============================================
// ALL UPLOAD ROUTES REQUIRE AUTHENTICATION
// ============================================
router.use(authenticate);

// ============================================
// UPLOAD ROUTES
// ============================================

// POST /api/upload — single file upload
router.post('/', uploadSingle, uploadSingleFile);

// POST /api/upload/multiple — up to 5 files
router.post('/multiple', uploadMultiple, uploadMultipleFilesController);

// POST /api/upload/before-after — for driver complaint stops
router.post(
  '/before-after',
  uploadBeforeAfterMiddleware,
  uploadBeforeAfter
);

// DELETE /api/upload — delete a file by URL
router.delete('/', deleteUploadedFile);

export default router;