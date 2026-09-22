import { Request, Response } from 'express';
import {
  uploadFile,
  uploadMultipleFiles,
  deleteFile,
  extractFilePathFromUrl,
} from '../services/storageService';
import { AuthRequest } from '../middleware/auth';

// ============================================
// UPLOAD SINGLE FILE
// POST /api/upload
// Requires: authenticate
// ============================================
export const uploadSingleFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided',
        message: 'Please upload a file with field name "file"',
      });
    }

    // Determine folder based on role
    const folder = req.user.role === 'citizen' ? 'citizen-reports' : 
                   req.user.role === 'driver' ? 'driver-photos' : 'general';

    const result = await uploadFile(req.file, folder);

    if (!result.success) {
      return res.status(400).json({
        error: 'Upload failed',
        message: result.error,
      });
    }

    res.json({
      message: 'File uploaded successfully',
      url: result.url,
      path: result.path,
    });
  } catch (error: any) {
    console.error('Upload single file error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPLOAD MULTIPLE FILES
// POST /api/upload/multiple
// Requires: authenticate
// Max: 5 files
// ============================================
export const uploadMultipleFilesController = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'No files provided',
        message: 'Please upload files with field name "files"',
      });
    }

    const folder = req.user.role === 'citizen' ? 'citizen-reports' : 
                   req.user.role === 'driver' ? 'driver-photos' : 'general';

    const result = await uploadMultipleFiles(files, folder);

    res.json({
      message: `${result.urls.length} file(s) uploaded successfully`,
      urls: result.urls,
      paths: result.paths,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    console.error('Upload multiple files error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// UPLOAD BEFORE/AFTER PHOTOS (for driver stops)
// POST /api/upload/before-after
// Requires: authenticate (driver/admin)
// ============================================
export const uploadBeforeAfter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const beforeFile = files?.beforePhoto?.[0];
    const afterFile = files?.afterPhoto?.[0];

    const result: {
      beforePhoto?: string;
      afterPhoto?: string;
      errors: string[];
    } = { errors: [] };

    if (beforeFile) {
      const upload = await uploadFile(beforeFile, 'route-stops');
      if (upload.success) {
        result.beforePhoto = upload.url;
      } else {
        result.errors.push(`Before photo: ${upload.error}`);
      }
    }

    if (afterFile) {
      const upload = await uploadFile(afterFile, 'route-stops');
      if (upload.success) {
        result.afterPhoto = upload.url;
      } else {
        result.errors.push(`After photo: ${upload.error}`);
      }
    }

    if (!result.beforePhoto && !result.afterPhoto) {
      return res.status(400).json({
        error: 'No photos uploaded',
        message: 'Please upload beforePhoto and/or afterPhoto',
        errors: result.errors,
      });
    }

    res.json({
      message: 'Photos uploaded successfully',
      beforePhoto: result.beforePhoto,
      afterPhoto: result.afterPhoto,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    console.error('Upload before/after error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE A FILE
// DELETE /api/upload
// Requires: authenticate
// Body: { fileUrl: "https://..." }
// ============================================
export const deleteUploadedFile = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { fileUrl } = req.body;

    if (!fileUrl) {
      return res.status(400).json({
        error: 'Missing fileUrl',
        message: 'fileUrl is required in the request body',
      });
    }

    const filePath = extractFilePathFromUrl(fileUrl);
    if (!filePath) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'The provided URL is not a valid CleanTrack file URL',
      });
    }

    const success = await deleteFile(filePath);

    if (!success) {
      return res.status(500).json({
        error: 'Delete failed',
        message: 'Could not delete the file from storage',
      });
    }

    res.json({
      message: 'File deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete file error:', error);
    res.status(500).json({
      error: 'Delete failed',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    });
  }
};