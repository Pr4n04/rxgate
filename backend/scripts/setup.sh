#!/usr/bin/env bash
#
# RxGate one-shot setup.
#
#   bash backend/scripts/setup.sh     # from the repository root
#
# Installs backend and frontend dependencies, initialises and seeds the SQLite
# database, and writes backend/.env with a freshly generated JWT_SECRET.
#
# JWT_SECRET has no default in the source, so the server refuses to boot without
# one — that is deliberate (a committed secret would let anyone who clones the
# repo forge an admin token), which is why this script generates one.

set -euo pipefail

# Resolve our own location once, absolutely. Using a relative "cd $(dirname $0)/.."
# repeatedly breaks depending on where the caller invoked the script from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$BACKEND_DIR/.." && pwd)"

echo "============================================"
echo "  RxGate - Setup Script"
echo "  Veterinary Prescription Platform"
echo "============================================"
echo ""

# ---- Prerequisites ----------------------------------------------------------
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "❌ Node.js 18+ is required (found $(node -v))."
    exit 1
fi
echo "✅ Node.js $(node -v) detected"

# ---- Backend ----------------------------------------------------------------
echo ""
echo "📦 Installing backend dependencies..."
cd "$BACKEND_DIR"
npm install

# ---- Database ---------------------------------------------------------------
# schema.js both exports initDatabase and runs it when executed directly, so
# `node db/schema.js` is all that is needed; the server repeats it on boot.
echo ""
echo "🗄️  Initialising database..."
node db/schema.js > /dev/null
node db/seed.js

# ---- Environment ------------------------------------------------------------
echo ""
echo "🔐 Configuring environment..."
cd "$BACKEND_DIR"
if [ -f .env ]; then
    echo "   backend/.env already exists — leaving it untouched"
else
    JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
    sed "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env.example > .env
    echo "   Created backend/.env with a freshly generated JWT_SECRET"
    echo "   (Stripe and SMTP left blank — see backend/.env.example to enable them)"
fi

# ---- Frontend ---------------------------------------------------------------
echo ""
echo "📦 Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install

# ---- Done -------------------------------------------------------------------
cat <<EOF

============================================
  🎉 Setup Complete!
============================================

  To start the application:

  Terminal 1 (Backend):
    cd backend && npm run dev

  Terminal 2 (Frontend):
    cd frontend && npm run dev

  Then open http://localhost:5173

  Smoke test (with the backend running):
    cd backend && node scripts/smoke-test.js

  Development accounts:
    Admin:    admin@rxgate.example / admin123
    Vet:      vet@rxgate.example / vet123
    Customer: customer@rxgate.example / customer123

  Dashboard URLs:
    Admin:   http://localhost:5173/admin/dashboard
    Vet:     http://localhost:5173/vet/dashboard
    Customer: http://localhost:5173/customer/dashboard

  Payments:
    No STRIPE_SECRET_KEY set -> simulated checkout at /payment/mock

============================================

EOF