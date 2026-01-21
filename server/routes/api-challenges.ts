/**
 * Phase 4: API Routes - Challenge Operations
 * REST endpoints for challenge creation, joining, and management
 * 
 * Points Distribution (New System):
 * - Challenge Creation: 50 + (Amount × 5) = MAX 500 pts
 * - Challenge Joining: 10 + (Amount × 4) = MAX 500 pts
 * - Referral: 200 pts (one-time per user)
 * - Weekly claiming enabled
 */

import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { NotificationService, NotificationEvent, NotificationChannel, NotificationPriority } from '../notificationService';
import {
  createAdminChallenge,
  createP2PChallenge,
  joinAdminChallenge,
  acceptP2PChallenge,
  getChallenge,
  getChallengeParticipants,
  getUserLockedStakes,
  getTokenBalance,
  approveToken,
} from '../blockchain/helpers';
import {
  recordPointsTransaction,
  createEscrowRecord,
  recordContractDeployment,
  addUserWallet,
  getUserPrimaryWallet,
} from '../blockchain/db-utils';
import { calculateCreationPoints, calculateParticipationPoints } from '../utils/points-calculator';
import { notifyPointsEarnedParticipation, notifyPointsEarnedCreation } from '../utils/bantahPointsNotifications';
import { db } from '../db';
import { challenges, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();
const notificationService = new NotificationService();

/**
 * GET /api/challenges/public
 * Get all public challenges (no auth required)
 */
router.get('/public', async (req: Request, res: Response) => {
  try {
    const allChallenges = await db.select().from(challenges);
    
    // Filter public challenges (open status or completed)
    const publicChallenges = allChallenges.filter(c => 
      c.status === 'open' || c.status === 'active' || c.status === 'completed'
    );

    res.json(publicChallenges);
  } catch (error: any) {
    console.error('Error fetching public challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

/**
 * POST /api/challenges/create-admin
 * Create a new admin-created challenge (betting pool)
 */
router.post('/create-admin', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { stakeAmount, paymentToken, metadataURI, title, description, category } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!stakeAmount || !paymentToken || !metadataURI) {
      return res.status(400).json({
        error: 'Missing required fields: stakeAmount, paymentToken, metadataURI',
      });
    }

    // Validate token addresses (USDC or USDT on Base Sepolia)
    const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b3566dA8860';
    const USDT = '0x3c499c542cEF5E3811e1192ce70d8cC7d307B653';
    
    if (![USDC, USDT].includes(paymentToken.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid token. Must be USDC or USDT',
      });
    }

    console.log(`\n💾 Creating admin challenge from ${userId}...`);

    // Calculate creation points based on stake amount (50 + amount × 5, MAX 500)
    const stakeAmountUSD = parseInt(stakeAmount); // USDC/USDT amounts are in USD equivalent
    const creationPoints = Math.min(50 + (stakeAmountUSD * 5), 500);
    console.log(`🎁 Challenge creator will earn ${creationPoints} Bantah Points`);

    // Create challenge in database first
    const dbChallenge = await db
      .insert(challenges)
      .values({
        title,
        description,
        category: category || 'general',
        amount: parseInt(stakeAmount) * 2, // Display both sides
        status: 'pending',
        adminCreated: true,
        challenger: userId,
        paymentTokenAddress: paymentToken,
        stakeAmountWei: BigInt(stakeAmount + '000000'), // 6 decimals for USDC/USDT
        onChainStatus: 'pending',
        pointsAwarded: creationPoints, // Store creation points for winner to earn
      })
      .returning();

    const challengeId = dbChallenge[0].id;
    console.log(`📋 Challenge created in DB with ID: ${challengeId}`);

    // Create on-chain
    console.log(`⛓️  Creating on-chain...`);
    const txResult = await createAdminChallenge(
      stakeAmount,
      paymentToken,
      metadataURI
    );

    // Update database with blockchain info
    await db
      .update(challenges)
      .set({
        blockchainCreationTxHash: txResult.transactionHash,
        blockchainBlockNumber: txResult.blockNumber,
        onChainStatus: 'active',
        onChainResolved: false,
      })
      .where(eq(challenges.id, challengeId));

    console.log(`✅ Admin challenge created: ${txResult.transactionHash}`);

    res.json({
      success: true,
      challengeId,
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      title,
      stakeAmount,
      paymentToken,
    });
  } catch (error: any) {
    console.error('Failed to create admin challenge:', error);
    res.status(500).json({
      error: 'Failed to create challenge',
      message: error.message,
    });
  }
});

/**
 * POST /api/challenges/create-p2p
 * Create a P2P challenge between two users
 * Note: User must sign the blockchain transaction client-side with their wallet
 */
router.post('/create-p2p', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { opponentId, stakeAmount, paymentToken, metadataURI, title, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!opponentId || !stakeAmount || !paymentToken) {
      return res.status(400).json({
        error: 'Missing required fields: opponentId, stakeAmount, paymentToken',
      });
    }

    if (userId === opponentId) {
      return res.status(400).json({
        error: 'Cannot challenge yourself',
      });
    }

    console.log(`\n💾 Creating P2P challenge: ${userId} vs ${opponentId}...`);

    // Calculate creation points based on stake amount (50 + amount × 5, MAX 500)
    const stakeAmountUSD = parseInt(stakeAmount); // USDC/USDT amounts are in USD equivalent
    const creationPoints = Math.min(50 + (stakeAmountUSD * 5), 500);
    console.log(`🎁 Challenge creator will earn ${creationPoints} Bantah Points`);

    // Create in database with pending blockchain status
    // User will sign and submit transaction client-side
    const dbChallenge = await db
      .insert(challenges)
      .values({
        title,
        description,
        category: 'p2p',
        amount: parseInt(stakeAmount) * 2,
        status: 'pending',
        adminCreated: false,
        challenger: userId,
        challenged: opponentId,
        paymentTokenAddress: paymentToken,
        stakeAmountWei: BigInt(ethers.parseUnits(stakeAmount, 6).toString()),
        onChainStatus: 'pending', // Waiting for user to sign and submit
        pointsAwarded: creationPoints, // Store creation points for winner to earn
      })
      .returning();

    const challengeId = dbChallenge[0].id;

    console.log(`✅ P2P challenge created in DB: ${challengeId}`);
    console.log(`📝 User must sign transaction client-side to complete`);

    // Get challenger name for notification
    const challenger = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const challengerName = challenger[0]?.firstName || 'Someone';

    // Send notification to opponent
    await notificationService.send({
      userId: opponentId,
      challengeId: challengeId.toString(),
      event: NotificationEvent.CHALLENGE_CREATED,
      title: `🎯 ${challengerName} challenged you!`,
      body: `${challengerName} challenged you to: "${title}"`,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      priority: NotificationPriority.MEDIUM,
      data: {
        challengeId: challengeId,
        title,
        stakeAmount,
        challenger: userId,
      },
    }).catch(err => {
      console.warn('Failed to send challenge notification:', err.message);
      // Don't fail the challenge creation if notification fails
    });

    console.log(`📬 Notification sent to opponent ${opponentId}`);

    res.json({
      success: true,
      challengeId,
      title,
      opponent: opponentId,
      stakeAmount,
      message: 'Challenge created. User must sign transaction to activate.',
    });
  } catch (error: any) {
    console.error('Failed to create P2P challenge:', error);
    res.status(500).json({
      error: 'Failed to create P2P challenge',
      message: error.message,
    });
  }
});

/**
 * POST /api/challenges/:id/join
 * Join an admin challenge (choose YES or NO side)
 */
router.post('/:id/join', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { side } = req.body; // true for YES, false for NO
    const challengeId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (side === undefined) {
      return res.status(400).json({
        error: 'Missing required field: side (true for YES, false for NO)',
      });
    }

    console.log(`\n🔗 User ${userId} joining challenge ${challengeId} on side ${side ? 'YES' : 'NO'}...`);

    // Get challenge
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = dbChallenge[0];

    // Calculate participation points based on stake amount (10 + amount × 4, MAX 500)
    const stakeAmountUSD = challenge.stakeAmountWei ? Number(challenge.stakeAmountWei) / 1e6 : 0; // Convert from wei to USD
    const participationPoints = Math.min(10 + (stakeAmountUSD * 4), 500);
    console.log(`🎁 Challenge participant will earn ${participationPoints} Bantah Points`);

    // Get on-chain challenge
    const onChainChallenge = await getChallenge(challengeId);

    // Join on-chain
    const txResult = await joinAdminChallenge(
      challengeId,
      side,
      req.user as any
    );

    // Record escrow
    if (challenge.stakeAmountWei) {
      await createEscrowRecord({
        challengeId,
        userId,
        tokenAddress: challenge.paymentTokenAddress!,
        amountEscrowed: challenge.stakeAmountWei,
        status: 'locked',
        side: side ? 'YES' : 'NO',
        lockTxHash: txResult.transactionHash,
      });
    }

    // Award participation points to the joining user
    try {
      const pointsInWei = BigInt(Math.floor(participationPoints * 1e18));
      await recordPointsTransaction({
        userId,
        challengeId,
        transactionType: 'challenge_joined',
        amount: pointsInWei,
        reason: `Participated in challenge #${challengeId}`,
        blockchainTxHash: txResult.transactionHash,
      });
      console.log(`✅ Awarded ${participationPoints} points to user ${userId} for joining challenge`);
      
      // Send notification
      await notifyPointsEarnedParticipation(
        userId,
        challengeId,
        participationPoints,
        challenge.title || `Challenge #${challengeId}`
      ).catch(err => console.error('Failed to send participation points notification:', err));
    } catch (pointsError) {
      console.error('Failed to record participation points:', pointsError);
      // Don't fail the entire request if points recording fails
    }

    console.log(`✅ User joined challenge: ${txResult.transactionHash}`);

    res.json({
      success: true,
      challengeId,
      transactionHash: txResult.transactionHash,
      side: side ? 'YES' : 'NO',
    });
  } catch (error: any) {
    console.error('Failed to join challenge:', error);
    res.status(500).json({
      error: 'Failed to join challenge',
      message: error.message,
    });
  }
});

/**
 * POST /api/challenges/:id/accept
 * Accept a P2P challenge (as the challenged user)
 */
router.post('/:id/accept', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log(`\n🤝 User ${userId} accepting P2P challenge ${challengeId}...`);

    // Get challenge
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = dbChallenge[0];

    if (challenge.challenged !== userId) {
      return res.status(403).json({
        error: 'Not the challenged user',
      });
    }

    // Accept on-chain
    const txResult = await acceptP2PChallenge(challengeId, req.user as any);

    // Record escrow
    if (challenge.stakeAmountWei) {
      await createEscrowRecord({
        challengeId,
        userId,
        tokenAddress: challenge.paymentTokenAddress!,
        amountEscrowed: challenge.stakeAmountWei,
        status: 'locked',
        side: 'CHALLENGER', // They're the acceptor
        lockTxHash: txResult.transactionHash,
      });
    }

    // Update challenge
    await db
      .update(challenges)
      .set({
        status: 'active',
        onChainStatus: 'active',
      })
      .where(eq(challenges.id, challengeId));

    console.log(`✅ P2P challenge accepted: ${txResult.transactionHash}`);

    // Get acceptor name for notification
    const acceptor = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const acceptorName = acceptor[0]?.firstName || 'Someone';

    // Send notification to challenger that their challenge was accepted
    if (challenge.challenger) {
      await notificationService.send({
        userId: challenge.challenger,
        challengeId: challengeId.toString(),
        event: NotificationEvent.CHALLENGE_JOINED_FRIEND,
        title: `⚔️ ${acceptorName} accepted your challenge!`,
        body: `${acceptorName} accepted your challenge: "${challenge.title}"`,
        channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
        priority: NotificationPriority.MEDIUM,
        data: {
          challengeId: challengeId,
          title: challenge.title,
          acceptor: userId,
        },
      }).catch(err => {
        console.warn('Failed to send acceptance notification:', err.message);
        // Don't fail the challenge acceptance if notification fails
      });

      console.log(`📬 Notification sent to challenger ${challenge.challenger}`);
    }

    res.json({
      success: true,
      challengeId,
      transactionHash: txResult.transactionHash,
    });
  } catch (error: any) {
    console.error('Failed to accept challenge:', error);
    res.status(500).json({
      error: 'Failed to accept challenge',
      message: error.message,
    });
  }
});

/**
 * GET /api/challenges/:id
 * Get challenge details with on-chain data
 */
router.get('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const challengeId = parseInt(req.params.id);

    // Get from database
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = dbChallenge[0];

    // Get on-chain data
    let onChainData = null;
    let participants = null;

    try {
      onChainData = await getChallenge(challengeId);
      participants = await getChallengeParticipants(challengeId);
    } catch (error) {
      console.warn('Could not fetch on-chain data:', error);
    }

    res.json({
      ...challenge,
      onChainData,
      participants,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get challenge',
      message: error.message,
    });
  }
});

/**
 * GET /api/challenges
 * List challenges with filters
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { status, adminCreated, limit = 50, offset = 0 } = req.query;

    let query = db.select().from(challenges);

    if (status) {
      query = query.where(eq(challenges.status, status as string));
    }

    if (adminCreated !== undefined) {
      query = query.where(eq(challenges.adminCreated, adminCreated === 'true'));
    }

    const result = await query
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({
      challenges: result,
      total: result.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to list challenges',
      message: error.message,
    });
  }
});

/**
 * GET /api/challenges/user/:userId
 * Get user's challenges
 */
router.get('/user/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const userChallenges = await db
      .select()
      .from(challenges)
      .where(
        // Challenges where user is challenger or challenged
        db.raw(
          `(challenger = $1 OR challenged = $1)`
        )
      )
      .orderBy(challenges.createdAt);

    res.json({
      challenges: userChallenges,
      total: userChallenges.length,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get user challenges',
      message: error.message,
    });
  }
});

export default router;
