/**
 * Phase 4: API Routes - Points & Leaderboard
 * REST endpoints for points management and leaderboard queries
 */

import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { getBlockchainClient } from '../blockchain/client';
import {
  getUserPointsBalance,
  recordPointsTransaction,
  ensureUserPointsLedger,
  getUserPointsTransactionHistory,
  getPointsStatistics,
  updateUserPointsBalance,
  addUserWallet,
  getUserWallets,
  getUserPrimaryWallet,
  setPrimaryWallet,
  updateWalletBalances,
} from '../blockchain/db-utils';
import { userPointsLedgers } from '../../shared/schema-blockchain';
import { db } from '../db';
import { users } from '../../shared/schema';
import { desc, gt, eq } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/points/balance/:userId
 * Get user's current points balance including weekly claiming status
 * Returns:
 *   - balance: Raw balance (in wei, as string)
 *   - balanceFormatted: Human-readable balance (in BPTS)
 *   - lastClaimedAt: Timestamp of last weekly claim
 *   - canClaimThisWeek: Boolean indicating if user can claim now
 */
router.get('/balance/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Ensure ledger exists
    await ensureUserPointsLedger(userId);

    const balance = await getUserPointsBalance(userId);
    const ledger = await db
      .select()
      .from(userPointsLedgers)
      .where(eq(userPointsLedgers.userId, userId))
      .limit(1);

    res.json({
      userId,
      balance: balance.toString(),
      balanceFormatted: (Number(balance) / 1e18).toFixed(2),
      lastClaimedAt: ledger.length > 0 ? ledger[0].lastClaimedAt : null,
      ...(ledger.length > 0 ? ledger[0] : {}),
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get points balance',
      message: error.message,
    });
  }
});

/**
 * POST /api/points/transfer
 * Transfer points from one user to another
 * Only on-chain transfers are supported (for security)
 */
router.post('/transfer', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { recipientId, amount } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!recipientId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: recipientId, amount',
      });
    }

    if (userId === recipientId) {
      return res.status(400).json({
        error: 'Cannot transfer to yourself',
      });
    }

    console.log(`\n💸 User ${userId} transferring ${amount} points to ${recipientId}...`);

    // Ensure both users have ledgers
    await ensureUserPointsLedger(userId);
    await ensureUserPointsLedger(recipientId);

    // Check sender has enough balance
    const balance = await getUserPointsBalance(userId);
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e18));

    if (balance < amountBigInt) {
      return res.status(400).json({
        error: 'Insufficient points balance',
        balance: balance.toString(),
        requested: amountBigInt.toString(),
      });
    }

    // Log transactions
    await recordPointsTransaction({
      userId,
      transactionType: 'transferred_user',
      amount: amountBigInt,
      reason: `Transfer to ${recipientId}`,
    });

    await recordPointsTransaction({
      userId: recipientId,
      transactionType: 'transferred_user',
      amount: amountBigInt,
      reason: `Transfer from ${userId}`,
    });

    console.log(`✅ Points transferred: ${amount} BPTS`);

    res.json({
      success: true,
      from: userId,
      to: recipientId,
      amount: amount.toString(),
      message: 'Points transferred successfully',
    });
  } catch (error: any) {
    console.error('Failed to transfer points:', error);
    res.status(500).json({
      error: 'Failed to transfer points',
      message: error.message,
    });
  }
});

/**
 * GET /api/points/leaderboard
 * Get global points leaderboard
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { limit = 100, offset = 0, period = 'all' } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 100, 500);
    const offsetNum = parseInt(offset as string) || 0;

    // Query leaderboard from database
    const leaderboard = await db
      .select({
        rank: () => null, // Will be calculated
        userId: userPointsLedgers.userId,
        pointsBalance: userPointsLedgers.pointsBalance,
        totalEarned: userPointsLedgers.totalPointsEarned,
        username: users.username,
        profileImage: users.profileImageUrl,
      })
      .from(userPointsLedgers)
      .leftJoin(users, eq(userPointsLedgers.userId, users.id))
      .where(gt(userPointsLedgers.pointsBalance, 0))
      .orderBy(desc(userPointsLedgers.pointsBalance))
      .limit(limitNum)
      .offset(offsetNum);

    // Add rank
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry,
      rank: offsetNum + index + 1,
      pointsBalance: entry.pointsBalance?.toString(),
      totalEarned: entry.totalEarned?.toString(),
    }));

    // Get total unique players
    const totalPlayers = await db
      .select({ count: () => null })
      .from(userPointsLedgers)
      .where(gt(userPointsLedgers.pointsBalance, 0));

    res.json({
      leaderboard: rankedLeaderboard,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: totalPlayers.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get leaderboard',
      message: error.message,
    });
  }
});

/**
 * GET /api/points/leaderboard/:userId
 * Get user's leaderboard rank and stats
 */
router.get('/leaderboard/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get user's points
    const userPoints = await db
      .select()
      .from(userPointsLedgers)
      .where(eq(userPointsLedgers.userId, userId))
      .limit(1);

    if (!userPoints.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userPointsData = userPoints[0];

    // Count users ahead
    const usersAhead = await db
      .select({ count: () => null })
      .from(userPointsLedgers)
      .where(gt(userPointsLedgers.pointsBalance, userPointsData.pointsBalance || 0));

    const rank = usersAhead.length + 1;

    // Get user info
    const userInfo = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({
      userId,
      username: userInfo[0]?.username,
      rank,
      pointsBalance: userPointsData.pointsBalance?.toString(),
      totalEarned: userPointsData.totalPointsEarned?.toString(),
      totalBurned: userPointsData.totalPointsBurned?.toString(),
      lockedInEscrow: userPointsData.pointsLockedInEscrow?.toString(),
      lastUpdated: userPointsData.lastUpdatedAt,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get user rank',
      message: error.message,
    });
  }
});

/**
 * GET /api/points/history/:userId
 * Get user's points transaction history
 */
router.get('/history/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, type } = req.query;

    const history = await getUserPointsTransactionHistory(
      userId,
      parseInt(limit as string)
    );

    const filtered = type
      ? history.filter((tx) => tx.transactionType === type)
      : history;

    res.json({
      userId,
      transactions: filtered,
      total: filtered.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get transaction history',
      message: error.message,
    });
  }
});

/**
 * GET /api/points/statistics
 * Get global points statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await getPointsStatistics();

    res.json({
      ...stats,
      pointsInCirculation: stats.totalPointsInCirculation?.toString(),
      totalEarned: stats.totalPointsEarned?.toString(),
      totalBurned: stats.totalPointsBurned?.toString(),
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error.message,
    });
  }
});

/**
 * POST /api/points/connect-wallet
 * Connect blockchain wallet to user account
 */
router.post('/connect-wallet', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { walletAddress, walletType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    console.log(`\n🔗 Connecting wallet ${walletAddress} to user ${userId}...`);

    // Add wallet
    const wallet = await addUserWallet({
      userId,
      walletAddress,
      walletType: walletType || 'privy',
      chainId: 84532,
      isPrimary: true, // Default to primary
    });

    console.log(`✅ Wallet connected: ${wallet.id}`);

    res.json({
      success: true,
      walletId: wallet.id,
      walletAddress,
      isPrimary: wallet.isPrimary,
    });
  } catch (error: any) {
    console.error('Failed to connect wallet:', error);
    res.status(500).json({
      error: 'Failed to connect wallet',
      message: error.message,
    });
  }
});

/**
 * GET /api/points/wallets
 * Get user's connected wallets
 */
router.get('/wallets', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const wallets = await getUserWallets(userId);

    res.json({
      wallets: wallets.map((w) => ({
        id: w.id,
        address: w.walletAddress,
        type: w.walletType,
        isPrimary: w.isPrimary,
        usdcBalance: w.usdcBalance?.toString(),
        pointsBalance: w.pointsBalance?.toString(),
        connectedAt: w.connectedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get wallets',
      message: error.message,
    });
  }
});

/**
 * POST /api/points/set-primary-wallet/:walletId
 * Set primary wallet for transactions
 */
router.post('/set-primary-wallet/:walletId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { walletId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const walletIdNum = parseInt(walletId);

    // Verify wallet belongs to user
    const primaryWallet = await getUserPrimaryWallet(userId);
    
    await setPrimaryWallet(walletIdNum, userId);

    res.json({
      success: true,
      message: 'Primary wallet updated',
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to set primary wallet',
      message: error.message,
    });
  }
});

export default router;
