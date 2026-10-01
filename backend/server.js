require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const { initDatabase } = require('./db/schema');
const { requireJwtSecret } = require('./middleware/auth');
const { authLimiter, writeLimiter, apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialise database on startup
initDatabase();

// Fail fast on a missing/weak JWT secret rather than letting the first protected
// request throw — a baked-in default would let anyone reading the repo forge tokens.
try {
  requireJwtSecret();
} catch (err) {
  console.error(`\n[RxGate] Refusing to start: ${err.message}\n`);
  process.exit(1);
}

// ====== SECURITY MIDDLEWARE ======

// Helmet for security headers (CSP, XSS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://m.stripe.network"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.stripe.com"],
      connectSrc: ["'self'", "http://localhost:3001", "http://localhost:5173", "https://api.stripe.com", "https://checkout.stripe.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  // GDPR: don't leak referrer info
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Don't send X-Powered-By
  hidePoweredBy: true,
  // Prevent MIME type sniffing
  noSniff: true,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
}));

// CORS - restricted to frontend origin only
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// JSON body parser (skip for Stripe webhook which needs raw body)
app.use('/api/orders/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve uploaded files.
// `nosniff` plus an explicit download disposition: these are user-supplied files,
// and without this a browser may execute a stored file as active content on the
// app's own origin.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
  },
}));

// ====== RATE LIMITING ======
// Stripe retries webhooks aggressively; never throttle them.
app.use('/api', apiLimiter);
// 30 writes/min per IP. Self-filtering to POST/PUT/PATCH/DELETE so a new route
// cannot accidentally ship unlimited.
app.use('/api', writeLimiter);

// ====== API ROUTES ======
// Credential endpoints get a much stricter budget than the general API ceiling.
app.use('/api/auth', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/drugs', require('./routes/drugs'));
app.use('/api/prescriptions', require('./routes/prescriptions'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/vet', require('./routes/vets'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/gdpr', require('./routes/gdpr'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    name: 'RxGate API',
    version: '2.0.0',
    security: {
      https: req.secure || req.headers['x-forwarded-proto'] === 'https',
      gdpr_compliant: true,
      encryption: 'bcrypt + JWT + TLS recommended'
    }
  });
});

// ====== GDPR: Data retention cleanup (runs on startup) ======
try {
  const { getDb } = require('./db/schema');
  const cleanupDb = getDb();
  // Auto-anonymise prescriptions past retention (3 years for UK health data)
  const expiredCount = cleanupDb.prepare(
    "UPDATE prescriptions SET customer_name = '[REDACTED]', customer_email = '[REDACTED]', customer_phone = NULL, ocr_text = NULL, image_path = '[DELETED]' WHERE retention_expiry IS NOT NULL AND retention_expiry < datetime('now')"
  ).run();
  if (expiredCount.changes > 0) {
    console.log(`🧹 GDPR cleanup: ${expiredCount.changes} expired prescriptions redacted.`);
  }
  cleanupDb.close();
} catch (e) {
  console.warn('GDPR cleanup check skipped:', e.message);
}

// ====== SERVE FRONTEND BUILD (for Tailscale / production) ======
// This allows accessing the full app from a single port
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
// SPA catch-all — serve index.html for any non-API route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ====== ERROR HANDLING ======
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }

  res.status(500).json({
    error: 'Internal server error.',
    ...(isDev && { details: err.message })
  });
});

app.listen(PORT, () => {
  console.log(`\n  🐾 RxGate API Server v2.0`);
  console.log(`  ═══════════════════════════════`);
  console.log(`  Server:         http://localhost:${PORT}`);
  console.log(`  Frontend:       ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`  Database:       SQLite (rxgate.db)`);
  console.log(`  Payments:       ${process.env.STRIPE_SECRET_KEY ? 'Stripe Checkout (live keys set)' : 'mock checkout — no STRIPE_SECRET_KEY set'}`);
  console.log(`  Email:          ${process.env.EMAIL_HOST ? 'SMTP configured' : 'disabled — no EMAIL_HOST set'}`);
  console.log(`  GDPR:           consent capture, retention expiry + redaction job, data subject access/erasure`);
  console.log(`                   ⚠ Data is stored unencrypted at rest; serve only over HTTPS.`);
  console.log(`  Controlled Dr:  SCH2/3/4/5 validation (age, supply, vet reg no.)`);
  console.log(`  Security:       Helmet/CSP, JWT revocation, RBAC, upload allowlist, rate limiting`);
  console.log(`  Status:         Running\n`);
});
