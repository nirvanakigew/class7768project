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
import multer from 'multer';
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

// Multer configuration for evidence file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5 // Maximum 5 files per submission
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types for evidence
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  }
});
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

/**
 * POST /api/challenges/:challengeId/accept-open
 * Accept an open P2P challenge (first user to join becomes opponent)
 * Calls blockchain: joinOpenP2PChallenge()
 */
router.post('/:challengeId/accept-open', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log(`\n⚔️ User ${userId} accepting open challenge ${challengeId}...`);

    // Get challenge from database
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, parseInt(challengeId)))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = dbChallenge[0];

    // Validate challenge is open and waiting for opponent
    if (challenge.status !== 'open') {
      return res.status(400).json({
        error: `Challenge is not open. Current status: ${challenge.status}`,
      });
    }

    if (challenge.challenged !== null) {
      return res.status(400).json({
        error: 'Challenge has already been accepted by someone else',
      });
    }

    // Validate user is not the creator
    if (challenge.challenger === userId) {
      return res.status(403).json({
        error: 'You cannot accept your own challenge',
      });
    }

    console.log(`✅ Challenge validation passed. Calling blockchain...`);

    // Step 1: Call blockchain to accept open challenge
    // This transfers acceptor's stake to escrow and activates the challenge
    const txResult = await acceptP2PChallenge(
      parseInt(challengeId),
      req.user as any
    );

    console.log(`✅ Blockchain transaction successful: ${txResult.transactionHash}`);

    // Step 2: Update database with acceptor info
    await db
      .update(challenges)
      .set({
        challenged: userId,
        status: 'active',
        acceptorTransactionHash: txResult.transactionHash,
      })
      .where(eq(challenges.id, parseInt(challengeId)));

    console.log(`✅ Database updated - challenge now ACTIVE`);

    // Step 3: Get the creator for notifications
    const creator = await db
      .select()
      .from(users)
      .where(eq(users.id, challenge.challenger!))
      .limit(1);

    const acceptor = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const creatorName = creator[0]?.firstName || 'Someone';
    const acceptorName = acceptor[0]?.firstName || 'Someone';

    // Step 4: Send notifications
    console.log(`📬 Sending notifications...`);

    // Notify creator that someone accepted their challenge
    await notificationService.sendNotification({
      userId: challenge.challenger!,
      event: NotificationEvent.NEW_CHALLENGE_ACCEPTED,
      title: '⚔️ Challenge Accepted!',
      message: `${acceptorName} accepted your challenge! The battle begins now.`,
      metadata: {
        challengeId: parseInt(challengeId),
        challengeTitle: challenge.title,
        acceptorId: userId,
        acceptorName: acceptorName,
        stakeAmount: challenge.amount,
      },
      channels: [NotificationChannel.PUSHER, NotificationChannel.FIREBASE],
      priority: NotificationPriority.HIGH,
    }).catch(err => {
      console.warn('⚠️ Notification to creator failed (non-blocking):', err.message);
    });

    // Notify acceptor that they joined the challenge
    await notificationService.sendNotification({
      userId: userId,
      event: NotificationEvent.NEW_CHALLENGE_ACCEPTED,
      title: '✓ Challenge Accepted!',
      message: `You've accepted ${creatorName}'s challenge! Stakes are now locked on-chain. May the best predictor win!`,
      metadata: {
        challengeId: parseInt(challengeId),
        challengeTitle: challenge.title,
        creatorId: challenge.challenger,
        creatorName: creatorName,
        stakeAmount: challenge.amount,
        totalPool: challenge.amount * 2,
      },
      channels: [NotificationChannel.PUSHER, NotificationChannel.FIREBASE],
      priority: NotificationPriority.HIGH,
    }).catch(err => {
      console.warn('⚠️ Notification to acceptor failed (non-blocking):', err.message);
    });

    console.log(`✅ Notifications sent successfully`);

    // Step 5: Return success response
    res.json({
      success: true,
      challengeId: parseInt(challengeId),
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      status: 'active',
      title: challenge.title,
      challenger: challenge.challenger,
      challenged: userId,
      stakeAmount: challenge.amount,
      totalPool: challenge.amount * 2,
      message: `Challenge accepted! Both stakes are now locked on-chain.`,
    });

  } catch (error: any) {
    console.error('❌ Failed to accept open challenge:', error);
    
    // Determine error type
    let errorMessage = error.message || 'Failed to accept challenge';
    let statusCode = 500;

    if (error.message?.includes('already accepted')) {
      errorMessage = 'This challenge has already been accepted by someone else';
      statusCode = 409;
    } else if (error.message?.includes('Challenge not open')) {
      errorMessage = 'This challenge is no longer open';
      statusCode = 400;
    } else if (error.message?.includes('insufficient')) {
      errorMessage = 'Insufficient USDC balance to accept this challenge';
      statusCode = 400;
    }

    res.status(statusCode).json({
      error: 'Challenge acceptance failed',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/challenges/:challengeId/evidence
 * Submit evidence for a P2P challenge
 * Users can submit proof to support their position before or after dispute
 */
router.post('/:challengeId/evidence', isAuthenticated, upload.array('files', 5), async (req: Request, res: Response) => {
  try {
    const { challengeId } = req.params;
    const userId = req.user?.id;
    const { description, type } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Evidence description is required' });
    }

    const id = parseInt(challengeId);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid challenge ID' });
    }

    console.log(`\n📸 User ${userId} submitting evidence for challenge ${id}...`);

    // Get challenge
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, id))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const challenge = dbChallenge[0];

    // Verify user is participant
    if (challenge.challenger !== userId && challenge.challenged !== userId) {
      return res.status(403).json({ error: 'You are not a participant in this challenge' });
    }

    // Challenge must be active or completed (can submit evidence before or after)
    if (!['active', 'completed', 'disputed'].includes(challenge.status)) {
      return res.status(400).json({
        error: 'Cannot submit evidence for this challenge',
        currentStatus: challenge.status,
      });
    }

    // Collect file data
    const files = req.files as Express.Multer.File[] | undefined;
    const fileCount = files ? files.length : 0;

    if (fileCount === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    if (fileCount > 5) {
      return res.status(400).json({ error: 'Maximum 5 files allowed' });
    }

    // Create evidence object
    const evidenceData = {
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
      description: description.trim(),
      type: type || 'p2p_evidence',
      files: files?.map((f) => ({
        originalName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        buffer: f.buffer.toString('base64'), // Store as base64
        fieldname: f.fieldname,
      })) || [],
    };

    // Update challenge with evidence
    await db
      .update(challenges)
      .set({
        evidence: evidenceData,
      })
      .where(eq(challenges.id, id));

    console.log(`✅ Evidence submitted for challenge ${id}`);
    console.log(`   Files: ${fileCount}`);
    console.log(`   Description: ${description.substring(0, 50)}...`);

    // Notify admins about evidence submission
    await notificationService
      .sendNotification({
        type: NotificationEvent.EVIDENCE_SUBMITTED,
        userId: 'admin', // Target admins
        title: `📸 Evidence Submitted - Challenge #${id}`,
        message: `${challenge.challengerUser?.firstName || challenge.challenger} submitted evidence for "${challenge.title}"`,
        data: {
          challengeId: id,
          submittedBy: userId,
          submittedByName: challenge.challenger === userId ? challenge.challengerUser?.firstName : challenge.challengedUser?.firstName,
          challengeTitle: challenge.title,
          fileCount,
        },
        channels: [NotificationChannel.PUSHER, NotificationChannel.FIREBASE],
        priority: NotificationPriority.HIGH,
      })
      .catch((err) => {
        console.warn('⚠️  Failed to notify admin about evidence submission:', err.message);
      });

    // Also notify the other participant
    const otherUserId = challenge.challenger === userId ? challenge.challenged : challenge.challenger;
    if (otherUserId) {
      await notificationService
        .sendNotification({
          type: NotificationEvent.CHALLENGE_UPDATE,
          userId: otherUserId,
          title: 'Evidence Submitted',
          message: 'Your opponent submitted evidence for this challenge. An admin will review it.',
          data: {
            challengeId: id,
            challengeTitle: challenge.title,
          },
          channels: [NotificationChannel.PUSHER],
          priority: NotificationPriority.MEDIUM,
        })
        .catch((err) => {
          console.warn('⚠️  Failed to notify other participant:', err.message);
        });
    }

    res.json({
      success: true,
      challengeId: id,
      message: 'Evidence submitted successfully',
      evidenceData: {
        submittedBy: userId,
        submittedAt: evidenceData.submittedAt,
        description: description.trim(),
        fileCount,
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to submit evidence:', error);
    res.status(500).json({
      error: 'Failed to submit evidence',
      message: error.message,
    });
  }
});

export default router;
