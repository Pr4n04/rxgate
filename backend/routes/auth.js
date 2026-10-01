const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken, requireJwtSecret } = require('../middleware/auth');

const router = express.Router();
const TOKEN_EXPIRY = '7d';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const {
      email, password, name, role, practiceName, veterinaryNumber, phone,
      gdprConsent, marketingConsent
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters for security.' });
    }

    // GDPR: require consent
    if (!gdprConsent) {
      return res.status(400).json({
        error: 'You must accept the Privacy Policy and Terms of Service to create an account. GDPR requires your explicit consent to process your personal data.'
      });
    }

    const db = getDb();

    // Check for existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      db.close();
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const validRoles = ['customer', 'vet'];
    const userRole = validRoles.includes(role) ? role : 'customer';

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, practice_name, veterinary_number, phone, gdpr_consent, gdpr_consent_date, gdpr_marketing_consent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, email.toLowerCase().trim(), passwordHash, name.trim(), userRole,
      practiceName || null, veterinaryNumber || null, phone || null,
      gdprConsent ? 1 : 0, new Date().toISOString(),
      marketingConsent ? 1 : 0
    );

    // Generate token and store session
    const token = jwt.sign(
      { id, email: email.toLowerCase().trim(), name: name.trim(), role: userRole },
      requireJwtSecret(),
      { expiresIn: TOKEN_EXPIRY }
    );

    // Store session for revocation capability
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
      uuidv4(), id, tokenHash, expiresAt
    );

    // Log activity
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), id, 'user_registered',
      `${name} registered as ${userRole}. GDPR consent: ${gdprConsent ? 'granted' : 'not granted'}`
    );

    db.close();

    res.status(201).json({
      message: 'Account created successfully. Your data will be processed in accordance with our Privacy Policy.',
      token,
      user: { id, email: email.toLowerCase().trim(), name: name.trim(), role: userRole }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

    if (!user) {
      db.close();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Check if account is closed
    if (user.account_closed) {
      db.close();
      return res.status(403).json({ error: 'This account has been closed. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      db.close();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      requireJwtSecret(),
      { expiresIn: TOKEN_EXPIRY }
    );

    // Store session
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)').run(
      uuidv4(), user.id, tokenHash, expiresAt
    );

    // Log login
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), user.id, 'user_login', `${user.name} logged in`
    );

    db.close();

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        practiceName: user.practice_name, veterinaryNumber: user.veterinary_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, name, role, practice_name, veterinary_number, phone, gdpr_consent, gdpr_consent_date, gdpr_marketing_consent, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  db.close();

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({ user });
});

// POST /api/auth/logout - Revoke current session
router.post('/logout', authenticateToken, (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const db = getDb();
    db.prepare('UPDATE sessions SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
    db.close();

    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout.' });
  }
});

// GET /api/auth/privacy-summary - Public GDPR/privacy info
router.get('/privacy-summary', (req, res) => {
  res.json({
    controller: 'RxGate, Northern Ireland, UK',
    dpo: 'dpo@rxgate.example',
    purposes: [
      'Account management and authentication',
      'Processing veterinary prescriptions',
      'Payment processing via Stripe',
      'Communication regarding orders and prescriptions',
      'Compliance with UK/NI veterinary pharmaceutical regulations',
    ],
    legalBasis: [
      'Consent (GDPR Art. 6(1)(a))',
      'Contract performance (GDPR Art. 6(1)(b))',
      'Legal obligation (GDPR Art. 6(1)(c)) - UK veterinary medicines regulations',
    ],
    retentionPeriod: '3 years after last account activity, or as required by UK/NI law for veterinary records.',
    rights: [
      'Right to access your data (Subject Access Request)',
      'Right to rectification',
      'Right to erasure (Right to be Forgotten)',
      'Right to restrict processing',
      'Right to data portability',
      'Right to object to processing',
    ],
    dataSharing: [
      'Stripe (payment processing) - GDPR compliant',
      'Email service provider (transactional emails)',
      'UK veterinary regulatory authorities (if required by law)',
    ],
    security: [
      'Encrypted data transmission (HTTPS/TLS)',
      'Password hashing with bcrypt (12 rounds)',
      'JWT token-based authentication',
      'Session management with revocation capability',
      'Access logging and monitoring',
    ],
  });
});

module.exports = router;
