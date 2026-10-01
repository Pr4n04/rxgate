const { getDb, initDatabase } = require('./schema');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  initDatabase();
  const db = getDb();

  // Check if admin already exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@rxgate.example');
  if (existingAdmin) {
    console.log('Seed data already exists. Skipping.');
    db.close();
    return;
  }

  // Cost factor 12, matching backend/routes/auth.js. Seeded accounts were
  // previously hashed at 10, so a database seeded by this script accepted
  // weaker hashes than the same password created through registration.
  const BCRYPT_COST = 12;
  const adminHash = await bcrypt.hash('admin123', BCRYPT_COST);
  const vetHash = await bcrypt.hash('vet123', BCRYPT_COST);
  const customerHash = await bcrypt.hash('customer123', BCRYPT_COST);

  // Create admin user
  db.prepare(`INSERT INTO users (id, email, password_hash, name, role, gdpr_consent, gdpr_consent_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    uuidv4(), 'admin@rxgate.example', adminHash, 'Admin User', 'admin', 1, new Date().toISOString()
  );

  // Create a sample vet
  const vetId = uuidv4();
  db.prepare(`INSERT INTO users (id, email, password_hash, name, role, practice_name, veterinary_number, gdpr_consent, gdpr_consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    vetId, 'vet@rxgate.example', vetHash, 'Dr Sarah Vet', 'vet', 'RxGate Sample Practice', 'TEST-0001', 1, new Date().toISOString()
  );

  // Create a sample customer
  db.prepare(`INSERT INTO users (id, email, password_hash, name, role, gdpr_consent, gdpr_consent_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    uuidv4(), 'customer@rxgate.example', customerHash, 'John PetOwner', 'customer', 1, new Date().toISOString()
  );

  // Seed drugs - now with controlled drug schedules
  const drugs = [
    { name: 'NexGard Spectra', active_ingredient: 'Afoxolaner + Milbemycin oxime', strength: '11.3mg / 56.5mg', species: 'Dog', price: 4500, stock: 100, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Revolution Plus', active_ingredient: 'Selamectin + Sarolaner', strength: '45mg / 15mg', species: 'Cat', price: 3800, stock: 75, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Rimadyl', active_ingredient: 'Carprofen', strength: '50mg', species: 'Dog', price: 2500, stock: 200, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Metacam Oral Suspension', active_ingredient: 'Meloxicam', strength: '1.5mg/ml', species: 'Dog', price: 3200, stock: 50, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Clavaseptin', active_ingredient: 'Amoxicillin + Clavulanic acid', strength: '250mg', species: 'Dog', price: 1800, stock: 150, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Zylkene', active_ingredient: 'Alpha-casozepine', strength: '75mg', species: 'Dog & Cat', price: 2200, stock: 80, requires_prescription: 0, cd_schedule: null, max_days: 30 },
    { name: 'Cystophan', active_ingredient: 'N-acetyl glucosamine', strength: '500mg', species: 'Cat', price: 1950, stock: 60, requires_prescription: 0, cd_schedule: null, max_days: 30 },
    { name: 'FortiFlora', active_ingredient: 'Probiotic', strength: '1g sachet', species: 'Dog & Cat', price: 1500, stock: 200, requires_prescription: 0, cd_schedule: null, max_days: 30 },
    { name: 'Atopica', active_ingredient: 'Ciclosporin', strength: '50mg', species: 'Dog', price: 5500, stock: 40, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    { name: 'Apoquel', active_ingredient: 'Oclacitinib', strength: '16mg', species: 'Dog', price: 4200, stock: 90, requires_prescription: 1, cd_schedule: null, max_days: 30 },
    // Controlled drugs
    { name: 'Ketamidor', active_ingredient: 'Ketamine hydrochloride', strength: '100mg/ml', species: 'Dog & Cat', price: 8500, stock: 20, requires_prescription: 1, cd_schedule: 'CD-SCH2', max_days: 28 },
    { name: 'Buprecare', active_ingredient: 'Buprenorphine hydrochloride', strength: '0.3mg/ml', species: 'Dog & Cat', price: 7200, stock: 15, requires_prescription: 1, cd_schedule: 'CD-SCH3', max_days: 28 },
    { name: 'Diazepam Desitin', active_ingredient: 'Diazepam', strength: '5mg/ml', species: 'Dog & Cat', price: 4800, stock: 25, requires_prescription: 1, cd_schedule: 'CD-SCH4', max_days: 30 },
    { name: 'Phenoleptil', active_ingredient: 'Phenobarbital', strength: '60mg', species: 'Dog', price: 3500, stock: 35, requires_prescription: 1, cd_schedule: 'CD-SCH4', max_days: 30 },
  ];

  const insertDrug = db.prepare(`
    INSERT INTO drugs (id, name, active_ingredient, strength, species, description, price, stock, requires_prescription, controlled_drug_schedule, max_supply_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((drugs) => {
    for (const drug of drugs) {
      const cdNote = drug.cd_schedule ? ` [${drug.cd_schedule}]` : '';
      insertDrug.run(
        uuidv4(), drug.name, drug.active_ingredient, drug.strength, drug.species,
        `High-quality ${drug.name} for ${drug.species}. Prescription may be required.${cdNote}`,
        drug.price, drug.stock, drug.requires_prescription, drug.cd_schedule, drug.max_days
      );
    }
  });

  insertMany(drugs);

  console.log('Seed data created successfully!');
  console.log('  Admin:     admin@rxgate.example / admin123');
  console.log('  Vet:       vet@rxgate.example / vet123');
  console.log('  Customer:  customer@rxgate.example / customer123');
  console.log(`  Drugs:     ${drugs.length} (including ${drugs.filter(d => d.cd_schedule).length} controlled drugs)`);

  db.close();
}

seed().catch(console.error);
