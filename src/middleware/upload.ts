import multer from 'multer';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../services/storageService';

// ============================================
// MULTER CONFIGURATION
// ============================================
// Store files in memory (Buffer) — then we upload to Supabase Storage
// This is cleaner than storing on disk and re-uploading
const storage = multer.memoryStorage();

// ============================================
// FILE FILTER
// ============================================
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed. Use JPG, PNG, or WebP.`));
  }
};

// ============================================
// SINGLE FILE UPLOAD
// ============================================
export const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
}).single('file'); // Field name must be 'file'

// ============================================
// MULTIPLE FILE UPLOAD (up to 5)
// ============================================
export const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5,
  },
}).array('files', 5); // Field name 'files', max 5

// ============================================
// SPECIFIC FIELD UPLOADS (for route stops)
// ============================================
export const uploadBeforeAfter = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 2,
  },
}).fields([
  { name: 'beforePhoto', maxCount: 1 },
  { name: 'afterPhoto', maxCount: 1 },
]);