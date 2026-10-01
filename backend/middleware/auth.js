const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../db/schema');

// The JWT secret is mandatory. Falling back to a literal baked into the source
// would mean anyone with read access to the repository can forge an admin token,
// so a missing value is a hard startup failure rather than a default.
function requireJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. ' +
      'Set it in backend/.env — generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  return secret;
}

function readToken(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

// Reject a token that has been explicitly revoked at logout.
// Without this, `sessions.revoked` was written but never read, so "logout"
// was client-side only and a stolen token stayed valid until natural expiry.
// Sessions are keyed by `sha256(rawToken)` — the same hash written at login and
// updated at logout — so we hash the presented token to look the session up.
function isRevoked(rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  let db;
  try {
    db = getDb();
    const row = db
      .prepare('SELECT revoked FROM sessions WHERE token_hash = ? LIMIT 1')
      .get(tokenHash);
    return Boolean(row && row.revoked);
  } catch {
    // If the revocation store is unavailable, fail open on verification rather
    // than locking every user out.
    return false;
  } finally {
    if (db) db.close();
  }
}

function verify(req, secret) {
  const token = readToken(req);
  if (!token) return { error: 'missing', status: 401, message: 'Authentication required. Please log in.' };
  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch (err) {
    // 401, not 403: an invalid or expired token means "authenticate again".
    // The client only clears its session on 401, so a 403 here wedges the UI.
    return { error: 'invalid', status: 401, message: 'Session expired or invalid. Please log in again.' };
  }
  if (isRevoked(token)) {
    return { error: 'revoked', status: 401, message: 'Session has been revoked. Please log in again.' };
  }
  return { payload };
}

// Require a valid, unrevoked token.
function authenticateToken(req, res, next) {
  const result = verify(req, requireJwtSecret());
  if (result.error) {
    return res.status(result.status).json({ error: result.message });
  }
  req.user = result.payload;
  next();
}

// Attach req.user when a valid token is present, but never reject.
// Used by routes that serve both authenticated staff and anonymous holders
// of an emailed link, where access is scoped per-response instead.
authenticateToken.optional = (req, res, next) => {
  try {
    const result = verify(req, requireJwtSecret());
    if (!result.error) req.user = result.payload;
  } catch {
    // Missing JWT_SECRET should still be a startup failure, not per-request noise.
  }
  next();
};

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, requireJwtSecret };