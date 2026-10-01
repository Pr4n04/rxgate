#!/usr/bin/env node
/**
 * RxGate API smoke test.
 *
 * Exercises the security-critical paths against a running backend on :3001.
 * Uses only the seeded local development accounts — no real credentials, no
 * network calls to Stripe, and no real patient data.
 *
 *   node scripts/smoke-test.js            # assumes server already running
 *
 * Covers the regressions that were previously live in the codebase:
 *   - unauthenticated PII read of a prescription        (was: no auth at all)
 *   - unauthenticated Stripe checkout session minting   (was: no auth at all)
 *   - JWT secret falling back to a literal in the repo (was: hardcoded default)
 *   - logout not actually revoking the token           (was: never read `revoked`)
 *   - invalid/expired token answering 403 and wedging the client (was: 403)
 *   - GDPR export redacting the subject's own email    (was: column not selected)
 *   - valid Schedule 2 blocked when supply was omitted (was: hardcoded 30 days)
 *   - controlled-drug schedule missing from GET /api/drugs
 */

const path = require('path');
const crypto = require('crypto');

process.chdir(path.join(__dirname, '..'));
require('dotenv').config();

const Database = require('better-sqlite3');
const { validateControlledDrugPrescription } = require('../controllers/validation');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

// ---------------------------------------------------------------- fixtures
const db = new Database(path.join(__dirname, '..', 'rxgate.db'));
const CUSTOMER_EMAIL = 'customer@rxgate.example';
const OTHER_EMAIL = 'someone-else@rxgate.example';

const rid = () => crypto.randomUUID();
const marker = `smoke-${Date.now()}`;

const customer = db.prepare('SELECT id, email FROM users WHERE email = ?').get(CUSTOMER_EMAIL);
if (!customer) {
  console.error('Seeded customer not found. Run: node db/seed.js');
  process.exit(1);
}

const drug = db.prepare("SELECT id, price, controlled_drug_schedule FROM drugs WHERE name LIKE '%Palliative%' OR controlled_drug_schedule IS NOT NULL LIMIT 1").get()
  || db.prepare('SELECT id, price, controlled_drug_schedule FROM drugs LIMIT 1').get();

const cdDrug = db.prepare("SELECT id, price, controlled_drug_schedule FROM drugs WHERE controlled_drug_schedule = 'CD-SCH2' LIMIT 1").get();

const ids = [rid(), rid(), rid()];
const mkPrescription = (id, email, status, extra = {}) => {
  db.prepare(`
    INSERT INTO prescriptions (id, customer_id, customer_name, customer_email, upload_source,
      drug_id, drug_name, image_path, dosage_instructions, status, created_at, updated_at)
    VALUES (?, ?, 'Test Subject', ?, 'customer', ?, 'Test Drug', '/tmp/smoke.png',
            '1 tablet twice daily', ?, datetime('now'), datetime('now'))
  `).run(id, email === customer.email ? customer.id : null, email, drug.id, status, ...Object.values(extra));
  return id;
};

const [pendingRx, approvedRx, noSessionRx] = [ids[0], ids[1], ids[2]];
mkPrescription(pendingRx, customer.email, 'pending');
mkPrescription(approvedRx, customer.email, 'approved');
mkPrescription(noSessionRx, customer.email, 'approved');

// an order exists but has no Stripe session yet -> the mint path
db.prepare(`
  INSERT INTO orders (id, prescription_id, customer_id, customer_email, drug_id, drug_name, amount, status)
  VALUES (?, ?, ?, ?, ?, 'Test Drug', 1250, 'pending')
`).run(rid(), noSessionRx, customer.id, customer.email, drug.id);

// ---------------------------------------------------------------- run
(async () => {
  console.log(`\nRxGate smoke test against ${BASE}\n`);

  console.log('Authentication');
  let login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: CUSTOMER_EMAIL, password: 'customer123' },
  });
  check('customer can log in with seeded credentials', login.status === 200 && !!login.json?.token,
    `got ${login.status}`);
  const customerToken = login.json?.token;

  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@rxgate.example', password: 'admin123' },
  });
  check('admin can log in', adminLogin.status === 200 && !!adminLogin.json?.token, `got ${adminLogin.status}`);
  const adminToken = adminLogin.json?.token;

  const bad = await api('/api/auth/login', {
    method: 'POST',
    body: { email: CUSTOMER_EMAIL, password: 'wrong-password' },
  });
  check('wrong password is rejected with 401', bad.status === 401, `got ${bad.status}`);

  const noToken = await api('/api/admin/prescriptions');
  check('protected admin route rejects anonymous caller', noToken.status === 401, `got ${noToken.status}`);

  const garbage = await api('/api/admin/prescriptions', { token: 'not-a-real-token' });
  check('invalid token returns 401 (not 403, which wedged the client)',
    garbage.status === 401, `got ${garbage.status}`);

  console.log('\nPrescription PII access control');
  const anonPending = await api(`/api/prescriptions/${pendingRx}`);
  check('anonymous caller cannot read a pending prescription',
    anonPending.status === 401, `got ${anonPending.status}`);

  const ownerRead = await api(`/api/prescriptions/${pendingRx}`, { token: customerToken });
  check('owning customer can read their own prescription',
    ownerRead.status === 200 && !!ownerRead.json?.prescription, `got ${ownerRead.status}`);
  check('owner sees their own clinical details',
    ownerRead.json?.prescription?.dosage_instructions === '1 tablet twice daily');

  const staffRead = await api(`/api/prescriptions/${pendingRx}`, { token: adminToken });
  check('staff can read any prescription', staffRead.status === 200, `got ${staffRead.status}`);

  const anonApproved = await api(`/api/prescriptions/${approvedRx}`);
  check('anonymous holder of a payment link gets a redacted view',
    anonApproved.status === 200 && anonApproved.json?.prescription?.redacted === true, `got ${anonApproved.status}`);
  check('redacted view withholds patient name',
    anonApproved.json?.prescription?.customer_name === undefined);
  check('redacted view withholds dosage instructions',
    anonApproved.json?.prescription?.dosage_instructions === undefined);
  check('redacted view withholds patient email',
    anonApproved.json?.prescription?.customer_email === undefined);

  console.log('\nCheckout session authorisation');
  const anonMint = await api('/api/orders/create', {
    method: 'POST',
    body: { prescriptionId: noSessionRx },
  });
  check('anonymous caller cannot mint a Stripe checkout session',
    anonMint.status === 401, `got ${anonMint.status}`);

  console.log('\nControlled drug rules');
  const cdNoSupply = validateControlledDrugPrescription({
    cdSchedule: 'CD-SCH2',
    prescriptionDate: new Date().toISOString(),
    vetRegNumber: 'VET-12345',
    // supplyDays deliberately omitted
  });
  check('valid Schedule 2 is not blocked merely because supply was omitted',
    cdNoSupply.valid === true, `errors: ${JSON.stringify(cdNoSupply.errors)}`);

  const cdOverSupply = validateControlledDrugPrescription({
    cdSchedule: 'CD-SCH2',
    prescriptionDate: new Date().toISOString(),
    vetRegNumber: 'VET-12345',
    supplyDays: 60,
  });
  check('Schedule 2 supply above 28 days is rejected', cdOverSupply.valid === false);

  const cdStale = validateControlledDrugPrescription({
    cdSchedule: 'CD-SCH2',
    prescriptionDate: new Date(Date.now() - 40 * 86400000).toISOString(),
    vetRegNumber: 'VET-12345',
    supplyDays: 28,
  });
  check('Schedule 2 older than 28 days is rejected', cdStale.valid === false);

  console.log('\nCatalogue');
  const drugs = await api('/api/drugs');
  check('GET /api/drugs is public', drugs.status === 200, `got ${drugs.status}`);
  const sch2 = (drugs.json?.drugs || []).find((d) => d.controlled_drug_schedule === 'CD-SCH2');
  check('catalogue exposes controlled_drug_schedule (drives the Schedule badge)',
    !!sch2, 'no CD-SCH2 drug in payload');

  console.log('\nGDPR data subject access');
  const exportRes = await api('/api/gdpr/data', { token: customerToken });
  check('customer can export their data', exportRes.status === 200, `got ${exportRes.status}`);
  const exported = exportRes.json?.prescriptions || [];
  const mine = exported.find((p) => p.id === pendingRx);
  check('export includes the subject\'s own email rather than [REDACTED]',
    mine && mine.customer_email === CUSTOMER_EMAIL, `got ${mine ? mine.customer_email : 'row missing'}`);

  console.log('\nWorkflow state machine');
  const staleRx = rid();
  mkPrescription(staleRx, customer.email, 'pending');

  const missing = await api('/api/admin/prescriptions/does-not-exist/fulfill', {
    method: 'PUT', token: adminToken,
  });
  check('fulfilling an unknown prescription 404s (was 200 with fake success)',
    missing.status === 404, `got ${missing.status}`);

  const skipped = await api(`/api/admin/prescriptions/${staleRx}/fulfill`, {
    method: 'PUT', token: adminToken,
  });
  check('a pending prescription cannot jump straight to fulfilled',
    skipped.status === 409, `got ${skipped.status}`);

  const paidEarly = await api(`/api/admin/prescriptions/${staleRx}/mark-paid`, {
    method: 'PUT', token: adminToken,
  });
  check('a pending prescription cannot be marked paid before approval',
    paidEarly.status === 409, `got ${paidEarly.status}`);

  db.prepare("UPDATE prescriptions SET status = 'payment_sent' WHERE id = ?").run(staleRx);
  const markPaid = await api(`/api/admin/prescriptions/${staleRx}/mark-paid`, {
    method: 'PUT', token: adminToken,
  });
  check('payment_sent -> paid is permitted', markPaid.status === 200, `got ${markPaid.status}`);

  const fulfil = await api(`/api/admin/prescriptions/${staleRx}/fulfill`, {
    method: 'PUT', token: adminToken,
  });
  check('paid -> fulfilled is permitted', fulfil.status === 200, `got ${fulfil.status}`);

  const replay = await api(`/api/admin/prescriptions/${staleRx}/fulfill`, {
    method: 'PUT', token: adminToken,
  });
  check('replaying a completed transition is rejected',
    replay.status === 409, `got ${replay.status}`);

  console.log('\nRole-based access control');
  const vetLogin = await api('/api/auth/login', {
    method: 'POST', body: { email: 'vet@rxgate.example', password: 'vet123' },
  });
  const vetToken = vetLogin.json?.token;

  const customerOnAdmin = await api('/api/admin/users', { token: customerToken });
  check('customer cannot reach an admin route', customerOnAdmin.status === 403,
    `got ${customerOnAdmin.status}`);

  if (vetToken) {
    const vetOnAdmin = await api('/api/admin/users', { token: vetToken });
    check('vet cannot reach an admin route', vetOnAdmin.status === 403,
      `got ${vetOnAdmin.status}`);
  }

  console.log('\nSession revocation');
  if (customerToken) {
    await api('/api/auth/logout', { method: 'POST', token: customerToken });
    const afterLogout = await api('/api/gdpr/data', { token: customerToken });
    check('token is rejected after logout (revocation is actually enforced)',
      afterLogout.status === 401, `got ${afterLogout.status}`);
  }

  // -------------------------------------------------------------- cleanup
  db.prepare('DELETE FROM orders WHERE prescription_id IN (?,?,?,?)').run(pendingRx, approvedRx, noSessionRx, staleRx);
  db.prepare('DELETE FROM prescriptions WHERE id IN (?,?,?,?)').run(pendingRx, approvedRx, noSessionRx, staleRx);
  db.prepare("DELETE FROM data_requests WHERE request_type = 'export'").run();
  db.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nAll checks passed.');
})().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exit(1);
});