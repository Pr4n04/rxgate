# RxGate — Setup & Demo Walkthrough

A step-by-step guide to getting RxGate running locally and exercising every
feature. See `README.md` for architecture and the API reference.

## Prerequisites

- **Node.js 18+** — https://nodejs.org (LTS)
- **Git** — https://git-scm.com

No database server, Docker container or third-party account is required. SQLite is
created and seeded automatically, and payments run in a simulated mode when Stripe
keys are absent.

## Setup

```bash
git clone https://github.com/Pr4n04/rxgate.git
cd rxgate

# Installs both packages, initialises + seeds SQLite, and writes backend/.env
# with a freshly generated JWT_SECRET.
bash backend/scripts/setup.sh
```

<details>
<summary>Manual setup, if you would rather not run the script</summary>

```bash
cd backend
npm install
node db/schema.js
node db/seed.js

cp .env.example .env
# Generate a secret and paste it into JWT_SECRET in backend/.env:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

cd ../frontend
npm install
```
</details>

`JWT_SECRET` is mandatory. If it is missing or under 32 characters the server
exits immediately with an error rather than falling back to a default — a secret
committed in source would let anyone who clones the repo forge an admin token.

## Running

Two terminals:

```bash
cd backend  && npm run dev    # API on http://localhost:3001
cd frontend && npm run dev    # App on http://localhost:5173
```

Open **http://localhost:5173**.

## Test accounts

Created by `backend/db/seed.js`. `rxgate.example` is an RFC 2606 reserved domain,
so these can never reach a real inbox.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@rxgate.example` | `admin123` |
| Vet | `vet@rxgate.example` | `vet123` |
| Customer | `customer@rxgate.example` | `customer123` |

The login and register pages display these credentials **only in development
builds** — `import.meta.env.DEV` is inlined as `false` in production, so the
branch is tree-shaken out of the deployed bundle.

## Walkthrough

### 1. Shop and cart
- **Shop** in the nav → search or filter by species
- Add several drugs, change quantities, remove items
- Controlled drugs (Diazepam Desitin, Ketamidor, Buprecare, Phenoleptil) show a
  `CD-SCH2`/`CD-SCH3`/`CD-SCH4` badge

### 2. Upload a prescription (customer)
- Sign in as **customer**, open the **Upload Rx** tab
- Cart contents are carried across automatically
- Upload `docs/ocr-test-fixture/test-prescription.png` — a synthetic prescription
  whose drug names and dosage are extracted by OCR and matched against the
  formulary
- The prescription is created as `pending`

### 3. Pharmacy review (admin)
- Sign in as **admin** → **All** → find the pending prescription
- The approval modal shows the OCR text and any items OCR could not match
- Selecting a **Schedule 2** drug enables the controlled-drug validation:
  prescription age, maximum supply duration, and vet registration number
- **Approve** issues the order and produces a payment link

### 4. Pay
- With no `STRIPE_SECRET_KEY` set, the link opens a clearly-labelled **simulated
  checkout** at `/payment/mock`. No money moves and no Stripe account is needed.
- To use real Stripe, add test keys to `backend/.env`. The mock endpoints then
  return `404` and genuine Checkout is used instead.
- Forward webhooks with `stripe listen --forward-to localhost:3001/api/orders/webhook`

### 5. Fulfil
- Back in the admin dashboard, **Mark paid** then **Fulfil**
- The workflow is enforced: `pending → approved → payment_sent → paid → fulfilled`.
  Attempting an out-of-order transition returns `409` rather than silently
  corrupting the record.

### 6. Vet dashboard
- Sign in as **vet** → upload a prescription on a customer's behalf, and review
  the practice's submitted history

### 7. GDPR
- As **customer**: **My Orders**, consent status, and *Download my data*
- The export returns your profile, prescriptions, orders and consent history. Your
  own email is included; anything belonging to another data subject is redacted.

## Running the smoke test

With the backend running:

```bash
cd backend
node scripts/smoke-test.js
```

30 assertions covering authentication, PII access control, the workflow state
machine, role-based access, controlled-drug rules, GDPR export and session
revocation. It creates and removes its own fixtures and only touches the seeded
development accounts.

## Troubleshooting

| Issue | Fix |
|---|---|
| `Refusing to start: JWT_SECRET is missing` | Run `bash backend/scripts/setup.sh`, or generate a secret as shown above |
| Port 3001 already in use | Change `PORT` in `backend/.env` |
| Port 5173 already in use | Vite will offer another port; update `FRONTEND_URL` in `backend/.env` to match |
| Database errors | `node backend/db/schema.js && node backend/db/seed.js` |
| Blank page in the browser | Confirm both terminals are running |
| No prescriptions in the admin list | Upload one first — a fresh database seeds drugs and users, not prescriptions |
| OCR finds no drugs | The first run downloads Tesseract language data; check network access, or set `TESSERACT_LANG_PATH` to a local copy |

## Notes for reviewers

- **No real patient data.** Every seeded address uses the reserved
  `rxgate.example` domain and the OCR fixture is entirely synthetic.
- **Nothing sensitive is committed.** `.env`, `*.db` and `backend/uploads/` are
  all git-ignored; the database is regenerated on first run.
- **Production credentials are stripped** from the frontend bundle — verify with
  `grep -r admin123 frontend/dist` after a build.