const express = require('express');
const { getDb } = require('../db/schema');

const router = express.Router();

// GET /api/drugs - Public search/list drugs
router.get('/', (req, res) => {
  try {
    const { search, species, prescription } = req.query;
    const db = getDb();

    // controlled_drug_schedule must be included here: the shop, cart slideout and
    // order views render the Schedule badge from it, and cart items submit it to
    // build the controlled-drug flag.
    let query = 'SELECT id, name, active_ingredient, strength, species, description, price, stock, requires_prescription, controlled_drug_schedule, max_supply_days FROM drugs WHERE is_active = 1';
    const params = [];

    if (search) {
      query += ' AND (name LIKE ? OR active_ingredient LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (species) {
      query += ' AND (species LIKE ? OR species = ?)';
      params.push(`%${species}%`, 'Dog & Cat');
    }

    if (prescription === 'required') {
      query += ' AND requires_prescription = 1';
    } else if (prescription === 'not_required') {
      query += ' AND requires_prescription = 0';
    }

    query += ' ORDER BY name ASC';

    const drugs = db.prepare(query).all(...params);
    db.close();

    res.json({ drugs });
  } catch (error) {
    console.error('Error fetching drugs:', error);
    res.status(500).json({ error: 'Failed to fetch drugs.' });
  }
});

// POST /api/drugs/match-from-text - Match OCR-extracted text against drug DB
router.post('/match-from-text', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for matching.' });
    }

    const db = getDb();
    const allDrugs = db.prepare('SELECT id, name, active_ingredient, strength, species, price, requires_prescription, controlled_drug_schedule FROM drugs WHERE is_active = 1').all();
    db.close();

    const textLower = text.toLowerCase().trim();
    const words = textLower.split(/\s+/);
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(words[i] + ' ' + words[i + 1]);
    }

    const matches = [];
    const seen = new Set();

    for (const drug of allDrugs) {
      const drugName = drug.name.toLowerCase();
      const ingredient = (drug.active_ingredient || '').toLowerCase();

      // Score: 0-100 based on matching strength
      let score = 0;
      let matchType = '';

      // Exact drug name match (highest confidence)
      if (textLower.includes(drugName)) {
        score = 100;
        matchType = 'exact_name';
      }
      // Partial drug name match (e.g. "Apoquel" appearing)
      else if (drugName.split(' ').some(word => word.length > 3 && textLower.includes(word))) {
        score = 85;
        matchType = 'partial_name';
      }
      // Ingredient match
      else if (ingredient && textLower.includes(ingredient)) {
        score = 80;
        matchType = 'ingredient';
      }
      // Bigram overlap
      else {
        const drugBigrams = [];
        const drugWords = drugName.split(/\s+/);
        for (let i = 0; i < drugWords.length - 1; i++) {
          drugBigrams.push((drugWords[i] + ' ' + drugWords[i + 1]).toLowerCase());
        }
        const overlap = drugBigrams.filter(b => bigrams.includes(b)).length;
        const total = Math.max(drugBigrams.length, 1);
        if (overlap > 0) {
          score = Math.round((overlap / total) * 70);
          matchType = 'fuzzy';
        }
      }

      if (score >= 70 && !seen.has(drug.id)) {
        seen.add(drug.id);
        matches.push({
          drug,
          confidence: score,
          matchType,
          matchReason: matchType === 'exact_name' ? `Drug name "${drug.name}" found in prescription`
            : matchType === 'partial_name' ? `Partial match for "${drug.name}"`
            : matchType === 'ingredient' ? `Active ingredient "${drug.active_ingredient}" found`
            : `Similar text match`,
        });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);

    res.json({ matches, totalFound: matches.length });
  } catch (error) {
    console.error('Error matching OCR text:', error);
    res.status(500).json({ error: 'Failed to match OCR text against drug database.' });
  }
});

// GET /api/drugs/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const drug = db.prepare('SELECT * FROM drugs WHERE id = ? AND is_active = 1').get(req.params.id);
    db.close();

    if (!drug) {
      return res.status(404).json({ error: 'Drug not found.' });
    }

    res.json({ drug });
  } catch (error) {
    console.error('Error fetching drug:', error);
    res.status(500).json({ error: 'Failed to fetch drug.' });
  }
});

module.exports = router;
