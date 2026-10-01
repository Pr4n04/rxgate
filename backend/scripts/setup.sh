#!/bin/bash
echo "============================================"
echo "  RxGate - Setup Script"
echo "  Veterinary Prescription Platform"
echo "============================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi
echo "✅ Node.js $(node -v) detected"

# Setup Backend
echo ""
echo "📦 Installing backend dependencies..."
cd "$(dirname "$0")/.."
npm install

# Setup Database
echo ""
echo "🗄️  Initialising database..."
node db/schema.js
node db/seed.js

# Setup Environment
# JWT_SECRET has no default on purpose, so the server refuses to boot without one.
# Generate it here so a fresh clone works in one step.
echo ""
echo "🔐 Configuring environment..."
cd "$(dirname "$0")/.."
if [ -f .env ]; then
    echo "   backend/.env already exists — leaving it untouched"
else
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
    sed "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env.example > .env
    echo "   Created backend/.env with a freshly generated JWT_SECRET"
    echo "   (Stripe and SMTP left blank — see backend/.env.example to enable them)"
fi

# Setup Frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd ../frontend
npm install

echo ""
echo "============================================"
echo "  🎉 Setup Complete!"
echo "============================================"
echo ""
echo "  To start the application:"
echo ""
echo "  Terminal 1 (Backend):"
echo "    cd backend && npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "    cd frontend && npm run dev"
echo ""
echo "  Smoke test (backend must be running):"
echo "    cd backend && node scripts/smoke-test.js"
echo ""
echo "  Payments:"
echo "    No STRIPE_SECRET_KEY set -> simulated checkout at /payment/mock"
echo ""
echo "  Development accounts:"
echo "    Admin:    admin@rxgate.example / admin123"
echo "    Vet:      vet@rxgate.example / vet123"
echo "    Customer: customer@rxgate.example / customer123"
echo ""
echo "  Dashboard URLs:"
echo "    Admin: http://localhost:5173/admin/dashboard"
echo "    Vet:   http://localhost:5173/vet/dashboard"
echo ""
echo "============================================"
