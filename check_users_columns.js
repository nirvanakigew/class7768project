import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND (column_name LIKE '%follower%' OR column_name LIKE '%following%')
      ORDER BY ordinal_position;
    `);
    
    console.log('Users table follower/following columns:');
    if (result.rows.length === 0) {
      console.log('  (none found)');
    } else {
      result.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}, default=${row.column_default}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
