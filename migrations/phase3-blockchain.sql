-- Phase 3: Database Migrations for On-Chain Challenge System
-- Migration Date: 2026-01-17
-- Target: Base Testnet Sepolia (Chain ID: 84532)

-- ============================================================================
-- 1. Add Blockchain Fields to Existing challenges Table
-- ============================================================================

-- Blockchain settlement transaction hashes
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_chain_id INTEGER;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_contract_address VARCHAR;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_creation_tx_hash VARCHAR UNIQUE;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_resolution_tx_hash VARCHAR;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_payout_tx_hash VARCHAR;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_settlement_tx_hash VARCHAR;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_block_number INTEGER;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS blockchain_settlement_block_number INTEGER;

-- Token & amount fields
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS payment_token_address VARCHAR;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS stake_amount_wei BIGINT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS points_multiplier NUMERIC(3, 2) DEFAULT 1.00;

-- Resolution & status fields
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS admin_signature TEXT;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS on_chain_status VARCHAR DEFAULT 'pending';
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS on_chain_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS resolution_timestamp TIMESTAMP;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS on_chain_metadata JSONB;

-- Create indexes for blockchain fields
CREATE INDEX IF NOT EXISTS idx_challenges_blockchain_status ON challenges(on_chain_status);
CREATE INDEX IF NOT EXISTS idx_challenges_payment_token ON challenges(payment_token_address);
CREATE INDEX IF NOT EXISTS idx_challenges_chain_id ON challenges(blockchain_chain_id);

-- ============================================================================
-- 2. User Points Ledgers Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_points_ledgers (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  points_balance BIGINT DEFAULT 0,
  total_points_earned BIGINT DEFAULT 0,
  total_points_burned BIGINT DEFAULT 0,
  points_locked_in_escrow BIGINT DEFAULT 0,
  chain_synced_at TIMESTAMP,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_points_ledger UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_points_balance ON user_points_ledgers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_points_synced ON user_points_ledgers(chain_synced_at);

-- ============================================================================
-- 3. Points Transactions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS points_transactions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  challenge_id INTEGER,
  transaction_type VARCHAR NOT NULL,
  amount BIGINT NOT NULL,
  reason TEXT,
  blockchain_tx_hash VARCHAR,
  block_number INTEGER,
  chain_id INTEGER DEFAULT 84532,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_points_user_id ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_challenge_id ON points_transactions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_points_tx_type ON points_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_points_tx_hash ON points_transactions(blockchain_tx_hash);
CREATE INDEX IF NOT EXISTS idx_points_created_at ON points_transactions(created_at);

-- ============================================================================
-- 4. Blockchain Transactions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS blockchain_transactions (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL DEFAULT 84532,
  transaction_hash VARCHAR NOT NULL UNIQUE,
  block_number INTEGER,
  transaction_type VARCHAR NOT NULL,
  contract_address VARCHAR NOT NULL,
  contract_name VARCHAR,
  from_address VARCHAR NOT NULL,
  to_address VARCHAR,
  function_name VARCHAR,
  parameters TEXT,
  
  status VARCHAR NOT NULL,
  gas_used BIGINT,
  gas_price BIGINT,
  transaction_fee NUMERIC(18, 6),
  value_transferred BIGINT,
  
  challenge_id INTEGER,
  user_id VARCHAR,
  
  error_message TEXT,
  metadata TEXT,
  
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_blockchain_type ON blockchain_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_blockchain_status ON blockchain_transactions(status);
CREATE INDEX IF NOT EXISTS idx_blockchain_challenge_id ON blockchain_transactions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_user_id ON blockchain_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_blockchain_block_number ON blockchain_transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_blockchain_submitted_at ON blockchain_transactions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_blockchain_contract ON blockchain_transactions(contract_address);

-- ============================================================================
-- 5. Challenge Escrow Records Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS challenge_escrow_records (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL,
  user_id VARCHAR NOT NULL,
  token_address VARCHAR NOT NULL,
  chain_id INTEGER DEFAULT 84532,
  
  amount_escrowed BIGINT NOT NULL,
  amount_released BIGINT DEFAULT 0,
  amount_claimed BIGINT DEFAULT 0,
  
  status VARCHAR NOT NULL,
  side VARCHAR,
  
  lock_tx_hash VARCHAR,
  release_tx_hash VARCHAR,
  claim_tx_hash VARCHAR,
  
  locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escrow_challenge_id ON challenge_escrow_records(challenge_id);
CREATE INDEX IF NOT EXISTS idx_escrow_user_id ON challenge_escrow_records(user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON challenge_escrow_records(status);
CREATE INDEX IF NOT EXISTS idx_escrow_token ON challenge_escrow_records(token_address);

-- ============================================================================
-- 6. Contract Deployments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS contract_deployments (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract_name VARCHAR NOT NULL,
  contract_address VARCHAR NOT NULL,
  contract_version VARCHAR NOT NULL,
  deployment_tx_hash VARCHAR NOT NULL,
  deployer_address VARCHAR NOT NULL,
  block_number INTEGER NOT NULL,
  
  constructor_args TEXT,
  compiled_bytecode TEXT,
  abi_hash VARCHAR,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_contract_deployment UNIQUE (chain_id, contract_name, contract_address)
);

CREATE INDEX IF NOT EXISTS idx_deployment_chain ON contract_deployments(chain_id);
CREATE INDEX IF NOT EXISTS idx_deployment_name ON contract_deployments(contract_name);

-- ============================================================================
-- 7. Admin Signatures Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_signatures_log (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL,
  admin_address VARCHAR NOT NULL,
  message_hash VARCHAR NOT NULL,
  signature TEXT NOT NULL,
  
  winner VARCHAR,
  points_awarded INTEGER,
  
  is_verified BOOLEAN DEFAULT FALSE,
  verification_error TEXT,
  
  submitted_tx_hash VARCHAR,
  submitted_block_number INTEGER,
  
  signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_signatures_challenge_id ON admin_signatures_log(challenge_id);
CREATE INDEX IF NOT EXISTS idx_signatures_admin_address ON admin_signatures_log(admin_address);
CREATE INDEX IF NOT EXISTS idx_signatures_verified ON admin_signatures_log(is_verified);

-- ============================================================================
-- 8. User Wallet Addresses Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_wallet_addresses (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  chain_id INTEGER NOT NULL DEFAULT 84532,
  wallet_address VARCHAR NOT NULL,
  wallet_type VARCHAR NOT NULL,
  
  is_verified BOOLEAN DEFAULT FALSE,
  verification_tx_hash VARCHAR,
  
  usdc_balance BIGINT DEFAULT 0,
  usdt_balance BIGINT DEFAULT 0,
  points_balance BIGINT DEFAULT 0,
  native_balance BIGINT DEFAULT 0,
  
  is_primary BOOLEAN DEFAULT FALSE,
  
  last_balance_sync_at TIMESTAMP,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_user_wallet UNIQUE (user_id, chain_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_wallet_address ON user_wallet_addresses(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_user_chain ON user_wallet_addresses(user_id, chain_id);

-- ============================================================================
-- 9. Create Views for Common Queries
-- ============================================================================

-- Challenges awaiting resolution
-- NOTE: This view requires the challenges table to have the following columns:
-- id, title, description, status, on_chain_status, challenger, challenged, amount, created_at, due_date
-- If table doesn't have all columns, comment out this view and run after migrations are complete
/*
CREATE OR REPLACE VIEW v_challenges_pending_resolution AS
SELECT 
  c.id,
  c.title,
  c.description,
  c.status,
  c.on_chain_status,
  c.challenger,
  c.challenged,
  c.amount,
  c.created_at,
  c.due_date,
  COUNT(DISTINCT CASE WHEN p.side = 'YES' THEN p.user_id END) as yes_participants,
  COUNT(DISTINCT CASE WHEN p.side = 'NO' THEN p.user_id END) as no_participants
FROM challenges c
LEFT JOIN pair_queue p ON c.id = p.challenge_id
WHERE c.on_chain_status = 'active' OR c.status = 'pending_admin_resolution'
GROUP BY c.id
ORDER BY c.created_at DESC;
*/

-- User points summary
CREATE OR REPLACE VIEW v_user_points_summary AS
SELECT 
  u.id as user_id,
  u.username,
  COALESCE(upl.points_balance, 0) as current_points,
  COALESCE(upl.total_points_earned, 0) as total_earned,
  COALESCE(upl.total_points_burned, 0) as total_burned,
  COALESCE(upl.points_locked_in_escrow, 0) as locked_points,
  COUNT(DISTINCT pt.id) as transaction_count,
  upl.last_updated_at
FROM users u
LEFT JOIN user_points_ledgers upl ON u.id = upl.user_id
LEFT JOIN points_transactions pt ON u.id = pt.user_id
GROUP BY u.id, upl.id
ORDER BY COALESCE(upl.points_balance, 0) DESC;

-- Blockchain transaction summary
CREATE OR REPLACE VIEW v_blockchain_tx_summary AS
SELECT 
  chain_id,
  transaction_type,
  status,
  COUNT(*) as tx_count,
  SUM(gas_used) as total_gas,
  SUM(value_transferred) as total_value,
  MAX(submitted_at) as last_transaction
FROM blockchain_transactions
GROUP BY chain_id, transaction_type, status
ORDER BY last_transaction DESC;

-- ============================================================================
-- 10. Create Stored Procedures for Common Operations
-- ============================================================================

-- Update user points balance from transaction history
CREATE OR REPLACE FUNCTION update_user_points_balance(p_user_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  UPDATE user_points_ledgers upl
  SET 
    points_balance = (
      SELECT 
        COALESCE(SUM(CASE 
          WHEN pt.transaction_type IN ('earned_challenge', 'released_escrow', 'transferred_escrow', 'transferred_user')
          THEN pt.amount
          WHEN pt.transaction_type IN ('burned_usage', 'locked_escrow')
          THEN -pt.amount
          ELSE 0
        END), 0)
      FROM points_transactions pt
      WHERE pt.user_id = p_user_id
    ),
    total_points_earned = (
      SELECT COALESCE(SUM(amount), 0)
      FROM points_transactions
      WHERE user_id = p_user_id AND transaction_type = 'earned_challenge'
    ),
    total_points_burned = (
      SELECT COALESCE(SUM(amount), 0)
      FROM points_transactions
      WHERE user_id = p_user_id AND transaction_type = 'burned_usage'
    ),
    last_updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Initialize user points ledger if not exists
CREATE OR REPLACE FUNCTION ensure_user_points_ledger(p_user_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_points_ledgers (user_id, points_balance, last_updated_at)
  VALUES (p_user_id, 0, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. Grant Permissions (if needed)
-- ============================================================================

-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO bantah_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bantah_user;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Run this migration with: psql -U postgres -d bantah < migrations/phase3.sql
-- After migration, run: SELECT * FROM v_challenges_pending_resolution;
