const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    // Check if user table exists and has data
    const result = await pool.query('SELECT COUNT(*) as count FROM "user"');
    console.log(`Total users in database: ${result.rows[0].count}`);
    
    // Check for student1
    const student = await pool.query(
      'SELECT id, email, role FROM "user" WHERE email = $1',
      ['student1@studentsphere.com']
    );
    
    if (student.rows[0]) {
      console.log('✅ Student found:', student.rows[0]);
    } else {
      console.log('❌ Student NOT found');
    }
    
    // List all users
    const all = await pool.query('SELECT email, role FROM "user" ORDER BY email');
    console.log('\nAll users in database:');
    all.rows.forEach(u => console.log(`  - ${u.email} (${u.role})`));
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
