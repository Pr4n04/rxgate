const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { createCheckoutSession } = require('../controllers/stripe');
const { sendPaymentLinkEmail, sendStatusUpdateEmail } = require('../controllers/email');
const { validateControlledDrugPrescription, getCdScheduleInfo, isControlledDrug } = require('../controllers/validation');
const upload = require('../middleware/upload');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireRole('admin'));

// ====== PRESCRIPTION MANAGEMENT ======

// GET /api/admin/prescriptions - List all prescriptions with filters
router.get('/prescriptions', (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*,
             u.name as vet_name, u.practice_name,
             d.name as drug_display_name, d.price, d.controlled_drug_schedule as drug_cd_schedule
      FROM prescriptions p
      LEFT JOIN users u ON p.vet_id = u.id
      LEFT JOIN drugs d ON p.drug_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.is_controlled_drug DESC, p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const prescriptions = db.prepare(query).all(...params);

    const countQuery = 'SELECT COUNT(*) as total FROM prescriptions' + (status ? ' WHERE status = ?' : '');
    const countResult = db.prepare(countQuery).get(...(status ? [status] : []));

    // Add CD info to each prescription
    // Also flag cart items not detected in OCR text
    const allDrugs = db.prepare('SELECT id, name, active_ingredient FROM drugs WHERE is_active = 1').all();
    for (const p of prescriptions) {
      if (p.is_controlled_drug) {
        p.cd_info = getCdScheduleInfo(p.cd_schedule || p.drug_cd_schedule);
      }

      // Match cart items against OCR text to flag items not in the prescription
      if (p.cart_items && p.ocr_text && p.ocr_text !== '[OCR failed]') {
        try {
          const items = JSON.parse(p.cart_items);
          if (items.length > 0 && allDrugs.length > 0) {
            const textLower = p.ocr_text.toLowerCase().trim();
            const words = textLower.split(/\s+/);
            const bigrams = [];
            for (let i = 0; i < words.length - 1; i++) {
              bigrams.push(words[i] + ' ' + words[i + 1]);
            }

            // Find which drugs the OCR text detected
            const detectedDrugIds = new Set();
            const detectedDrugNames = new Set();
            for (const drug of allDrugs) {
              const drugName = drug.name.toLowerCase();
              const ingredient = (drug.active_ingredient || '').toLowerCase();
              let detected = false;

              if (textLower.includes(drugName)) {
                detected = true;
              } else if (drugName.split(' ').some(word => word.length > 3 && textLower.includes(word))) {
                detected = true;
              } else if (ingredient && textLower.includes(ingredient)) {
                detected = true;
              } else {
                const drugBigrams = [];
                const drugWords = drugName.split(/\s+/);
                for (let j = 0; j < drugWords.length - 1; j++) {
                  drugBigrams.push((drugWords[j] + ' ' + drugWords[j + 1]).toLowerCase());
                }
                const overlap = drugBigrams.filter(b => bigrams.includes(b)).length;
                if (overlap > 0) detected = true;
              }

              if (detected) {
                detectedDrugIds.add(drug.id);
                detectedDrugNames.add(drug.name.toLowerCase());
              }
            }

            // Flag each cart item (always recompute — overrides any stale upload-time flags)
            for (const item of items) {
              const itemName = (item.drugName || '').toLowerCase().trim();
              const inPrescription = detectedDrugIds.has(item.drugId)
                || detectedDrugNames.has(itemName)
                || [...detectedDrugNames].some(detectedName =>
                    (itemName && detectedName.includes(itemName))
                    || (itemName && itemName.includes(detectedName))
                  );
              item.notInPrescription = !inPrescription;
            }
            p.cart_items = JSON.stringify(items);
          }
        } catch (parseError) {
          // If parsing fails, leave cart_items as-is
        }
      }
    }

    db.close();

    res.json({ prescriptions, total: countResult.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to fetch prescriptions.' });
  }
});

// POST /api/admin/prescriptions/:id/validate-cd - Validate a controlled drug prescription
router.post('/prescriptions/:id/validate-cd', (req, res) => {
  try {
    const { vetRegNumber, prescriptionDate, supplyDays, adminNotes } = req.body;
    const db = getDb();

    const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
    if (!prescription) {
      db.close();
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    if (!prescription.is_controlled_drug) {
      db.close();
      return res.status(400).json({ error: 'This prescription is not a controlled drug.' });
    }

    // Get the CD schedule from prescription or linked drug
    let cdSchedule = prescription.cd_schedule;
    if (!cdSchedule && prescription.drug_id) {
      const drug = db.prepare('SELECT controlled_drug_schedule FROM drugs WHERE id = ?').get(prescription.drug_id);
      if (drug) cdSchedule = drug.controlled_drug_schedule;
    }

    if (!cdSchedule) {
      db.close();
      return res.status(400).json({ error: 'Cannot determine controlled drug schedule for validation.' });
    }

    const validation = validateControlledDrugPrescription({
      cdSchedule,
      prescriptionDate: prescriptionDate || prescription.prescription_date,
      vetRegNumber: vetRegNumber || prescription.vet_reg_number_on_rx,
      supplyDays: supplyDays || 28,
    });

    res.json({ validation, cdSchedule: getCdScheduleInfo(cdSchedule) });
  } catch (error) {
    console.error('Error validating CD:', error);
    res.status(500).json({ error: 'Failed to validate controlled drug prescription.' });
  }
});

// PUT /api/admin/prescriptions/:id/approve - Approve a prescription (+CD aware)
router.put('/prescriptions/:id/approve', async (req, res) => {
  try {
    const { drugId, drugName, amount, adminNotes, cdValidated, supplyDays } = req.body;
    const db = getDb();

    const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
    if (!prescription) {
      db.close();
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    if (prescription.status !== 'pending') {
      db.close();
      return res.status(400).json({ error: `Prescription is already ${prescription.status}. Cannot approve.` });
    }

    // Determine the drug and price
    let finalDrugId = drugId || prescription.drug_id;
    let finalDrugName = drugName || prescription.drug_name;
    let finalAmount = amount;

    if (!finalAmount) {
      if (finalDrugId) {
        const drug = db.prepare('SELECT price FROM drugs WHERE id = ?').get(finalDrugId);
        if (drug) {
          finalAmount = drug.price;
        }
      }
    }

    if (!finalAmount) {
      db.close();
      return res.status(400).json({ error: 'Please provide an amount or link a drug for this prescription.' });
    }

    // Check if this is a controlled drug and require CD validation
    let isCd = prescription.is_controlled_drug;
    let cdSchedule = prescription.cd_schedule;

    // Check the linked drug for CD status
    if (finalDrugId) {
      const drug = db.prepare('SELECT controlled_drug_schedule, max_supply_days FROM drugs WHERE id = ?').get(finalDrugId);
      if (drug && drug.controlled_drug_schedule) {
        isCd = 1;
        cdSchedule = drug.controlled_drug_schedule;

        // For CD-SCH2 and CD-SCH3, require explicit validation
        if ((cdSchedule === 'CD-SCH2' || cdSchedule === 'CD-SCH3') && !cdValidated) {
          db.close();
          return res.status(400).json({
            error: `This drug is ${cdSchedule} (Controlled Drug). Please validate the prescription before approval.`,
            requiresCdValidation: true,
            cdSchedule,
          });
        }
      }
    }

    // Run validation for CDs
    let cdValidationResult = null;
    if (isCd && cdSchedule) {
      cdValidationResult = validateControlledDrugPrescription({
        cdSchedule,
        prescriptionDate: prescription.prescription_date,
        vetRegNumber: prescription.vet_reg_number_on_rx,
        supplyDays: supplyDays || 28,
      });

      if (!cdValidationResult.valid && cdValidated !== true) {
        db.close();
        return res.status(400).json({
          error: 'Controlled drug validation failed: ' + cdValidationResult.errors.join(' '),
          cdValidation: cdValidationResult,
        });
      }
    }

    // Update the prescription
    const updateFields = `status = 'approved', drug_id = ?, drug_name = ?, admin_notes = ?, dosage_instructions = COALESCE(NULLIF(dosage_instructions, ''), ?), updated_at = CURRENT_TIMESTAMP`;
    db.prepare(`UPDATE prescriptions SET ${updateFields} WHERE id = ?`).run(
      finalDrugId, finalDrugName, adminNotes || null, prescription.dosage_instructions || '', req.params.id
    );

    // If CD, mark as validated
    if (isCd) {
      db.prepare('UPDATE prescriptions SET cd_validated = 1, cd_validated_by = ?, cd_validated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(req.user.id, req.params.id);
    }

    // Create order record
    const orderId = uuidv4();
    db.prepare(`
      INSERT INTO orders (id, prescription_id, customer_email, drug_id, drug_name, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `).run(orderId, req.params.id, prescription.customer_email, finalDrugId, finalDrugName, parseInt(finalAmount));

    // Generate payment link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successUrl = `${frontendUrl}/payment/success?prescription_id=${req.params.id}`;
    const cancelUrl = `${frontendUrl}/payment/cancel?prescription_id=${req.params.id}`;

    let paymentUrl = '';
    try {
      const session = await createCheckoutSession({
        prescriptionId: req.params.id,
        customerEmail: prescription.customer_email,
        customerName: prescription.customer_name,
        drugName: finalDrugName || 'Veterinary Prescription',
        amount: parseInt(finalAmount),
        successUrl,
        cancelUrl,
      });

      paymentUrl = session.url;

      db.prepare('UPDATE orders SET stripe_session_id = ?, status = ? WHERE id = ?').run(
        session.id, 'requires_payment', orderId
      );

      db.prepare('UPDATE prescriptions SET payment_link = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        paymentUrl, 'payment_sent', req.params.id
      );
    } catch (stripeError) {
      // Payment gateway unavailable (missing keys, outage). Keep the approval and
      // the order so staff can retry rather than losing the review work, and send
      // the customer to the existing payment page — which re-reads the prescription
      // and can mint a session later. Pointing this at a route that does not exist
      // would have emailed the customer a dead link.
      console.error('Stripe session creation failed:', stripeError.message);
      paymentUrl = `${frontendUrl}/payment/${req.params.id}`;
      db.prepare('UPDATE prescriptions SET payment_link = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        paymentUrl, req.params.id
      );
    }

    // Send email to customer with payment link
    try {
      await sendPaymentLinkEmail({
        to: prescription.customer_email,
        customerName: prescription.customer_name,
        drugName: finalDrugName || 'Veterinary Prescription',
        amount: (parseInt(finalAmount) / 100).toFixed(2),
        paymentLink: paymentUrl,
        prescriptionId: req.params.id,
      });
      db.prepare('UPDATE prescriptions SET payment_link_sent_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    } catch (emailError) {
      console.error('Failed to send payment email:', emailError.message);
    }

    // Log activity
    const cdNote = isCd ? ` [${cdSchedule} - validated]` : '';
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'prescription_approved',
      `Approved prescription ${req.params.id.substring(0, 8)} for ${prescription.customer_name}${cdNote}`
    );

    db.close();

    res.json({
      message: 'Prescription approved. Payment link sent to customer.',
      prescription: { id: req.params.id, status: 'approved', paymentLink: paymentUrl, isControlledDrug: isCd === 1 },
      cdValidation: cdValidationResult,
    });
  } catch (error) {
    console.error('Error approving prescription:', error);
    res.status(500).json({ error: 'Failed to approve prescription.' });
  }
});

// PUT /api/admin/prescriptions/:id/reject - Reject a prescription
router.put('/prescriptions/:id/reject', async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const db = getDb();

    const prescription = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
    if (!prescription) {
      db.close();
      return res.status(404).json({ error: 'Prescription not found.' });
    }

    db.prepare('UPDATE prescriptions SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('rejected', adminNotes || null, req.params.id);

    try {
      await sendStatusUpdateEmail({
        to: prescription.customer_email,
        customerName: prescription.customer_name,
        prescriptionId: req.params.id,
        status: 'rejected',
        adminNotes: adminNotes || '',
      });
    } catch (emailError) {
      console.error('Failed to send rejection email:', emailError.message);
    }

    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'prescription_rejected',
      `Rejected prescription ${req.params.id.substring(0, 8)} for ${prescription.customer_name}`
    );

    db.close();
    res.json({ message: 'Prescription rejected.', prescription: { id: req.params.id, status: 'rejected' } });
  } catch (error) {
    console.error('Error rejecting prescription:', error);
    res.status(500).json({ error: 'Failed to reject prescription.' });
  }
});

/**
 * Allowed prescription status transitions.
 *
 * The workflow is pending -> approved -> payment_sent -> paid -> fulfilled, with
 * rejected as a terminal exit. `fulfill` previously ran a bare UPDATE with no
 * status check, so any pending prescription could be jumped straight to
 * fulfilled — skipping clinical review and payment entirely — and an unknown ID
 * still answered 200 because a zero-row UPDATE is not an error.
 */
const ALLOWED_TRANSITIONS = {
  'mark-paid': ['approved', 'payment_sent'],
  fulfill: ['paid'],
};

/**
 * Load a prescription and confirm it may legally move to `target`.
 * Returns the prescription on success, or writes the error response and returns null.
 */
function loadForTransition(db, res, id, target) {
  const prescription = db.prepare('SELECT id, status FROM prescriptions WHERE id = ?').get(id);

  if (!prescription) {
    res.status(404).json({ error: 'Prescription not found.' });
    return null;
  }

  const allowedFrom = ALLOWED_TRANSITIONS[target];
  if (!allowedFrom.includes(prescription.status)) {
    res.status(409).json({
      error: `Cannot ${target} a prescription with status "${prescription.status}".`,
      allowedFrom,
    });
    return null;
  }

  return prescription;
}

// PUT /api/admin/prescriptions/:id/mark-paid
router.put('/prescriptions/:id/mark-paid', (req, res) => {
  let db;
  try {
    db = getDb();
    if (!loadForTransition(db, res, req.params.id, 'mark-paid')) return;

    db.prepare("UPDATE prescriptions SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE orders SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE prescription_id = ?").run(req.params.id);

    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'payment_marked', `Marked payment complete for prescription ${req.params.id.substring(0, 8)}`
    );
    res.json({ message: 'Payment marked as completed.' });
  } catch (error) {
    console.error('Error marking payment:', error);
    res.status(500).json({ error: 'Failed to mark payment.' });
  } finally {
    if (db) db.close();
  }
});

// PUT /api/admin/prescriptions/:id/fulfill
router.put('/prescriptions/:id/fulfill', (req, res) => {
  let db;
  try {
    db = getDb();
    if (!loadForTransition(db, res, req.params.id, 'fulfill')) return;

    db.prepare("UPDATE prescriptions SET status = 'fulfilled', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'prescription_fulfilled', `Fulfilled prescription ${req.params.id.substring(0, 8)}`
    );
    res.json({ message: 'Prescription marked as fulfilled.' });
  } catch (error) {
    console.error('Error fulfilling prescription:', error);
    res.status(500).json({ error: 'Failed to fulfill prescription.' });
  } finally {
    if (db) db.close();
  }
});

// ====== GDPR ADMIN ======

// GET /api/admin/gdpr-requests - List GDPR data requests
router.get('/gdpr-requests', (req, res) => {
  try {
    const db = getDb();
    const requests = db.prepare('SELECT * FROM data_requests ORDER BY created_at DESC').all();
    db.close();
    res.json({ requests });
  } catch (error) {
    console.error('Error fetching GDPR requests:', error);
    res.status(500).json({ error: 'Failed to fetch GDPR requests.' });
  }
});

// POST /api/admin/gdpr-requests/:id/process - Process a GDPR request
router.post('/gdpr-requests/:id/process', (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const db = getDb();

    const dataRequest = db.prepare('SELECT * FROM data_requests WHERE id = ?').get(req.params.id);
    if (!dataRequest) { db.close(); return res.status(404).json({ error: 'Data request not found.' }); }

    if (action === 'approve' && dataRequest.request_type === 'deletion') {
      // Anonymise user data
      db.prepare("UPDATE users SET name = '[REDACTED]', email = CONCAT('deleted-', substr(id, 1, 8), '@redacted.rxgate.example'), phone = NULL, practice_name = NULL, veterinary_number = NULL, gdpr_consent = 0, account_closed = 1, account_closed_at = CURRENT_TIMESTAMP WHERE id = ?").run(dataRequest.user_id);

      // Anonymise prescriptions
      db.prepare("UPDATE prescriptions SET customer_name = '[REDACTED]', customer_email = CONCAT('deleted-', substr(id, 1, 8), '@redacted.rxgate.example'), customer_phone = NULL, ocr_text = NULL, image_path = '[DELETED PER GDPR REQUEST]', dosage_instructions = NULL WHERE customer_id = ?").run(dataRequest.user_id);

      db.prepare("UPDATE data_requests SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    } else if (action === 'reject') {
      db.prepare("UPDATE data_requests SET status = 'rejected', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
    }

    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'gdpr_request_processed',
      `${action}d GDPR ${dataRequest.request_type} request for ${dataRequest.email}`
    );

    db.close();
    res.json({ message: `Data request ${action}d successfully.` });
  } catch (error) {
    console.error('Error processing GDPR request:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

// ====== DRUG MANAGEMENT (updated with CD support) ======

// GET /api/admin/drugs
router.get('/drugs', (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const drugs = db.prepare('SELECT * FROM drugs ORDER BY controlled_drug_schedule NULLS LAST, created_at DESC LIMIT ? OFFSET ?').all(parseInt(limit), offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM drugs').get().count;

    // Add CD info
    for (const drug of drugs) {
      if (drug.controlled_drug_schedule) {
        drug.cd_info = getCdScheduleInfo(drug.controlled_drug_schedule);
      }
    }

    db.close();
    res.json({ drugs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching drugs:', error);
    res.status(500).json({ error: 'Failed to fetch drugs.' });
  }
});

// POST /api/admin/drugs - Add single drug (with CD support)
router.post('/drugs', (req, res) => {
  try {
    const { name, activeIngredient, strength, species, description, price, stock, requiresPrescription, controlledDrugSchedule, maxSupplyDays } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Drug name and price are required.' });
    }

    const db = getDb();
    const id = uuidv4();
    const validCdSchedules = ['CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', null];
    const cdSchedule = validCdSchedules.includes(controlledDrugSchedule) ? controlledDrugSchedule : null;

    db.prepare(`
      INSERT INTO drugs (id, name, active_ingredient, strength, species, description, price, stock, requires_prescription, controlled_drug_schedule, max_supply_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, activeIngredient || null, strength || null, species || null, description || null,
      parseInt(price), parseInt(stock || '0'),
      requiresPrescription !== undefined ? (requiresPrescription ? 1 : 0) : 1,
      cdSchedule, maxSupplyDays ? parseInt(maxSupplyDays) : 30);

    const cdLabel = cdSchedule ? ` [${cdSchedule}]` : '';
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'drug_added', `Added drug: ${name}${cdLabel}`
    );

    db.close();
    res.status(201).json({ message: 'Drug added successfully.', drug: { id, name, controlledDrugSchedule: cdSchedule } });
  } catch (error) {
    console.error('Error adding drug:', error);
    res.status(500).json({ error: 'Failed to add drug.' });
  }
});

// PUT /api/admin/drugs/:id - Update drug (with CD support)
router.put('/drugs/:id', (req, res) => {
  try {
    const { name, activeIngredient, strength, species, description, price, stock, requiresPrescription, isActive, controlledDrugSchedule, maxSupplyDays } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT id FROM drugs WHERE id = ?').get(req.params.id);
    if (!existing) { db.close(); return res.status(404).json({ error: 'Drug not found.' }); }

    const validCdSchedules = ['CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', null];
    const cdSchedule = controlledDrugSchedule !== undefined ? (validCdSchedules.includes(controlledDrugSchedule) ? controlledDrugSchedule : null) : null;

    db.prepare(`
      UPDATE drugs SET
        name = COALESCE(?, name), active_ingredient = COALESCE(?, active_ingredient),
        strength = COALESCE(?, strength), species = COALESCE(?, species),
        description = COALESCE(?, description), price = COALESCE(?, price),
        stock = COALESCE(?, stock), requires_prescription = COALESCE(?, requires_prescription),
        is_active = COALESCE(?, is_active),
        controlled_drug_schedule = COALESCE(?, controlled_drug_schedule),
        max_supply_days = COALESCE(?, max_supply_days),
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(
      name || null, activeIngredient || null, strength || null, species || null,
      description || null, price ? parseInt(price) : null, stock ? parseInt(stock) : null,
      requiresPrescription !== undefined ? (requiresPrescription ? 1 : 0) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      cdSchedule, maxSupplyDays ? parseInt(maxSupplyDays) : null,
      req.params.id
    );

    db.close();
    res.json({ message: 'Drug updated successfully.' });
  } catch (error) {
    console.error('Error updating drug:', error);
    res.status(500).json({ error: 'Failed to update drug.' });
  }
});

// DELETE /api/admin/drugs/:id
router.delete('/drugs/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE drugs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    db.close();
    res.json({ message: 'Drug deactivated successfully.' });
  } catch (error) {
    console.error('Error deactivating drug:', error);
    res.status(500).json({ error: 'Failed to deactivate drug.' });
  }
});

// POST /api/admin/drugs/bulk-upload - CSV upload with CD support
router.post('/drugs/bulk-upload', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) { return res.status(400).json({ error: 'CSV file is required.' }); }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const db = getDb();

    let records;
    try {
      records = parse(fileContent, { columns: true, skip_empty_lines: true, trim: true });
    } catch (parseError) {
      db.close(); fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid CSV format.' });
    }

    if (records.length === 0) {
      db.close(); fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'CSV file is empty.' });
    }

    const validCdSchedules = ['CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', ''];

    const insert = db.prepare(`
      INSERT INTO drugs (id, name, active_ingredient, strength, species, description, price, stock, requires_prescription, controlled_drug_schedule, max_supply_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const insertMany = db.transaction((records) => {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;

        if (!row.name || !row.price) {
          errors.push(`Row ${rowNum}: Missing required fields`);
          errorCount++; continue;
        }

        const price = parseInt(String(row.price).replace(/[^0-9]/g, ''));
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowNum}: Invalid price`);
          errorCount++; continue;
        }

        let cdSchedule = null;
        if (row.controlled_drug_schedule && validCdSchedules.includes(row.controlled_drug_schedule.toUpperCase())) {
          cdSchedule = row.controlled_drug_schedule.toUpperCase();
        }

        insert.run(
          uuidv4(), row.name.trim(),
          (row.active_ingredient || '').trim() || null,
          (row.strength || '').trim() || null,
          (row.species || '').trim() || null,
          (row.description || '').trim() || null,
          price, parseInt(row.stock || '0'),
          row.requires_prescription?.toLowerCase() === 'no' ? 0 : 1,
          cdSchedule,
          row.max_supply_days ? parseInt(row.max_supply_days) : 30
        );
        successCount++;
      }
    });

    insertMany(records);
    fs.unlinkSync(filePath);

    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'drugs_bulk_upload',
      `Uploaded ${successCount} drugs via CSV (${errorCount} errors)`
    );

    db.close();
    res.json({ message: `Successfully uploaded ${successCount} drugs.`, successCount, errorCount, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: 'Failed to process CSV upload.' });
  }
});

// ====== ADMIN DASHBOARD STATS ======

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();

    const stats = {
      totalPrescriptions: db.prepare('SELECT COUNT(*) as count FROM prescriptions').get().count,
      pendingPrescriptions: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE status = 'pending'").get().count,
      approvedToday: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE status IN ('approved','payment_sent') AND date(updated_at) = date('now')").get().count,
      totalRevenue: db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'completed'").get().total,
      totalDrugs: db.prepare('SELECT COUNT(*) as count FROM drugs WHERE is_active = 1').get().count,
      totalVets: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'vet'").get().count,
      totalCustomers: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count,
      // CD-specific stats
      controlledDrugPrescriptions: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE is_controlled_drug = 1 AND status = 'pending'").get().count,
      pendingCdValidations: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE is_controlled_drug = 1 AND cd_validated = 0 AND status = 'pending'").get().count,
      totalCdDrugs: db.prepare("SELECT COUNT(*) as count FROM drugs WHERE controlled_drug_schedule IS NOT NULL AND is_active = 1").get().count,
      gdprRequests: db.prepare("SELECT COUNT(*) as count FROM data_requests WHERE status = 'pending'").get().count,
    };

    const recentActivity = db.prepare(
      'SELECT a.*, u.name as user_name FROM activity_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 20'
    ).all();

    db.close();
    res.json({ stats, recentActivity });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, email, name, role, practice_name, veterinary_number, phone, gdpr_consent, account_closed, created_at FROM users ORDER BY created_at DESC').all();
    db.close();
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

module.exports = router;
