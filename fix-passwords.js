const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixPasswords() {
  try {
    console.log('🔐 Generating password hash for "Admin@123"...');
    const hash = await bcrypt.hash('Admin@123', 12);
    console.log(`Generated hash: ${hash}`);
    
    // Update all seed users with the correct password
    const seedEmails = [
      'admin@studentsphere.com',
      'admin2@studentsphere.com',
      'lecturer1@studentsphere.com',
      'lecturer2@studentsphere.com',
      'lecturer3@studentsphere.com',
      'mentor1@studentsphere.com',
      'mentor2@studentsphere.com',
      'mentor3@studentsphere.com',
      'student1@studentsphere.com',
      'student2@studentsphere.com',
      'student3@studentsphere.com',
      'student4@studentsphere.com',
      'student5@studentsphere.com',
      'student6@studentsphere.com',
      'student7@studentsphere.com'
    ];
    
    console.log(`\n🔄 Updating ${seedEmails.length} users with new password hash...`);
    
    for (const email of seedEmails) {
      await pool.query(
        'UPDATE "user" SET password_hash = $1 WHERE email = $2',
        [hash, email]
      );
    }
    
    console.log(`✅ Successfully updated all ${seedEmails.length} users!`);
    console.log('\n📝 All users can now log in with password: Admin@123');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

fixPasswords();
