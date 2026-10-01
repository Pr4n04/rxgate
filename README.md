# 🐾 RxGate — Veterinary Prescription Platform

A full-stack prescription management and e-commerce platform for Northern Ireland veterinary pharmacies. Enables vets to upload prescriptions digitally, admins to review/approve them, and customers to pay online.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Backend** | Node.js + Express |
| **Database** | SQLite (via better-sqlite3) |
| **OCR** | Tesseract.js |
| **Payments** | Stripe Checkout |
| **Email** | Nodemailer (SMTP) |

## Features

### 🔬 For the Public (Customers)
- **Search** veterinary medications by name, active ingredient, species
- **Browse** full formulary with prices and Rx status
- **Pay** for approved prescriptions via Stripe
- **Track** prescription status (Pending → Approved → Paid → Fulfilled)
- **View order history**

### 🩺 For Veterinary Practices
- **Upload** customer prescriptions (image/PDF) with OCR processing
- **Link** prescriptions to formulary drugs
- **Track** all submitted prescriptions with status badges
- **Automatic** email notifications to customers when approved

### ⚕️ For Pharmacy Admins
- **Review** all incoming prescriptions with OCR text
- **Approve** prescriptions with drug linking and pricing
- **Send** automated payment links via email on approval
- **Reject** prescriptions with admin notes
- **Manage** drug formulary (add/edit/bulk CSV upload)
- **Dashboard** with real-time stats and activity log

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/Pr4n04/rxgate.git
cd rxgate

# Install backend dependencies
cd backend && npm install

# Initialise database and seed data
# (both steps also run automatically when the server starts)
node db/schema.js
node db/seed.js

# Create your environment file — the server will not boot without JWT_SECRET
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # paste into JWT_SECRET

# Install frontend dependencies
cd ../frontend && npm install
```

### Running the Application

**Terminal 1 — Backend API:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

### Development Accounts

Created by `backend/db/seed.js`. `rxgate.example` is an RFC 2606 reserved domain,
so these addresses can never collide with a real inbox.

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@rxgate.example | admin123 |
| Vet | vet@rxgate.example | vet123 |
| Customer | customer@rxgate.example | customer123 |

These are for local development only. The login and register pages hint at them
behind `import.meta.env.DEV`, so the credentials are **stripped from production
builds** — Vite inlines the condition as `false` and tree-shakes the branch away.

## Configuration

Copy `backend/.env.example` to `backend/.env`. `JWT_SECRET` is **required** — the
server exits with a non-zero status rather than falling back to a default, because
a secret committed in source would let anyone who clones the repo forge an admin
token.

Stripe and email are optional. With no `STRIPE_SECRET_KEY` the app serves a
simulated checkout page at `/payment/mock`, so the entire approve → pay → fulfil
flow can be demonstrated with no third-party accounts. The moment a real
`STRIPE_SECRET_KEY` is set, the mock payment endpoints return `404` and genuine
Stripe Checkout is used.

## Testing

A smoke test covers the security-critical paths and is safe to run against a local
database — it creates and removes its own fixtures and touches only the seeded
development accounts.

```bash
# with the backend running on :3001
cd backend
node scripts/smoke-test.js
```

It asserts, among other things:

- anonymous callers cannot read a prescription, and the holder of an emailed
  payment link receives a **redacted** view with no patient name, email or dosage
- anonymous callers cannot mint a Stripe checkout session
- a token is genuinely rejected after logout (session revocation is enforced)
- a pending prescription cannot jump straight to `fulfilled` or `paid`
- a valid Schedule 2 prescription is not rejected merely because the supply
  duration was left blank
- GDPR export returns the subject's own email rather than `[REDACTED]`
- customers and vets are refused on admin routes

## Security

| Control | Implementation |
|---|---|
| Passwords | bcrypt, cost factor 12 |
| Sessions | JWT (7-day expiry) + server-side revocation table checked on every request |
| JWT secret | Required, minimum 32 characters, validated at boot; no source default |
| Authorisation | Role gates per router (`admin`, `vet`, `customer`) plus per-record ownership checks |
| Prescription PII | Full record only for staff or the owning customer; anonymous payment-link holders get a redacted projection |
| Rate limiting | 10 requests / 15 min per IP+email on auth, 30/min on writes, 500/15 min overall |
| Uploads | MIME allowlist, extension derived from the allowlist rather than the client filename, 10 MB cap, served with `nosniff` |
| Security headers | Helmet with a tailored CSP |
| Data minimisation | `rxgate.example` seeded addresses (RFC 2606), retention expiry set at write time |

Prescription images contain special-category health data, so `backend/uploads/`,
`*.db`, and `.env` are all git-ignored and must never be committed.

## Usage Flow

```
1. Vet registers → logs in → uploads prescription image with customer details
2. OCR extracts text from the prescription automatically
3. Admin sees pending prescriptions → reviews OCR text → approves with drug & price
4. System sends customer an email with a Stripe payment link
5. Customer clicks link → pays via card → receives confirmation
6. Admin marks as fulfilled → order complete
```

## API Endpoints

### Public
- `GET /api/drugs` — Search medications (query: `search`, `species`, `prescription`)
- `GET /api/drugs/:id` — Drug details
- `GET /api/prescriptions/:id` — Prescription status. Authenticated staff and the
  owning customer receive the full record; an anonymous caller holding a payment
  link receives a redacted view (no patient name, email or dosage). `pending`
  prescriptions require authentication.

### Auth (rate limited: 10 per 15 min per IP + email)
- `POST /api/auth/register` — Create account (body: `name`, `email`, `password`, `role`)
- `POST /api/auth/login` — Sign in
- `GET /api/auth/me` — Current user (auth required)
- `POST /api/auth/logout` — Revoke current session

### Vet (auth + vet role)
- `POST /api/vet/prescriptions` — Upload prescription (multipart)
- `GET /api/vet/prescriptions` — List vet's prescriptions
- `GET /api/vet/stats` — Vet dashboard stats

### Admin (auth + admin role)
- `GET /api/admin/prescriptions` — All prescriptions (query: `status`)
- `PUT /api/admin/prescriptions/:id/approve` — Approve + send payment link
- `PUT /api/admin/prescriptions/:id/reject` — Reject with notes
- `PUT /api/admin/prescriptions/:id/mark-paid` — Mark manual payment (`approved`/`payment_sent` only)
- `PUT /api/admin/prescriptions/:id/fulfill` — Mark fulfilled (`paid` only)
- `GET /api/admin/drugs` — All drugs (incl. inactive)
- `POST /api/admin/drugs` — Add drug
- `POST /api/admin/drugs/bulk-upload` — CSV bulk upload
- `PUT /api/admin/drugs/:id` — Update drug
- `DELETE /api/admin/drugs/:id` — Deactivate drug
- `GET /api/admin/stats` — Dashboard statistics
- `GET /api/admin/users` — All users

### Orders
- `POST /api/orders/create` — Return the payment link. Anonymous callers may re-read
  an existing link; minting a new Stripe session requires authentication
- `GET /api/orders/my` — Customer's orders (auth required)
- `GET /api/orders/session/:sessionId` — Session status (auth + ownership required)
- `POST /api/orders/webhook` — Stripe webhook (signature verified, never rate limited)
- `POST /api/orders/mock-complete` — Simulated payment. Returns `404` whenever
  `STRIPE_SECRET_KEY` is set, so it cannot exist in production

### GDPR (auth required)
- `GET /api/gdpr/data` — Data subject access (Art. 15)
- `POST /api/gdpr/consent` — Record consent
- `GET /api/gdpr/consent-status` — Consent state
- `POST /api/gdpr/request-deletion` — Erasure request (Art. 17)

## CSV Bulk Upload Format

```csv
name,active_ingredient,strength,species,description,price,stock,requires_prescription
NexGard Spectra,Afoxolaner + Milbemycin oxime,11.3mg/56.5mg,Dog,Flea and worm treatment,4500,100,yes
Rimadyl,Carprofen,50mg,Dog,Anti-inflammatory,2500,50,yes
```

> Price is in **pence** (e.g., 4500 = £45.00)

## Project Structure

```
rxgate/
├── backend/
│   ├── controllers/       # OCR, Email, Stripe logic
│   ├── db/                # Schema + seed scripts
│   ├── middleware/        # JWT auth + revocation, RBAC, uploads, rate limiting
│   ├── routes/            # API route handlers
│   ├── scripts/           # smoke-test.js
│   ├── uploads/           # Prescription images (git-ignored)
│   └── server.js          # Express entry point
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios client
│   │   ├── components/    # Navbar, Footer, Cart
│   │   ├── context/       # Auth + cart contexts
│   │   └── pages/         # All page components
│   └── vite.config.js
├── docs/
│   └── ocr-test-fixture/  # Synthetic prescription for testing OCR
└── README.md
```

## Colour Scheme

- **Primary:** `#822746` (deep burgundy) — buttons, headers, brand elements
- **Text on primary:** White
- **Accents:** RxGate-50 through RxGate-900 via Tailwind

The logo placeholder is included in the home page header — add your RxGate logo when ready.

## License

Proprietary — RxGate
