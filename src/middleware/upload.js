const multer = require('multer');

// Store files in memory so we can forward them to Supabase Storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'pdf') {
    // Only PDFs for lecture notes
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for notes.'), false);
    }
  } else if (file.fieldname === 'profile_picture') {
    // Images for profile pictures
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF or WebP images are allowed for profile pictures.'), false);
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024  // 20 MB max
  }
});

module.exports = upload;

