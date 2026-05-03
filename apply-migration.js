#!/usr/bin/env node
/**
 * Apply migration to Supabase database
 * Usage: node apply-migration.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function applyMigration() {
  try {
    const migrationPath = path.join(__dirname, 'migrations', '001_initial.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Better parsing: handle PostgreSQL dollar-quoted strings ($$...$$)
    const statements = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarQuoteTag = '';

    const lines = sql.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments at the start
      if (!trimmed || (trimmed.startsWith('--') && !inDollarQuote)) {
        continue;
      }

      currentStatement += line + '\n';

      // Check for dollar quote markers ($$, $tag$, etc.)
      let i = 0;
      while (i < line.length) {
        if (line[i] === '$') {
          // Find the end of the dollar quote tag
          let j = i + 1;
          while (j < line.length && line[j] !== '$') j++;
          
          if (j < line.length && line[j] === '$') {
            const tag = line.substring(i, j + 1);
            
            if (!inDollarQuote) {
              inDollarQuote = true;
              dollarQuoteTag = tag;
              i = j + 1;
            } else if (tag === dollarQuoteTag) {
              inDollarQuote = false;
              dollarQuoteTag = '';
              i = j + 1;
            } else {
              i++;
            }
          } else {
            i++;
          }
        } else {
          i++;
        }
      }

      // Check if statement ends with semicolon (only if not in a dollar quote)
      if (!inDollarQuote && trimmed.endsWith(';')) {
        statements.push(currentStatement.trim());
        currentStatement = '';
      }
    }

    // Add any remaining statement
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    // Filter out empty statements
    const validStatements = statements.filter(s => s.trim());

    console.log(`📋 Found ${validStatements.length} SQL statements to execute`);
    console.log('🔄 Applying migration...\n');

    let executed = 0;
    let skipped = 0;
    
    for (const statement of validStatements) {
      if (!statement.trim()) continue;
      
      try {
        await pool.query(statement);
        executed++;
        if (executed % 5 === 0) {
          process.stdout.write(`✓ ${executed}/${validStatements.length} statements executed\r`);
        }
      } catch (err) {
        // Skip "already exists" and "duplicate key" errors for idempotent execution
        if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
          skipped++;
        } else {
          console.error(`\n❌ Error executing statement:\n${statement.substring(0, 100)}...\nError: ${err.message}`);
          throw err;
        }
      }
    }

    console.log(`\n✅ Migration applied successfully! (${executed} executed, ${skipped} skipped as idempotent)`);
    console.log('\n📝 Next steps:');
    console.log('   1. Try logging in with: student1@studentsphere.com / Admin@123');
    console.log('   2. Or admin@studentsphere.com / Admin@123');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
