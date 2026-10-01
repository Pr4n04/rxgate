const Tesseract = require('tesseract.js');
const path = require('path');

/**
 * Perform OCR on a prescription image to extract text.
 * @param {string} imagePath - Absolute path to the uploaded image
 * @returns {Promise<string>} Extracted text
 */
async function processPrescriptionOCR(imagePath) {
  try {
    // Tesseract.js downloads language data on first use. A 5MB eng.traineddata was
    // previously committed here but never referenced; set TESSERACT_LANG_PATH to a
    // local directory to run fully offline instead (useful where the pharmacy has
    // no outbound internet).
    const langPath = process.env.TESSERACT_LANG_PATH;

    const result = await Tesseract.recognize(imagePath, 'eng', {
      ...(langPath ? { langPath } : {}),
      logger: (info) => {
        if (info.status === 'recognizing text') {
          console.log(`OCR progress: ${Math.round(info.progress * 100)}%`);
        }
      }
    });

    return result.data.text;
  } catch (error) {
    console.error('OCR processing error:', error.message);
    throw new Error('Failed to process prescription image. Please try again with a clearer image.');
  }
}

/**
 * Extract potential drug names and key info from OCR text
 * @param {string} ocrText - Raw OCR output
 * @returns {object} Parsed information
 */
function parsePrescriptionInfo(ocrText) {
  if (!ocrText) return { drugNames: [], dosageInstructions: '' };

  const lines = ocrText.split('\n').filter(line => line.trim().length > 0);
  const textLower = ocrText.toLowerCase();

  // Common veterinary prescription keywords
  const drugKeywords = [
    'nexgard', 'revolution', 'rimadyl', 'metacam', 'clavaseptin',
    'apoquel', 'atopica', 'fortiflora', 'zylkene', 'cystophan',
    'antibiotic', 'anti-inflammatory', 'pain relief', 'dewormer',
    'flea', 'tick', 'heartworm', 'vaccine'
  ];

  const drugNames = [];
  for (const keyword of drugKeywords) {
    if (textLower.includes(keyword)) {
      // Get the full line containing the keyword
      const matchingLine = lines.find(line => line.toLowerCase().includes(keyword));
      if (matchingLine) {
        drugNames.push(matchingLine.trim());
      } else {
        drugNames.push(keyword);
      }
    }
  }

  // Extract dosage (e.g., "2 tablets daily", "once a day", "1ml twice daily")
  const dosagePatterns = [
    /(\d+\s*(?:tablet|capsule|ml|mg|drop|pump|sachet|injection)s?\s*(?:daily|twice|once|per day|every|BID|SID|TID|QID))/gi,
    /(once|twice|three times)\s*(?:a|per)\s*day/gi,
    /(\d+\s*-\s*\d+\s*(?:tablet|capsule|ml)s?)/gi
  ];

  let dosageInstructions = '';
  for (const pattern of dosagePatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      dosageInstructions = match.join('; ');
      break;
    }
  }

  return {
    drugNames: [...new Set(drugNames)],
    dosageInstructions: dosageInstructions || '',
    rawText: ocrText
  };
}

module.exports = { processPrescriptionOCR, parsePrescriptionInfo };
