const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange_dev2'
  });
  
  try {
    const [columns] = await connection.execute('DESCRIBE transactions');
    console.log('📋 Current transactions table structure:');
    columns.forEach((col, index) => {
      console.log(`${index + 1}. ${col.Field} (${col.Type}) - ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
  } catch (error) {
    console.log('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkTable();
