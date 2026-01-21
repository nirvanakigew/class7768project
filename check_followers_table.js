import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'followers' 
      ORDER BY ordinal_position;
    `);
    
    console.log('Followers table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Check for indexes
    const indexResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'followers';
    `);
    
    console.log('\nExisting indexes:');
    indexResult.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

check();
