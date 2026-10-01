const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');
const { createCheckoutSession, getSession } = require('../controllers/stripe');
const { sendStatusUpdateEmail } = require('../controllers/email');

const router = express.Router();

// POST /api/orders/create - Return the payment link for an approved prescription.
//
// The Stripe session is normally created at approval time (admin.js) and emailed to
// the customer, so this endpoint is only a recovery path for the /payment/:id page.
// Regenerating a session creates a real Stripe object and reveals whether a given
// prescription ID is approved, so an anonymous caller is allowed to re-read an
// existing link but never to mint a new one.
router.post('/create', authenticateToken.optional, async (req, res) => {
  let db;
  try {
    const { prescriptionId } = req.body;

    if (!prescriptionId) {
      return res.status(400).json({ error: 'Prescription ID is required.' });
    }

    db = getDb();
    const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionId);

    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    // Authorisation: staff, or the customer who owns this prescription.
    let canManage = false;
    if (req.user) {
      const { id: userId, email, role } = req.user;
      canManage =
        role === 'admin' ||
        role === 'vet' ||
        (prescription.customer_id && prescription.customer_id === userId) ||
        (prescription.customer_email &&
          prescription.customer_email.toLowerCase() === email.toLowerCase());
    }

    // Get the order
    const order = db.prepare('SELECT * FROM orders WHERE prescription_id = ?').get(prescriptionId);

    if (!order) {
      return res.status(400).json({ error: 'No order found for this prescription.' });
    }

    // If a Stripe session already exists, hand back the link that was emailed.
    if (order.stripe_session_id && prescription.payment_link) {
      return res.json({ paymentUrl: prescription.payment_link });
    }

    // Minting a new checkout session is a state-changing, billable action — require auth.
    if (!canManage) {
      return res.status(401).json({ error: 'Authentication required to start payment for this prescription.' });
    }

    if (prescription.status !== 'approved' && prescription.status !== 'payment_sent') {
      return res.status(400).json({ error: `Prescription is ${prescription.status}. Cannot process payment.` });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await createCheckoutSession({
      prescriptionId,
      customerEmail: prescription.customer_email,
      customerName: prescription.customer_name,
      drugName: prescription.drug_name || 'Veterinary Prescription',
      amount: order.amount,
      successUrl: `${frontendUrl}/payment/success?prescription_id=${prescriptionId}`,
      cancelUrl: `${frontendUrl}/payment/cancel?prescription_id=${prescriptionId}`,
    });

    db.prepare('UPDATE orders SET stripe_session_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(session.id, 'requires_payment', order.id);

    db.prepare('UPDATE prescriptions SET payment_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(session.url, prescriptionId);

    res.json({ paymentUrl: session.url });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to process payment.' });
  } finally {
    if (db) db.close();
  }
});

// POST /api/orders/webhook - Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const prescriptionId = session.metadata?.prescription_id;

    if (prescriptionId) {
      const db = getDb();
      const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionId);

      if (prescription) {
        db.prepare("UPDATE prescriptions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(prescriptionId);
        db.prepare("UPDATE orders SET status = 'completed', stripe_payment_intent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE prescription_id = ?").run(session.payment_intent, prescriptionId);

        // Send receipt email
        try {
          await sendStatusUpdateEmail({
            to: prescription.customer_email,
            customerName: prescription.customer_name,
            prescriptionId,
            status: 'paid',
          });
        } catch (emailError) {
          console.error('Failed to send receipt:', emailError.message);
        }
      }
      db.close();
    }
  }

  res.json({ received: true });
});

// POST /api/orders/mock-complete — development-only stand-in for the Stripe webhook.
//
// Exists solely so the mock checkout page can exercise the paid -> fulfilled flow
// when no Stripe keys are configured. It refuses to exist the moment a real
// STRIPE_SECRET_KEY is present, so there is no simulation path in production;
// real deployments advance state via the signed webhook below.
router.post('/mock-complete', authenticateToken, async (req, res) => {
  if (process.env.STRIPE_SECRET_KEY) {
    return res.status(404).json({ error: 'Not found.' });
  }

  let db;
  try {
    const { prescriptionId } = req.body;
    if (!prescriptionId) {
      return res.status(400).json({ error: 'Prescription ID is required.' });
    }

    db = getDb();
    const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(prescriptionId);
    if (!prescription) {
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    const ownsIt =
      (prescription.customer_id && prescription.customer_id === req.user.id) ||
      (prescription.customer_email &&
        prescription.customer_email.toLowerCase() === req.user.email.toLowerCase()) ||
      req.user.role === 'admin' ||
      req.user.role === 'vet';

    if (!ownsIt) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    db.prepare("UPDATE prescriptions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(prescriptionId);
    db.prepare("UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE prescription_id = ?")
      .run(prescriptionId);

    return res.json({ ok: true, status: 'paid' });
  } catch (error) {
    console.error('Mock completion failed:', error.message);
    return res.status(500).json({ error: 'Failed to complete mock payment.' });
  } finally {
    if (db) db.close();
  }
});

// GET /api/orders/my - Get customer's orders
router.get('/my', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const orders = db.prepare(`
      SELECT o.*, p.status as prescription_status, p.customer_name, p.dosage_instructions
      FROM orders o
      JOIN prescriptions p ON o.prescription_id = p.id
      WHERE o.customer_email = ?
      ORDER BY o.created_at DESC
    `).all(req.user.email);
    db.close();
    res.json({ orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// GET /api/orders/session/:sessionId - Verify payment session
// Authenticated and scoped to the caller's own order: a Stripe session id in a
// browser URL is discoverable, so returning its status to anyone who presents it
// leaks payment activity belonging to other customers.
router.get('/session/:sessionId', authenticateToken, async (req, res) => {
  let db;
  try {
    db = getDb();
    const order = db
      .prepare('SELECT id FROM orders WHERE stripe_session_id = ? AND customer_email = ?')
      .get(req.params.sessionId, req.user.email);

    if (!order) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const session = await getSession(req.params.sessionId);
    return res.json({
      session: {
        id: session.id,
        status: session.status,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
      },
    });
  } catch (error) {
    if (error && error.message === 'Session not found.') {
      return res.status(404).json({ error: 'Session not found.' });
    }
    console.error('Error retrieving session:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve session.' });
  } finally {
    if (db) db.close();
  }
});

module.exports = router;
