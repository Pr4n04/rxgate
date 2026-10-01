const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All GDPR routes require authentication
router.use(authenticateToken);

/**
 * POST /api/gdpr/consent - Update GDPR consent preferences
 * Body: { gdprConsent: boolean, marketingConsent: boolean }
 */
router.post('/consent', (req, res) => {
  try {
    const { gdprConsent, marketingConsent } = req.body;
    const db = getDb();

    if (gdprConsent !== undefined) {
      db.prepare('UPDATE users SET gdpr_consent = ?, gdpr_consent_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(gdprConsent ? 1 : 0, gdprConsent ? new Date().toISOString() : null, req.user.id);

      db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
        uuidv4(), req.user.id, 'gdpr_consent_updated',
        `GDPR consent updated to ${gdprConsent ? 'granted' : 'withdrawn'}`
      );
    }

    if (marketingConsent !== undefined) {
      db.prepare('UPDATE users SET gdpr_marketing_consent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(marketingConsent ? 1 : 0, req.user.id);
    }

    db.close();

    res.json({
      message: 'Consent preferences updated.',
      consent: { gdprConsent, marketingConsent }
    });
  } catch (error) {
    console.error('Error updating consent:', error);
    res.status(500).json({ error: 'Failed to update consent.' });
  }
});

/**
 * GET /api/gdpr/data - Export all personal data (Subject Access Request)
 * Returns a JSON payload with all data held about the user
 */
router.get('/data', (req, res) => {
  try {
    const db = getDb();

    // User profile
    const user = db.prepare(
      'SELECT id, email, name, role, practice_name, veterinary_number, phone, gdpr_consent, gdpr_consent_date, gdpr_marketing_consent, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      db.close();
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prescriptions associated with this user.
    // customer_email must be selected: it is used both to scope the rows (below)
    // and to decide whether to redact. Without it in the projection every row was
    // redacted, so the subject's own access request came back with [REDACTED].
    const prescriptions = db.prepare(
      "SELECT id, customer_name, customer_email, drug_name, dosage_instructions, status, is_controlled_drug, upload_source, created_at, updated_at FROM prescriptions WHERE customer_id = ? OR customer_email = ?"
    ).all(req.user.id, user.email);

    // Orders
    const orders = db.prepare(
      "SELECT id, prescription_id, drug_name, amount, status, created_at FROM orders WHERE customer_id = ? OR customer_email = ?"
    ).all(req.user.id, user.email);

    // Activity log entries
    const activity = db.prepare(
      "SELECT action, details, created_at FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
    ).all(req.user.id);

    // Data requests history
    const dataRequests = db.prepare(
      "SELECT request_type, status, created_at, completed_at FROM data_requests WHERE user_id = ? OR email = ?"
    ).all(req.user.id, user.email);

    db.close();

    // Log the export request
    const exportDb = getDb();
    exportDb.prepare('INSERT INTO data_requests (id, user_id, email, request_type, status, completed_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuidv4(), req.user.id, user.email, 'export', 'completed', new Date().toISOString()
    );
    exportDb.close();

    // Compile the data package
    const dataPackage = {
      exportedAt: new Date().toISOString(),
      dataController: 'RxGate, Northern Ireland, UK',
      dataProtectionOfficer: 'dpo@rxgate.example',
      retentionPolicy: 'Personal data is retained for 3 years after last interaction, or as required by UK/NI veterinary pharmaceutical regulations.',
      userProfile: user,
      prescriptions: prescriptions.map(p => ({
        ...p,
        // Include the address only where the exporting subject is the owner.
        // Compared case-insensitively — emails are stored lowercased at signup
        // but prescription uploads may carry mixed case.
        customer_email:
          p.customer_email &&
          p.customer_email.toLowerCase() === user.email.toLowerCase()
            ? p.customer_email
            : '[REDACTED]'
      })),
      orders,
      activityLog: activity,
      dataRequests,
    };

    // Set content type to JSON for easy machine-readability
    res.json(dataPackage);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data.' });
  }
});

/**
 * POST /api/gdpr/request-deletion - Request account deletion (Right to be Forgotten)
 * Body: { confirmation: string (must equal 'DELETE') }
 */
router.post('/request-deletion', (req, res) => {
  try {
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({
        error: 'Please type "DELETE" to confirm account deletion request.'
      });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      db.close();
      return res.status(404).json({ error: 'User not found.' });
    }

    // Record the deletion request
    const requestId = uuidv4();
    db.prepare('INSERT INTO data_requests (id, user_id, email, request_type, status) VALUES (?, ?, ?, ?, ?)').run(
      requestId, req.user.id, user.email, 'deletion', 'pending'
    );

    // Log it
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'gdpr_deletion_requested',
      `Account deletion requested for ${user.email}`
    );

    db.close();

    res.json({
      message: 'Account deletion request received. We will process this within 30 days as per GDPR requirements.',
      requestId,
      reference: `DSR-${requestId.substring(0, 8)}`
    });
  } catch (error) {
    console.error('Error requesting deletion:', error);
    res.status(500).json({ error: 'Failed to process deletion request.' });
  }
});

/**
 * GET /api/gdpr/consent-status - Get current consent preferences
 */
router.get('/consent-status', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT gdpr_consent, gdpr_consent_date, gdpr_marketing_consent FROM users WHERE id = ?').get(req.user.id);
    db.close();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      gdprConsent: user.gdpr_consent === 1,
      gdprConsentDate: user.gdpr_consent_date,
      marketingConsent: user.gdpr_marketing_consent === 1,
      consentVersion: '2025-1',
      dataController: 'RxGate',
      dpoEmail: 'dpo@rxgate.example',
    });
  } catch (error) {
    console.error('Error fetching consent:', error);
    res.status(500).json({ error: 'Failed to fetch consent status.' });
  }
});

module.exports = router;
