const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixColumns() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'plv_book_exchange_dev2'
  });
  
  try {
    console.log('🔧 Adding missing columns...');
    
    // Add preferred_pickup_time column
    try {
      await connection.execute(`
        ALTER TABLE transactions 
        ADD COLUMN preferred_pickup_time DATETIME NULL 
        COMMENT 'Borrower preferred pickup time'
      `);
      console.log('✅ Added preferred_pickup_time column');
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('⚠️  preferred_pickup_time column already exists');
      } else {
        console.log('❌ Error adding preferred_pickup_time:', error.message);
      }
    }
    
    // Add borrow_duration column
    try {
      await connection.execute(`
        ALTER TABLE transactions 
        ADD COLUMN borrow_duration ENUM('1-week', '2-weeks', '3-weeks', '1-month', 'custom') NULL 
        COMMENT 'How long they want to borrow'
      `);
      console.log('✅ Added borrow_duration column');
    } catch (error) {
      if (error.message.includes('Duplicate column name')) {
        console.log('⚠️  borrow_duration column already exists');
      } else {
        console.log('❌ Error adding borrow_duration:', error.message);
      }
    }
    
    // Verify columns exist
    const [columns] = await connection.execute('DESCRIBE transactions');
    const hasPreferredTime = columns.some(col => col.Field === 'preferred_pickup_time');
    const hasBorrowDuration = columns.some(col => col.Field === 'borrow_duration');
    
    console.log('\n📋 Column verification:');
    console.log('preferred_pickup_time exists:', hasPreferredTime ? '✅' : '❌');
    console.log('borrow_duration exists:', hasBorrowDuration ? '✅' : '❌');
    
    if (hasPreferredTime && hasBorrowDuration) {
      console.log('\n🎉 All required columns are now present!');
    }
    
  } catch (error) {
    console.log('❌ Migration failed:', error.message);
  } finally {
    await connection.end();
    console.log('🔌 Database connection closed');
  }
}

fixColumns();
