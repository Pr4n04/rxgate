const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Map an allowed MIME type to a fixed extension.
// The extension used to come from `path.extname(file.originalname)`, which is
// attacker-controlled, while the type check only looks at the client-declared
// `Content-Type` of the multipart part — which is equally attacker-controlled.
// Uploads are served straight off disk by express.static, so a file stored as
// `.html` is returned as `text/html` from the app's own origin: stored XSS.
// Deriving the extension from the allowlist removes that.
const EXTENSION_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const ALLOWED_TYPES = Object.keys(EXTENSION_BY_MIME);

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Only ever an extension from the allowlist, never the client's name.
    cb(null, `${uuidv4()}${EXTENSION_BY_MIME[file.mimetype] || '.bin'}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (EXTENSION_BY_MIME[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1,
  },
});

module.exports = upload;
module.exports.uploadsDir = uploadsDir;
module.exports.ALLOWED_TYPES = ALLOWED_TYPES;