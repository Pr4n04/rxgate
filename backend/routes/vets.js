const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { processPrescriptionOCR, parsePrescriptionInfo } = require('../controllers/ocr');

const router = express.Router();

// All vet routes require authentication and vet role
router.use(authenticateToken);
router.use(requireRole('vet', 'admin'));

// POST /api/vet/prescriptions - Upload a prescription for a customer (supports cart items)
router.post('/prescriptions', upload.single('prescriptionImage'), async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, drugName, drugId, dosageInstructions, cartItems } = req.body;

    if (!customerName || !customerEmail) {
      return res.status(400).json({ error: 'Customer name and email are required.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Prescription image is required.' });
    }

    const db = getDb();

    // Perform OCR on the uploaded image
    let ocrText = '';
    let parsedInfo = { drugNames: [], dosageInstructions: '' };
    try {
      ocrText = await processPrescriptionOCR(req.file.path);
      parsedInfo = parsePrescriptionInfo(ocrText);
      console.log('OCR extracted:', ocrText.substring(0, 200));
    } catch (ocrError) {
      console.error('OCR failed (non-fatal):', ocrError.message);
      ocrText = '[OCR failed]';
    }

    // Parse cart items if provided
    let parsedCartItems = [];
    if (cartItems) {
      try {
        parsedCartItems = typeof cartItems === 'string' ? JSON.parse(cartItems) : cartItems;
      } catch {
        parsedCartItems = [];
      }
    }

    // Verify drug exists if drugId provided
    let resolvedDrugName = drugName || '';
    let resolvedDrugId = drugId || null;

    if (parsedCartItems.length > 0) {
      const firstItem = parsedCartItems[0];
      resolvedDrugId = firstItem.drugId || null;
      resolvedDrugName = firstItem.drugName || '';
    } else if (drugId) {
      const drug = db.prepare('SELECT id, name FROM drugs WHERE id = ? AND is_active = 1').get(drugId);
      if (drug) {
        resolvedDrugName = drug.name;
      }
    }

    // If OCR found drug names but none provided, use the first one
    if (!resolvedDrugName && parsedInfo.drugNames.length > 0) {
      resolvedDrugName = parsedInfo.drugNames[0];
    }

    const finalDosage = dosageInstructions || parsedInfo.dosageInstructions || '';

    const prescriptionId = uuidv4();
    const imageUrl = `/uploads/${req.file.filename}`;
    const cartItemsJson = JSON.stringify(parsedCartItems);

    db.prepare(`
      INSERT INTO prescriptions (id, customer_name, customer_email, customer_phone, vet_id, drug_id, drug_name, image_path, ocr_text, dosage_instructions, status, retention_expiry, cart_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', '+3 years'), ?)
    `).run(
      prescriptionId, customerName, customerEmail.toLowerCase().trim(), customerPhone || null,
      req.user.id, resolvedDrugId, resolvedDrugName || '',
      imageUrl, ocrText, finalDosage,
      cartItemsJson
    );

    db.prepare('INSERT INTO activity_log (id, user_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.user.id, 'prescription_uploaded',
      `Prescription for ${customerName} (${customerEmail}) - ${resolvedDrugName || 'Unknown drug'}${parsedCartItems.length > 0 ? ` with ${parsedCartItems.length} items` : ''}`
    );

    db.close();

    res.status(201).json({
      message: 'Prescription uploaded successfully and is pending review.',
      prescription: {
        id: prescriptionId,
        customerName,
        customerEmail,
        drugName: resolvedDrugName,
        status: 'pending',
        ocrText: ocrText.substring(0, 500),
        dosageInstructions: finalDosage,
        itemCount: parsedCartItems.length,
      }
    });
  } catch (error) {
    console.error('Error uploading prescription:', error);
    res.status(500).json({ error: 'Failed to upload prescription.' });
  }
});

// GET /api/vet/prescriptions - List prescriptions uploaded by this vet
router.get('/prescriptions', (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const db = getDb();
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT p.*, d.name as drug_display_name, d.price FROM prescriptions p LEFT JOIN drugs d ON p.drug_id = d.id WHERE p.vet_id = ?';
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
      'SELECT COUNT(*) as total FROM prescriptions WHERE vet_id = ?' + (status ? ' AND status = ?' : '')
    ).get(...(status ? [req.user.id, status] : [req.user.id]));

    db.close();

    res.json({
      prescriptions,
      total: countResult.total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to fetch prescriptions.' });
  }
});

// GET /api/vet/stats - Vet dashboard stats
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = {
      total: db.prepare('SELECT COUNT(*) as count FROM prescriptions WHERE vet_id = ?').get(req.user.id).count,
      pending: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE vet_id = ? AND status = 'pending'").get(req.user.id).count,
      approved: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE vet_id = ? AND status = 'approved'").get(req.user.id).count,
      paid: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE vet_id = ? AND status = 'paid'").get(req.user.id).count,
      rejected: db.prepare("SELECT COUNT(*) as count FROM prescriptions WHERE vet_id = ? AND status = 'rejected'").get(req.user.id).count,
    };
    db.close();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching vet stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

module.exports = router;
