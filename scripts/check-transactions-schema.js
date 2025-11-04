// Verifies transactions schema alignment post-migration
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main(){
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange',
    multipleStatements: true
  };
  const conn = await mysql.createConnection(cfg);
  try {
    const checks = [
      { name: 'enum_status_values', sql: "SHOW COLUMNS FROM transactions LIKE 'status'" },
      { name: 'legacy_columns_absent', sql: "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME IN ('req_msg','bor_contact','bor_addr','pickup_type','pickup_spot','pref_pickup_time','borrower_duration','custom_days','borrower_note','lender_note','reason_deny','return_state','date_req','date_approve','date_borrowed','date_expected','date_returned')" },
      { name: 'new_columns_present', sql: "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME IN ('request_message','borrower_contact','borrower_address','pickup_method','pickup_location','preferred_pickup_time','borrow_duration','lender_notes','rejection_reason','return_condition','request_date','approved_date','borrowed_date','expected_return_date','actual_return_date')" },
      { name: 'status_distribution', sql: "SELECT status, COUNT(*) AS cnt FROM transactions GROUP BY status ORDER BY status" },
      { name: 'sample_rows', sql: "SELECT id, request_message, pickup_location, expected_return_date, request_date FROM transactions ORDER BY request_date DESC LIMIT 5" }
    ];

    for (const c of checks){
      const [rows] = await conn.query(c.sql);
      console.log(`\n--- ${c.name} ---`);
      console.log(JSON.stringify(rows, null, 2));
    }
  } finally {
    await conn.end();
  }
}

main().catch(e=>{ console.error('Check failed:', e); process.exit(1); });

