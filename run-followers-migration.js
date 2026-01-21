/**
 * Migration: Add Followers System
 * Adds follower_count and following_count to users table
 * Creates followers table for follow relationships
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🚀 Starting Followers System Migration...\n');

    // SQL migrations
    const migrations = [
      // Add follower_count to users
      {
        name: 'Add follower_count to users',
        sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;'
      },
      // Add following_count to users
      {
        name: 'Add following_count to users',
        sql: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;'
      },
      // Create followers table
      {
        name: 'Create followers table',
        sql: `CREATE TABLE IF NOT EXISTS followers (
          id SERIAL PRIMARY KEY,
          follower_id VARCHAR NOT NULL,
          followee_id VARCHAR NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(follower_id, followee_id),
          FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (followee_id) REFERENCES users(id) ON DELETE CASCADE
        );`
      },
      // Create index on follower_id
      {
        name: 'Create index on follower_id',
        sql: 'CREATE INDEX IF NOT EXISTS idx_followers_follower_id ON followers(follower_id);'
      },
      // Create index on followee_id
      {
        name: 'Create index on followee_id',
        sql: 'CREATE INDEX IF NOT EXISTS idx_followers_followee_id ON followers(followee_id);'
      }
    ];

    // Execute each migration
    for (const migration of migrations) {
      try {
        console.log(`⏳ ${migration.name}...`);
        await pool.query(migration.sql);
        console.log(`✅ ${migration.name}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️  ${migration.name} (already exists)`);
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ Migration completed successfully!\n');
    console.log('📊 Changes applied:');
    console.log('   - Added follower_count column to users table');
    console.log('   - Added following_count column to users table');
    console.log('   - Created followers table with indexes');
    console.log('   - Added cascading delete constraints\n');

    await pool.end();

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
