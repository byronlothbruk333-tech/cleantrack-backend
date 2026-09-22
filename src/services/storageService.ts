import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import path from 'path';
import dns from 'dns';

// ============================================
// ✅ FORCE IPv4 DNS — MUST BE BEFORE SUPABASE CLIENT
// ============================================
dns.setDefaultResultOrder('ipv4first');

// ============================================
// SUPABASE CLIENT (with service role key for admin access)
// ============================================
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'cleantrack-uploads';

// ============================================
// ALLOWED FILE TYPES
// ============================================
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// ============================================
// GENERATE UNIQUE FILENAME
// ============================================
export const generateFilename = (originalName: string): string => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}${ext}`;
};

// ============================================
// UPLOAD A SINGLE FILE
// ============================================
export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export const uploadFile = async (
  file: Express.Multer.File,
  folder: string = 'general'
): Promise<UploadResult> => {
  try {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return {
        success: false,
        error: `File type ${file.mimetype} not allowed. Allowed: JPG, PNG, WebP`,
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      };
    }

    // Generate unique filename
    const filename = generateFilename(file.originalname);
    const filePath = `${folder}/${filename}`;

    // Upload to Supabase
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      success: true,
      url: urlData.publicUrl,
      path: filePath,
    };
  } catch (error: any) {
    console.error('Upload file error:', error);
    return { success: false, error: error.message || 'Upload failed' };
  }
};

// ============================================
// UPLOAD MULTIPLE FILES
// ============================================
export const uploadMultipleFiles = async (
  files: Express.Multer.File[],
  folder: string = 'general'
): Promise<{ urls: string[]; paths: string[]; errors: string[] }> => {
  const urls: string[] = [];
  const paths: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const result = await uploadFile(file, folder);
    if (result.success && result.url && result.path) {
      urls.push(result.url);
      paths.push(result.path);
    } else {
      errors.push(`${file.originalname}: ${result.error}`);
    }
  }

  return { urls, paths, errors };
};

// ============================================
// DELETE A FILE
// ============================================
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Supabase delete error:', error);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error('Delete file error:', error);
    return false;
  }
};

// ============================================
// EXTRACT FILE PATH FROM PUBLIC URL
// ============================================
export const extractFilePathFromUrl = (publicUrl: string): string | null => {
  try {
    // URL format: https://xxx.supabase.co/storage/v1/object/public/BUCKET/folder/filename
    const url = new URL(publicUrl);
    const parts = url.pathname.split('/');
    // Find the index of the bucket name
    const bucketIndex = parts.indexOf(BUCKET_NAME);
    if (bucketIndex === -1) return null;
    return parts.slice(bucketIndex + 1).join('/');
  } catch {
    return null;
  }
};