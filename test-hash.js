const bcrypt = require('bcrypt');

async function test() {
  const hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPXKwmXjIhmNuy';
  const password = 'Admin@123';
  
  const matches = await bcrypt.compare(password, hash);
  console.log(`Password "${password}" matches hash: ${matches}`);
  
  // Also test the compare in the other direction
  const reHash = await bcrypt.hash(password, 12);
  console.log(`New hash for "${password}": ${reHash}`);
}

test();
