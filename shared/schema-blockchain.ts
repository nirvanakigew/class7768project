/**
 * Phase 3: Database Schema Migrations
 * 
 * This file defines new tables and columns needed for on-chain challenge management
 * Run migrations after Phase 2 is complete
 */

import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  bigint,
  decimal,
  boolean,
  index,
  uuid,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// BLOCKCHAIN CHALLENGE FIELDS (Added to existing challenges table)
// ============================================================================
// These fields should be added via migration to the existing challenges table:
//
// -- Blockchain Settlement
// ALTER TABLE challenges ADD COLUMN blockchain_chain_id INT;
// ALTER TABLE challenges ADD COLUMN blockchain_contract_address VARCHAR;
// ALTER TABLE challenges ADD COLUMN blockchain_creation_tx_hash VARCHAR UNIQUE;
// ALTER TABLE challenges ADD COLUMN blockchain_resolution_tx_hash VARCHAR;
// ALTER TABLE challenges ADD COLUMN blockchain_payout_tx_hash VARCHAR;
// ALTER TABLE challenges ADD COLUMN blockchain_settlement_tx_hash VARCHAR;
// ALTER TABLE challenges ADD COLUMN blockchain_block_number INT;
// ALTER TABLE challenges ADD COLUMN blockchain_settlement_block_number INT;
//
// -- Token & Amount
// ALTER TABLE challenges ADD COLUMN payment_token_address VARCHAR;
// ALTER TABLE challenges ADD COLUMN stake_amount_wei BIGINT;
// ALTER TABLE challenges ADD COLUMN points_awarded INT DEFAULT 0;
// ALTER TABLE challenges ADD COLUMN points_multiplier DECIMAL(3, 2) DEFAULT 1.00;
//
// -- Resolution & Status
// ALTER TABLE challenges ADD COLUMN admin_signature VARCHAR;
// ALTER TABLE challenges ADD COLUMN on_chain_status VARCHAR DEFAULT 'pending';
// -- on_chain_status: pending, active, resolved, claimed, failed
// ALTER TABLE challenges ADD COLUMN on_chain_resolved BOOLEAN DEFAULT FALSE;
// ALTER TABLE challenges ADD COLUMN resolution_timestamp TIMESTAMP;
// ALTER TABLE challenges ADD COLUMN on_chain_metadata JSONB;
//
// CREATE INDEX idx_challenges_blockchain_status ON challenges(on_chain_status);
// CREATE INDEX idx_challenges_payment_token ON challenges(payment_token_address);
// ============================================================================

// ============================================================================
// NEW TABLES FOR ON-CHAIN SYSTEM
// ============================================================================

/**
 * User Points Ledger
 * Tracks total points, earned points, burned points, and locked points for each user
 */
export const userPointsLedgers = pgTable(
  "user_points_ledgers",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    pointsBalance: bigint("points_balance", { mode: "number" }).default(0),
    totalPointsEarned: bigint("total_points_earned", { mode: "number" }).default(0),
    totalPointsBurned: bigint("total_points_burned", { mode: "number" }).default(0),
    pointsLockedInEscrow: bigint("points_locked_in_escrow", { mode: "number" }).default(0),
    // Weekly Claiming System
    lastClaimedAt: timestamp("last_claimed_at"), // Last timestamp when user claimed points
    chainSyncedAt: timestamp("chain_synced_at"),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("unique_user_points_ledger").on(table.userId),
    index("idx_user_points_balance").on(table.userId),
    index("idx_user_points_synced").on(table.chainSyncedAt),
  ]
);

export type UserPointsLedger = typeof userPointsLedgers.$inferSelect;
export type InsertUserPointsLedger = typeof userPointsLedgers.$inferInsert;

/**
 * Points Transactions
 * Detailed log of every points movement (earned, burned, transferred, locked, released)
 */
export const pointsTransactions = pgTable(
  "points_transactions",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    challengeId: integer("challenge_id"),
    transactionType: varchar("transaction_type").notNull(),
    // Types: earned_challenge, burned_usage, transferred_user, locked_escrow, released_escrow, transferred_escrow
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: text("reason"), // Human-readable description
    blockchainTxHash: varchar("blockchain_tx_hash"), // On-chain transaction hash
    blockNumber: integer("block_number"),
    chainId: integer("chain_id").default(84532), // Base Testnet Sepolia
    metadata: text("metadata"), // JSON additional data
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_points_user_id").on(table.userId),
    index("idx_points_challenge_id").on(table.challengeId),
    index("idx_points_tx_type").on(table.transactionType),
    index("idx_points_tx_hash").on(table.blockchainTxHash),
    index("idx_points_created_at").on(table.createdAt),
  ]
);

export type PointsTransaction = typeof pointsTransactions.$inferSelect;
export type InsertPointsTransaction = typeof pointsTransactions.$inferInsert;

/**
 * Blockchain Transactions
 * Comprehensive log of all blockchain interactions (deployments, resolutions, payouts, etc)
 */
export const blockchainTransactions = pgTable(
  "blockchain_transactions",
  {
    id: serial("id").primaryKey(),
    chainId: integer("chain_id").notNull().default(84532),
    transactionHash: varchar("transaction_hash").notNull().unique(),
    blockNumber: integer("block_number"),
    transactionType: varchar("transaction_type").notNull(),
    // Types: challenge_create, challenge_accept, challenge_resolve, payout_claim, points_award, approval
    contractAddress: varchar("contract_address").notNull(),
    contractName: varchar("contract_name"), // BantahPoints, ChallengeFactory, PointsEscrow
    fromAddress: varchar("from_address").notNull(),
    toAddress: varchar("to_address"),
    functionName: varchar("function_name"),
    parameters: text("parameters"), // JSON encoded function parameters
    
    // Results & Status
    status: varchar("status").notNull(), // pending, success, failed
    gasUsed: bigint("gas_used", { mode: "number" }),
    gasPrice: bigint("gas_price", { mode: "number" }),
    transactionFee: decimal("transaction_fee", { precision: 18, scale: 6 }),
    valueTransferred: bigint("value_transferred", { mode: "number" }), // In wei
    
    // References
    challengeId: integer("challenge_id"),
    userId: varchar("user_id"),
    
    // Error tracking
    errorMessage: text("error_message"),
    
    // Metadata
    metadata: text("metadata"), // JSON with additional context
    submittedAt: timestamp("submitted_at").defaultNow(),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_blockchain_tx_hash").on(table.transactionHash),
    index("idx_blockchain_type").on(table.transactionType),
    index("idx_blockchain_status").on(table.status),
    index("idx_blockchain_challenge_id").on(table.challengeId),
    index("idx_blockchain_user_id").on(table.userId),
    index("idx_blockchain_block_number").on(table.blockNumber),
    index("idx_blockchain_submitted_at").on(table.submittedAt),
    index("idx_blockchain_contract").on(table.contractAddress),
  ]
);

export type BlockchainTransaction = typeof blockchainTransactions.$inferSelect;
export type InsertBlockchainTransaction = typeof blockchainTransactions.$inferInsert;

/**
 * Challenge Escrow Records
 * Tracks USDC/USDT locked in smart contracts during challenges
 */
export const challengeEscrowRecords = pgTable(
  "challenge_escrow_records",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").notNull(),
    userId: varchar("user_id").notNull(),
    tokenAddress: varchar("token_address").notNull(), // USDC or USDT
    chainId: integer("chain_id").default(84532),
    
    // Escrow amounts
    amountEscrowed: bigint("amount_escrowed", { mode: "number" }).notNull(),
    amountReleased: bigint("amount_released", { mode: "number" }).default(0),
    amountClaimed: bigint("amount_claimed", { mode: "number" }).default(0),
    
    // Status
    status: varchar("status").notNull(), // locked, released, claimed
    side: varchar("side"), // YES or NO for admin challenges
    
    // Blockchain references
    lockTxHash: varchar("lock_tx_hash"),
    releaseTxHash: varchar("release_tx_hash"),
    claimTxHash: varchar("claim_tx_hash"),
    
    // Timestamps
    lockedAt: timestamp("locked_at").defaultNow(),
    releasedAt: timestamp("released_at"),
    claimedAt: timestamp("claimed_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_escrow_challenge_id").on(table.challengeId),
    index("idx_escrow_user_id").on(table.userId),
    index("idx_escrow_status").on(table.status),
    index("idx_escrow_token").on(table.tokenAddress),
  ]
);

export type ChallengeEscrowRecord = typeof challengeEscrowRecords.$inferSelect;
export type InsertChallengeEscrowRecord = typeof challengeEscrowRecords.$inferInsert;

/**
 * Smart Contract Deployments
 * Track all contract deployments for audit trail and upgrades
 */
export const contractDeployments = pgTable(
  "contract_deployments",
  {
    id: serial("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    contractName: varchar("contract_name").notNull(),
    // Names: BantahPoints, ChallengeFactory, PointsEscrow
    contractAddress: varchar("contract_address").notNull(),
    contractVersion: varchar("contract_version").notNull(), // e.g., "1.0.0"
    deploymentTxHash: varchar("deployment_tx_hash").notNull(),
    deployerAddress: varchar("deployer_address").notNull(),
    blockNumber: integer("block_number").notNull(),
    
    // Contract configuration
    constructorArgs: text("constructor_args"), // JSON
    compiledBytecode: text("compiled_bytecode"),
    abiHash: varchar("abi_hash"), // For verification
    
    // Status
    isActive: boolean("is_active").default(true),
    
    // Metadata
    deployedAt: timestamp("deployed_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("unique_contract_deployment").on(table.chainId, table.contractName, table.contractAddress),
    index("idx_deployment_chain").on(table.chainId),
    index("idx_deployment_name").on(table.contractName),
  ]
);

export type ContractDeployment = typeof contractDeployments.$inferSelect;
export type InsertContractDeployment = typeof contractDeployments.$inferInsert;

/**
 * Admin Signatures Log
 * Audit trail of all admin signatures for challenge resolutions
 */
export const adminSignaturesLog = pgTable(
  "admin_signatures_log",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").notNull(),
    adminAddress: varchar("admin_address").notNull(),
    messageHash: varchar("message_hash").notNull(),
    signature: text("signature").notNull(),
    
    // Signature details
    winner: varchar("winner"),
    pointsAwarded: integer("points_awarded"),
    
    // Verification
    isVerified: boolean("is_verified").default(false),
    verificationError: text("verification_error"),
    
    // On-chain submission
    submittedTxHash: varchar("submitted_tx_hash"),
    submittedBlockNumber: integer("submitted_block_number"),
    
    // Timestamps
    signedAt: timestamp("signed_at").defaultNow(),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_signatures_challenge_id").on(table.challengeId),
    index("idx_signatures_admin_address").on(table.adminAddress),
    index("idx_signatures_verified").on(table.isVerified),
  ]
);

export type AdminSignaturesLog = typeof adminSignaturesLog.$inferSelect;
export type InsertAdminSignaturesLog = typeof adminSignaturesLog.$inferInsert;

/**
 * User Wallet Addresses
 * Maps Bantah users to their blockchain wallet addresses
 */
export const userWalletAddresses = pgTable(
  "user_wallet_addresses",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    chainId: integer("chain_id").notNull().default(84532),
    walletAddress: varchar("wallet_address").notNull(),
    walletType: varchar("wallet_type").notNull(), // privy, metamask, coinbase
    
    // Wallet verification
    isVerified: boolean("is_verified").default(false),
    verificationTxHash: varchar("verification_tx_hash"),
    
    // Balances (cached)
    usdcBalance: bigint("usdc_balance", { mode: "number" }).default(0),
    usdtBalance: bigint("usdt_balance", { mode: "number" }).default(0),
    pointsBalance: bigint("points_balance", { mode: "number" }).default(0),
    nativeBalance: bigint("native_balance", { mode: "number" }).default(0), // ETH on Base
    
    // Primary wallet flag
    isPrimary: boolean("is_primary").default(false),
    
    // Timestamps
    lastBalanceSyncAt: timestamp("last_balance_sync_at"),
    connectedAt: timestamp("connected_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    unique("unique_user_wallet").on(table.userId, table.chainId, table.walletAddress),
    index("idx_wallet_address").on(table.walletAddress),
    index("idx_wallet_user_chain").on(table.userId, table.chainId),
  ]
);

export type UserWalletAddress = typeof userWalletAddresses.$inferSelect;
export type InsertUserWalletAddress = typeof userWalletAddresses.$inferInsert;

// ============================================================================
// RELATIONS
// ============================================================================

export const userPointsLedgersRelations = relations(userPointsLedgers, ({ many }) => ({
  pointsTransactions: many(pointsTransactions),
}));

export const pointsTransactionsRelations = relations(pointsTransactions, ({ one }) => ({
  userPointsLedger: one(userPointsLedgers, {
    fields: [pointsTransactions.userId],
    references: [userPointsLedgers.userId],
  }),
}));

export const blockchainTransactionsRelations = relations(blockchainTransactions, ({ one }) => ({
  challenge: one(() => ({} as any), {
    fields: [blockchainTransactions.challengeId],
    references: [(() => ({} as any)).id],
  }),
}));

export const challengeEscrowRecordsRelations = relations(challengeEscrowRecords, ({ one }) => ({
  userWallet: one(userWalletAddresses, {
    fields: [challengeEscrowRecords.userId],
    references: [userWalletAddresses.userId],
  }),
}));

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const insertUserPointsLedgerSchema = createInsertSchema(userPointsLedgers).omit({
  id: true,
  createdAt: true,
  lastUpdatedAt: true,
});

export const insertPointsTransactionSchema = createInsertSchema(pointsTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertBlockchainTransactionSchema = createInsertSchema(blockchainTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertChallengeEscrowRecordSchema = createInsertSchema(challengeEscrowRecords).omit({
  id: true,
  createdAt: true,
});

export const insertContractDeploymentSchema = createInsertSchema(contractDeployments).omit({
  id: true,
  createdAt: true,
});

export const insertAdminSignaturesLogSchema = createInsertSchema(adminSignaturesLog).omit({
  id: true,
  createdAt: true,
});

export const insertUserWalletAddressSchema = createInsertSchema(userWalletAddresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
