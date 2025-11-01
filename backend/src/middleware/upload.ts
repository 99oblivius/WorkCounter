import multer from 'multer';
import { Request } from 'express';

// Configure multer for memory storage (we'll process and upload to MinIO)
const storage = multer.memoryStorage();

// File filter to only accept images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only image MIME types
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only images are allowed (jpeg, jpg, png, gif, webp)`));
  }
};

// Configure multer with limits
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max per file
    files: 9, // Max 9 files for 3x3 grid
  },
});

// Middleware for handling multiple image uploads
export const uploadImages = upload.array('images', 9);

// Middleware for handling single image upload
export const uploadImage = upload.single('image');
