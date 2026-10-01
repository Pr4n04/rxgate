const rateLimit = require('express-rate-limit');

// Shared rate limiters.
// `server.js` previously advertised "rate limiting" in its startup banner while
// no limiter was installed anywhere, leaving /api/auth/login open to unlimited
// credential stuffing. These limiters are mounted explicitly so the banner
// reflects reality.

// Terse 429 body so the frontend can surface it without special-casing.
function handler(req, res) {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
    retryAfterSeconds: Math.ceil((res.retryAfter || 60) / 1000),
  });
}

// Login/signup get a low limit since every request is a password guess. Uses the
// email in the key as well as the IP so people on the same wifi don't block each
// other out by using up the whole limit.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => {
    const email = (req.body && req.body.email ? String(req.body.email) : '')
      .toLowerCase()
      .trim();
    return `${req.ip}:${email || 'no-email'}`;
  },
});

// Writes that create work or spend money.
// Mounted app-wide under /api and filtered to mutating verbs, so it is easy to
// forget on a new route. Reads are already covered by apiLimiter.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip: (req) =>
    !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ||
    req.path.startsWith('/orders/webhook'),
});

// General API ceiling, so the app cannot be used to hammer the DB.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  // Stripe retries webhook deliveries; throttling them loses payment events.
  skip: (req) => req.path.startsWith('/orders/webhook'),
});

module.exports = { authLimiter, writeLimiter, apiLimiter };