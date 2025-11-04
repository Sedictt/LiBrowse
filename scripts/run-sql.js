// Generic SQL runner for LiBrowse migrations
// Usage: node scripts/run-sql.js path/to/file.sql

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error('Usage: node scripts/run-sql.js <path-to-sql-file>');
    process.exit(1);
  }

  const absPath = path.isAbsolute(sqlPath) ? sqlPath : path.join(process.cwd(), sqlPath);
  if (!fs.existsSync(absPath)) {
    console.error('SQL file not found:', absPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(absPath, 'utf8');

  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange',
    multipleStatements: true,
    // Larger timeouts for migrations
    connectTimeout: 60_000,
  };

  console.log('Connecting to MySQL...', { host: config.host, db: config.database, user: config.user });

  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Connected. Running SQL:', path.basename(absPath));
    const start = Date.now();

    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    await connection.query(sql);

    const ms = Date.now() - start;
    console.log(`✅ Migration applied successfully in ${ms}ms`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.sql) {
      console.error('Failed SQL snippet:', (err.sql || '').slice(0, 500));
    }
    process.exitCode = 1;
  } finally {
    try { if (connection) await connection.end(); } catch {}
  }
}

main();

