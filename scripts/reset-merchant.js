#!/usr/bin/env node
// One-time script to delete a merchant record from the production Neon DB
// so the auto-onboard flow re-runs and assigns a clean alphanumeric merchant code.
//
// Usage: node scripts/reset-merchant.js <phone>
// Example: node scripts/reset-merchant.js 9893747922

const { Pool } = require("pg");

const phone = process.argv[2];
if (!phone) {
  console.error("Usage: node scripts/reset-merchant.js <phone>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    const check = await client.query(
      "SELECT id, merchant_code, kyc_status, phone FROM aeps_merchants WHERE phone = $1",
      [phone]
    );
    if (check.rows.length === 0) {
      console.log(`No merchant record found for phone ${phone}.`);
      return;
    }
    console.log("Found merchant record:", check.rows[0]);

    const del = await client.query(
      "DELETE FROM aeps_merchants WHERE phone = $1 RETURNING id, merchant_code",
      [phone]
    );
    console.log(`Deleted ${del.rowCount} merchant record(s):`, del.rows);
    console.log(`\nDone. User ${phone} will get a fresh merchant registration on next login.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
