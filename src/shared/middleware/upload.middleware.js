/**
 * src/shared/middleware/upload.middleware.js — File Upload Middleware
 *
 * Uses Multer memory storage and uploads KYC documents directly to Cloudinary.
 */

const multer = require('multer');
const path = require('path');
const AppError = require('../utils/api-error');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// memory storage – no local files
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(AppError.badRequest(`Unsupported file format '${ext}'.`), false);
  }
  cb(null, true);
};

const uploadKyc = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function uploadToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'auto' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// Middleware to upload the file to Cloudinary and attach URL to req.file
async function cloudinaryUploadMiddleware(req, res, next) {
  if (!req.file) return next();
  try {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(req.file.originalname).toLowerCase();
    const publicId = `kyc-${req.user.id}-${suffix}${ext}`;
    const result = await uploadToCloudinary(req.file.buffer, publicId);
    req.file.cloudinaryUrl = result.secure_url;
    next();
  } catch (err) {
    next(AppError.internal(err.message || 'Cloudinary upload failed'));
  }
}

module.exports = { uploadKyc, cloudinaryUploadMiddleware };
