const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { processPrescriptionOCR, parsePrescriptionInfo } = require('../controllers/ocr');
const { isControlledDrug } = require('../controllers/validation');

const router = express.Router();

// All customer routes require authentication
router.use(authenticateToken);
router.use(requireRole('customer'));

// POST /api/customer/preview-ocr - Preview OCR on a file without saving
router.post('/preview-ocr', upload.single('prescriptionImage'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Prescription image is required.' });
    }

    let ocrText = '';
    let parsedInfo = { drugNames: [], dosageInstructions: '' };
    try {
      ocrText = await processPrescriptionOCR(req.file.path);
      parsedInfo = parsePrescriptionInfo(ocrText);
    } catch (ocrError) {
      console.error('OCR preview failed:', ocrError.message);
    }

    // Clean up the uploaded file after processing
    try {
      const fs = require('fs');
      fs.unlinkSync(req.file.path);
    } catch {}

    res.json({ ocrText, parsedInfo });
  } catch (error) {
    console.error('Error in OCR preview:', error);
    res.status(500).json({ error: 'Failed to process OCR preview.' });
  }
});

// POST /api/customer/prescriptions - Customer uploads their own prescription
// Supports: single drug (drugId/drugName) OR cart items (cartItems JSON array)
router.post('/prescriptions', upload.single('prescriptionImage'), async (req, res) => {
  try {
    const { drugId, drugName, dosageInstructions, vetNameOnRx, vetRegNumberOnRx, prescriptionDate, cartItems } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Prescription image is required.' });
    }

    const db = getDb();

    // Get user details
    const user = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      db.close();
      return res.status(404).json({ error: 'User not found.' });
    }

    // Perform OCR on the uploaded image
    let ocrText = '';
    let parsedInfo = { drugNames: [], dosageInstructions: '' };
    try {
      ocrText = await processPrescriptionOCR(req.file.path);
      parsedInfo = parsePrescriptionInfo(ocrText);
      console.log('Customer upload OCR extracted:', ocrText.substring(0, 300));
    } catch (ocrError) {
      console.error('OCR failed (non-fatal):', ocrError.message);
      ocrText = '[OCR failed]';
    }

    // Parse cart items if provided (from the cart checkout flow)
    let parsedCartItems = [];
    if (cartItems) {
      try {
        parsedCartItems = typeof cartItems === 'string' ? JSON.parse(cartItems) : cartItems;
      } catch {
        parsedCartItems = [];
      }
    }

    // ---- Match cart items against OCR-detected drugs ----
    // For each cart item, flag it if the OCR text didn't detect it
    if (parsedCartItems.length > 0 && ocrText && ocrText !== '[OCR failed]') {
      try {
        const allDrugs = db.prepare('SELECT id, name, active_ingredient FROM drugs WHERE is_active = 1').all();
        const textLower = ocrText.toLowerCase().trim();
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

        // Flag each cart item
        for (const item of parsedCartItems) {
          const itemName = (item.drugName || '').toLowerCase().trim();
          const inPrescription = detectedDrugIds.has(item.drugId)
            || detectedDrugNames.has(itemName)
            || [...detectedDrugNames].some(detectedName =>
                (itemName && detectedName.includes(itemName))
                || (itemName && itemName.includes(detectedName))
              );
          item.notInPrescription = !inPrescription;
        }
      } catch (matchError) {
        console.error('Drug matching error (non-fatal):', matchError.message);
        // If matching fails, mark all as "not verified" rather than blocking upload
        for (const item of parsedCartItems) {
          item.notInPrescription = null; // unknown
        }
      }
    }

    // Resolve drug info — from cart items or single drug fields
    let resolvedDrugId = drugId || null;
    let resolvedDrugName = drugName || '';
    let isCd = 0;
    let cdSchedule = null;

    if (parsedCartItems.length > 0) {
      // Use the first cart item as the primary drug, check all for CD status
      const firstItem = parsedCartItems[0];
      resolvedDrugId = firstItem.drugId || null;
      resolvedDrugName = firstItem.drugName || '';

      // Check ALL cart items for controlled drugs
      for (const item of parsedCartItems) {
        if (item.drugId) {
          const drug = db.prepare('SELECT controlled_drug_schedule FROM drugs WHERE id = ?').get(item.drugId);
          if (drug && drug.controlled_drug_schedule) {
            isCd = 1;
            cdSchedule = drug.controlled_drug_schedule;
            break;
          }
        }
        if (item.isControlledDrug) {
          isCd = 1;
          cdSchedule = item.cdSchedule || 'CD-SCH4';
          break;
        }
      }
    } else if (drugId) {
      const drug = db.prepare('SELECT id, name, controlled_drug_schedule FROM drugs WHERE id = ? AND is_active = 1').get(drugId);
      if (drug) {
        resolvedDrugName = drug.name;
        if (drug.controlled_drug_schedule) {
          isCd = 1;
          cdSchedule = drug.controlled_drug_schedule;
        }
      }
    }

    // If OCR found drug names but none provided, use the first one
    if (!resolvedDrugName && parsedInfo.drugNames.length > 0) {
      resolvedDrugName = parsedInfo.drugNames[0];
    }

    const finalDosage = dosageInstructions || parsedInfo.dosageInstructions || '';
    const prescriptionId = uuidv4();
    const imageUrl = `/uploads/${req.file.filename}`;

    // For CD items without explicit drugId, mark from parsed info
    if (!isCd && parsedCartItems.some(i => i.isControlledDrug)) {
      isCd = 1;
      cdSchedule = parsedCartItems.find(i => i.isControlledDrug)?.cdSchedule || 'CD-SCH4';
    }

    const cartItemsJson = JSON.stringify(parsedCartItems);

    db.prepare(`
      INSERT INTO prescriptions (
        id, customer_id, customer_name, customer_email, customer_phone,
        upload_source, vet_id,
        vet_name_on_rx, vet_reg_number_on_rx, prescription_date,
        drug_id, drug_name, image_path, ocr_text, dosage_instructions,
        is_controlled_drug, cd_schedule, status,
        retention_expiry, cart_items
      ) VALUES (?, ?, ?, ?, ?, 'customer', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
                datetime('now', '+3 years'), ?)
    `).run(
      prescriptionId, user.id, user.name, user.email, user.phone || null,
      vetNameOnRx || null, vetRegNumberOnRx || null, prescriptionDate || null,
      resolvedDrugId, resolvedDrugName || '', imageUrl, ocrText, finalDosage,
      isCd, cdSchedule,
      cartItemsJson
    );

    // Log activity
    const itemCount = parsedCartItems.length > 0 ? ` (${parsedCartItems.length} items)` : '';
    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'prescription_customer_uploaded',
      `Customer ${user.name} uploaded prescription for ${resolvedDrugName || 'Unknown drug'}${itemCount}`
    );

    db.close();

    res.status(201).json({
      message: 'Prescription uploaded successfully. It is now pending pharmacy review.',
      prescription: {
        id: prescriptionId,
        customerName: user.name,
        drugName: resolvedDrugName,
        status: 'pending',
        isControlledDrug: isCd === 1,
        cdSchedule,
        ocrExtracted: ocrText !== '[OCR failed]',
        dosageInstructions: finalDosage,
        itemCount: parsedCartItems.length,
      }
    });
  } catch (error) {
    console.error('Error uploading customer prescription:', error);
    res.status(500).json({ error: 'Failed to upload prescription.' });
  }
});

// GET /api/customer/prescriptions - Customer views their prescriptions+orders
router.get('/prescriptions', (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*, d.name as drug_display_name, d.price, d.controlled_drug_schedule as drug_cd_schedule,
             o.status as order_status, o.amount as order_amount, o.stripe_session_id, o.id as order_id
      FROM prescriptions p
      LEFT JOIN drugs d ON p.drug_id = d.id
      LEFT JOIN orders o ON o.prescription_id = p.id
      WHERE p.customer_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const prescriptions = db.prepare(query).all(...params);

    // Match cart items against OCR text for each prescription
    const allDrugs = db.prepare('SELECT id, name, active_ingredient FROM drugs WHERE is_active = 1').all();
    for (const p of prescriptions) {
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
          // Ignore parse errors
        }
      }
    }

    const countResult = db.prepare(
      'SELECT COUNT(*) as total FROM prescriptions WHERE customer_id = ?' + (status ? ' AND status = ?' : '')
    ).get(...(status ? [req.user.id, status] : [req.user.id]));

    db.close();

    res.json({
      prescriptions,
      total: countResult.total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching customer prescriptions:', error);
    res.status(500).json({ error: 'Failed to fetch prescriptions.' });
  }
});

// GET /api/customer/stats - Customer dashboard stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM prescriptions WHERE customer_id = ?').get(req.user.id).count,
      pending: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE customer_id = ? AND status = 'pending'").get(req.user.id).count,
      approved: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE customer_id = ? AND status IN ('approved', 'payment_sent')").get(req.user.id).count,
      paid: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE customer_id = ? AND status = 'paid'").get(req.user.id).count,
      fulfilled: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE customer_id = ? AND status = 'fulfilled'").get(req.user.id).count,
    };
    db.close();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// PUT /api/customer/profile - Update profile (GDPR data rectification)
router.put('/profile', (req, res) => {
  try {
    const { name, phone } = req.body;
    const db = getDb();

    if (name) {
      db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(name.trim(), req.user.id);
    }
    if (phone !== undefined) {
      db.prepare('UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(phone || null, req.user.id);
    }

    db.prepare("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.user.id);
    db.close();

    res.json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
