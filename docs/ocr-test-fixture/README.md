# OCR test fixture

Synthetic prescription used to exercise the OCR pipeline
(`backend/controllers/ocr.js`) without needing real patient documents.

## Files

| File | Purpose |
| --- | --- |
| `test-prescription.html` | Source layout, rendered to the PNG below |
| `test-prescription.png` | 900x1400 render fed to Tesseract |
| `cart-test.png` | Multi-item cart screenshot used while testing the shop flow |

## All data here is invented

Every name, address, phone number, postcode, veterinary registration number and
prescription reference is fabricated for testing. Nothing in this directory
corresponds to a real person, animal, practice or prescription.

These files are deliberately **not** in `frontend/public/`. That directory is
served statically by the production server, so anything placed there becomes
publicly fetchable at a predictable URL. Test fixtures have no reason to be
reachable by end users.

## Trying it

1. Start the backend: `cd backend && npm run dev`
2. Log in as the seeded customer (`customer@rxgate.example` / `customer123`).
3. Upload `test-prescription.png` on the customer dashboard.

Expected OCR behaviour, verified by `backend/scripts/smoke-test.js` and the
manual check below:

```text
Apoquel (oclacitinib)                          -> matched against the catalogue
NexGard Spectra (afoxolaner + milbemycin oxime) -> matched against the catalogue
"1 tablet twice daily for 14 days"              -> parsed as dosage instructions
```

Reproduce the extraction directly:

```bash
cd backend
node -e "
const { processPrescriptionOCR, parsePrescriptionInfo } = require('./controllers/ocr');
const p = require('path').resolve('../docs/ocr-test-fixture/test-prescription.png');
processPrescriptionOCR(p).then(t => console.log(parsePrescriptionInfo(t)));
"
```

Tesseract is imperfect on photographed documents, so a few characters come back
wrong (`20 BID` for `PO BID`, `Pot. Name` for `Pet Name`). The parser is
tolerant of this because it matches on substrings rather than exact tokens.

## Regenerating the PNG

```bash
cd docs/ocr-test-fixture
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu \
  --screenshot=test-prescription.png \
  --window-size=900,1400 --hide-scrollbars \
  "file://$PWD/test-prescription.html"
```

Linux CI equivalent:

```bash
chromium --headless --disable-gpu \
  --screenshot=test-prescription.png --window-size=900,1400 \
  "file://$PWD/test-prescription.html"
```