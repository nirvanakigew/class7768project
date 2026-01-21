/**
 * User Account Routes
 * Handles FCM token storage and user settings
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, transactions } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * POST /api/user/fcm-token
 * Save FCM token for current user (for push notifications)
 */
router.post('/fcm-token', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid FCM token' });
    }

    // Update user's FCM token
    const updated = await db
      .update(users)
      .set({
        fcmToken: token,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    console.log(`✅ FCM token saved for user ${userId}`);

    res.json({
      success: true,
      message: 'FCM token saved',
      user: {
        id: updated[0].id,
        fcmTokenSet: !!updated[0].fcmToken,
      },
    });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    res.status(500).json({ error: 'Failed to save FCM token' });
  }
});

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRecord || userRecord.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userRecord[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profileImageUrl: user.profileImageUrl,
        level: user.level,
        xp: user.xp,
        points: user.points,
        balance: user.balance,
        followerCount: user.followerCount || 0,
        followingCount: user.followingCount || 0,
        fcmTokenSet: !!user.fcmToken,
        isTelegramUser: user.isTelegramUser,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/transactions
 * Get current user's transaction history (deposits, withdrawals, challenge earnings, etc.)
 */
router.get('/transactions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const limitNum = Math.min(parseInt(limit as string) || 50, 200);
    const offsetNum = parseInt(offset as string) || 0;

    // Fetch user's transactions ordered by most recent
    const userTransactions = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limitNum)
      .offset(offsetNum);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: () => null })
      .from(transactions)
      .where(eq(transactions.userId, userId));

    const total = totalResult.length || 0;

    // Format response
    const formattedTransactions = userTransactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      status: tx.status,
      createdAt: tx.createdAt,
      relatedId: tx.relatedId,
    }));

    res.json({
      transactions: formattedTransactions,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
      },
    });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error.message,
    });
  }
});

export default router;
