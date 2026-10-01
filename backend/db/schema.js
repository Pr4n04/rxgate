const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'rxgate.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'vet', 'admin')) DEFAULT 'customer',
      practice_name TEXT,
      veterinary_number TEXT,
      phone TEXT,
      -- GDPR fields
      gdpr_consent INTEGER NOT NULL DEFAULT 0,
      gdpr_consent_date DATETIME,
      gdpr_marketing_consent INTEGER NOT NULL DEFAULT 0,
      data_processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      account_closed INTEGER NOT NULL DEFAULT 0,
      account_closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS drugs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      active_ingredient TEXT,
      strength TEXT,
      species TEXT,
      description TEXT,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      requires_prescription INTEGER NOT NULL DEFAULT 1,
      -- Controlled Drug Schedule (UK classification)
      controlled_drug_schedule TEXT CHECK(controlled_drug_schedule IN ('CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', NULL)),
      max_supply_days INTEGER DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      -- Who uploaded: 'vet' or 'customer'
      upload_source TEXT NOT NULL DEFAULT 'vet' CHECK(upload_source IN ('vet', 'customer')),
      -- Vet who uploaded (nullable for customer uploads)
      vet_id TEXT,
      -- Original prescriber info (from the prescription paper)
      vet_name_on_rx TEXT,
      vet_reg_number_on_rx TEXT,
      prescription_date TEXT,
      drug_id TEXT,
      drug_name TEXT,
      image_path TEXT NOT NULL,
      ocr_text TEXT,
      dosage_instructions TEXT,
      -- Controlled drug fields
      is_controlled_drug INTEGER NOT NULL DEFAULT 0,
      cd_schedule TEXT CHECK(cd_schedule IN ('CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', NULL)),
      cd_validated INTEGER NOT NULL DEFAULT 0,
      cd_validated_by TEXT,
      cd_validated_at DATETIME,
      -- Status workflow: pending → (approved → payment_sent → paid → fulfilled) OR rejected
      status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected', 'payment_sent', 'paid', 'fulfilled')) DEFAULT 'pending',
      admin_notes TEXT,
      payment_link TEXT,
      payment_link_sent_at DATETIME,
      paid_at DATETIME,
      -- GDPR: auto-delete after retention period
      retention_expiry DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (vet_id) REFERENCES users(id),
      FOREIGN KEY (drug_id) REFERENCES drugs(id),
      FOREIGN KEY (cd_validated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      prescription_id TEXT NOT NULL,
      customer_id TEXT,
      customer_email TEXT NOT NULL,
      drug_id TEXT,
      drug_name TEXT,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'gbp',
      stripe_payment_intent_id TEXT,
      stripe_session_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'requires_payment', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id),
      FOREIGN KEY (customer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- GDPR data subject requests
    CREATE TABLE IF NOT EXISTS data_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      email TEXT NOT NULL,
      request_type TEXT NOT NULL CHECK(request_type IN ('export', 'deletion', 'rectification', 'restrict_processing')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'rejected')),
      details TEXT,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Session tokens for token revocation
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_vet ON prescriptions(vet_id);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_email ON prescriptions(customer_email);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_customer ON prescriptions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_upload_source ON prescriptions(upload_source);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_cd ON prescriptions(is_controlled_drug);
    CREATE INDEX IF NOT EXISTS idx_prescriptions_retention ON prescriptions(retention_expiry);
    CREATE INDEX IF NOT EXISTS idx_orders_prescription ON orders(prescription_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_email);
    CREATE INDEX IF NOT EXISTS idx_drugs_active ON drugs(is_active);
    CREATE INDEX IF NOT EXISTS idx_drugs_name ON drugs(name);
    CREATE INDEX IF NOT EXISTS idx_drugs_cd ON drugs(controlled_drug_schedule);
    CREATE INDEX IF NOT EXISTS idx_data_requests_user ON data_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_users_gdpr ON users(gdpr_consent);
  `);

  // Run migrations for existing databases (add columns if they don't exist)
  // This makes the schema backwards-compatible with existing .db files
  const migrations = [
    `ALTER TABLE users ADD COLUMN gdpr_consent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN gdpr_consent_date DATETIME`,
    `ALTER TABLE users ADD COLUMN gdpr_marketing_consent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN data_processed_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE users ADD COLUMN account_closed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN account_closed_at DATETIME`,
    `ALTER TABLE drugs ADD COLUMN controlled_drug_schedule TEXT CHECK(controlled_drug_schedule IN ('CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', NULL))`,
    `ALTER TABLE drugs ADD COLUMN max_supply_days INTEGER DEFAULT 30`,
    `ALTER TABLE prescriptions ADD COLUMN upload_source TEXT NOT NULL DEFAULT 'vet' CHECK(upload_source IN ('vet', 'customer'))`,
    `ALTER TABLE prescriptions ADD COLUMN vet_name_on_rx TEXT`,
    `ALTER TABLE prescriptions ADD COLUMN vet_reg_number_on_rx TEXT`,
    `ALTER TABLE prescriptions ADD COLUMN prescription_date TEXT`,
    `ALTER TABLE prescriptions ADD COLUMN is_controlled_drug INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE prescriptions ADD COLUMN cd_schedule TEXT CHECK(cd_schedule IN ('CD-SCH2', 'CD-SCH3', 'CD-SCH4', 'CD-SCH5', NULL))`,
    `ALTER TABLE prescriptions ADD COLUMN cd_validated INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE prescriptions ADD COLUMN cd_validated_by TEXT`,
    `ALTER TABLE prescriptions ADD COLUMN cd_validated_at DATETIME`,
    `ALTER TABLE prescriptions ADD COLUMN retention_expiry DATETIME`,
    `ALTER TABLE prescriptions ADD COLUMN cart_items TEXT DEFAULT '[]'`,
    `ALTER TABLE activity_log ADD COLUMN ip_address TEXT`,
  ];

  for (const migration of migrations) {
    try {
      db.exec(migration);
    } catch (e) {
      // Column already exists - ignore
      if (!e.message.includes('duplicate column')) {
        console.warn('Migration note:', e.message);
      }
    }
  }

  console.log('Database schema initialised successfully.');
  db.close();
}

// Run if executed directly
if (require.main === module) {
  initDatabase();
}

module.exports = { getDb, initDatabase, DB_PATH };
