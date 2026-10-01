const express = require('express');
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/prescriptions/:id
 *
 * Used by two very different callers:
 *   1. Staff (admin/vet) and the owning customer inside the app, who are logged in.
 *   2. The recipient of an emailed payment link, who is NOT logged in and may never log in.
 *
 * A prescription is special-category health data under UK GDPR Art.9, so the
 * unauthenticated path returns a redacted projection rather than the patient name
 * and dosage. It is also limited to prescriptions that have already been approved,
 * so a freshly uploaded (still `pending`) record cannot be probed by guessing IDs.
 */

// Fields safe to return to an unauthenticated holder of a payment link.
const REDACTED_FIELDS = ['id', 'drug_name', 'status', 'payment_link', 'created_at'];

/** Full projection for staff and the owning customer. */
const FULL_FIELDS = [
  'id', 'customer_name', 'customer_email', 'drug_name', 'dosage_instructions',
  'status', 'payment_link', 'created_at', 'customer_id',
];

/**
 * `price`, `strength` and `drug_display_name` come from the drugs table —
 * `prescriptions` has no such columns.
 */
const selectPrescription = (db, id) => db.prepare(`
  SELECT p.id, p.customer_name, p.customer_email, p.drug_name, p.dosage_instructions,
         p.status, p.payment_link, p.created_at, p.customer_id,
         d.name as drug_display_name, d.price, d.strength, d.active_ingredient
  FROM prescriptions p
  LEFT JOIN drugs d ON p.drug_id = d.id
  WHERE p.id = ?
`).get(id);

// GET /api/prescriptions/:id - auth optional; access is scoped when a token is present
router.get('/:id', authenticateToken.optional, (req, res) => {
  let db;
  try {
    db = getDb();
    const prescription = selectPrescription(db, req.params.id);
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    // ── Authenticated: staff or the owning customer get the full record ──
    if (req.user) {
      const { id: userId, email, role } = req.user;
      const isStaff = role === 'admin' || role === 'vet';
      const isOwner =
        (prescription.customer_id && prescription.customer_id === userId) ||
        (prescription.customer_email &&
          prescription.customer_email.toLowerCase() === email.toLowerCase());

      if (isStaff || isOwner) {
        const { customer_id, ...rest } = prescription;
        return res.json({ prescription: rest, viewer: isStaff ? 'staff' : 'owner' });
      }
      // Authenticated but not entitled — fall through to the redacted view so the
      // payment-link flow still works, but never return identifying fields.
    }

    // ── Unauthenticated (or authenticated-but-not-entitled): redacted view ──
    // Only once approved, so pending uploads cannot be enumerated.
    if (prescription.status === 'pending') {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const redacted = {};
    for (const field of REDACTED_FIELDS) redacted[field] = prescription[field];
    // A display name for the drug is fine; the patient is not identified.
    redacted.drug_display_name = prescription.drug_display_name;
    redacted.strength = prescription.strength;
    redacted.redacted = true;

    return res.json({ prescription: redacted, viewer: 'public-link' });
  } catch (error) {
    console.error('Error fetching prescription:', error);
    res.status(500).json({ error: 'Failed to fetch prescription.' });
  } finally {
    if (db) db.close();
  }
});

module.exports = router;