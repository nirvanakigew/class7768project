/**
 * Phase 4: API Routes - Admin Challenge Resolution
 * REST endpoints for admin to resolve challenges and sign transactions
 * 
 * Points Distribution (New System):
 * - Challenge Win: Determined by creator at creation time
 * - Points awarded on chain via BantahPoints ERC-20 contract
 * - Weekly claiming enabled on wallet page
 */

import { Router, Request, Response } from 'express';
import { adminAuth } from '../adminAuth';
import {
  resolveChallengeOnChain,
  batchSignChallenges,
  getSigningStats,
} from '../blockchain/signing';
import {
  recordPointsTransaction,
  logBlockchainTransaction,
  logAdminSignature,
  updateSignatureVerification,
} from '../blockchain/db-utils';
import { notifyPointsEarnedWin } from '../utils/bantahPointsNotifications';
import { db } from '../db';
import { challenges } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/admin/challenges/:id/result
 * Resolve a challenge ON-CHAIN with blockchain settlement
 * Handles both P2P and Admin-created challenges via smart contract
 * 
 * For admin-created challenges: Resolves to YES or NO side winner
 * For P2P challenges: Resolves to specific winner with payout signature
 */
router.post('/:id/result', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { result, reason } = req.body;
    const challengeId = parseInt(id);

    if (!result) {
      return res.status(400).json({ error: 'Result required' });
    }

    console.log(`\n⛓️  Admin resolving challenge ${challengeId} on-chain: ${result}`);

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

    // Check if already resolved
    if (challenge.onChainStatus === 'resolved') {
      return res.status(400).json({
        error: 'Challenge already resolved on-chain',
      });
    }

    // Validate result based on challenge type
    let winner: string | null = null;

    if (challenge.adminCreated) {
      // Admin-created challenges: YES/NO results → determine actual winner
      if (!['yes_won', 'no_won', 'draw'].includes(result)) {
        return res.status(400).json({
          error: 'Invalid result for admin challenge. Must be: yes_won, no_won, or draw',
        });
      }
      
      if (result === 'draw') {
        console.log(`📍 Draw on admin challenge - refunding all participants`);
        // For draws, we don't have a single winner - handled separately
        winner = null;
      } else {
        // In real system, would need to distribute to all YES/NO stakers
        // For now, mark as draw since we need per-user settlement
        console.log(`📍 Admin challenge result: ${result} - requires per-user settlement`);
        winner = null;
      }
    } else {
      // P2P challenges: Direct winner assignment
      if (!['challenger_won', 'challenged_won', 'draw'].includes(result)) {
        return res.status(400).json({
          error: 'Invalid result for P2P challenge. Must be: challenger_won, challenged_won, or draw',
        });
      }

      if (result === 'draw') {
        winner = null;
      } else if (result === 'challenger_won') {
        winner = challenge.challenger;
      } else {
        winner = challenge.challenged;
      }
    }

    // Resolve on blockchain
    console.log(`📝 Signing resolution on blockchain...`);
    
    let txResult;
    let pointsAwarded = 0;

    if (winner) {
      // Winner exists - award points and sign resolution
      // Calculate points: 50 + (amount × 5), MAX 500
      const amount = parseInt(challenge.amount as any) || 0;
      pointsAwarded = Math.min(50 + (amount * 5), 500);

      txResult = await resolveChallengeOnChain({
        challengeId,
        winner,
        pointsAwarded,
      });

      console.log(`📊 Awarding ${pointsAwarded} BPTS to ${winner}`);

      // Record points transaction
      await recordPointsTransaction({
        userId: winner,
        challengeId,
        transactionType: 'earned_challenge',
        amount: BigInt(Math.floor(pointsAwarded * 1e18)),
        reason: reason || `Challenge ${challengeId} victory`,
        blockchainTxHash: txResult.transactionHash,
      });

      // Send win notification
      await notifyPointsEarnedWin(
        winner,
        challengeId,
        pointsAwarded,
        challenge.title || `Challenge #${challengeId}`
      ).catch(err => console.error('Notification failed:', err));
    } else {
      // Draw or multi-winner scenario - mark as completed without individual winner
      console.log(`🤝 Processing draw/multi-winner scenario on-chain`);
      
      // For draws, sign a special "draw" resolution
      txResult = await resolveChallengeOnChain({
        challengeId,
        winner: '0x0000000000000000000000000000000000000000', // Null address for draw
        pointsAwarded: 0,
      });
    }

    // Update database with blockchain resolution
    console.log(`💾 Updating challenge status...`);
    await db
      .update(challenges)
      .set({
        result,
        status: 'completed',
        onChainStatus: 'resolved',
        onChainResolved: true,
        blockchainResolutionTxHash: txResult.transactionHash,
        resolutionTimestamp: new Date(),
        completedAt: new Date(),
      })
      .where(eq(challenges.id, challengeId));

    // Log blockchain transaction
    await logBlockchainTransaction({
      chainId: 84532,
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      transactionType: 'challenge_resolve',
      contractAddress: challenge.blockchainContractAddress || '',
      contractName: 'ChallengeFactory',
      fromAddress: challenge.blockchainContractAddress || '',
      toAddress: winner || '0x0000000000000000000000000000000000000000',
      functionName: 'resolveChallenge',
      parameters: JSON.stringify({
        challengeId,
        winner,
        result,
        pointsAwarded,
      }),
      status: 'success',
      gasUsed: BigInt(txResult.gasUsed || 0),
      challengeId,
    });

    console.log(`✅ Challenge resolved on-chain! TX: ${txResult.transactionHash}`);

    res.json({
      success: true,
      message: 'Challenge resolved on-chain',
      challengeId,
      result,
      winner: winner || null,
      pointsAwarded,
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      chainId: 84532,
    });
  } catch (error: any) {
    console.error('❌ Failed to resolve challenge:', error);
    res.status(500).json({
      error: 'Failed to resolve challenge on-chain',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/challenges/resolve
 * Resolve a single challenge on-chain
 * Admin signs with private key to authorize winner and points
 * 
 * If pointsAwarded is not provided, uses the points calculated at challenge creation
 * (based on stake amount: 50 + amount × 5, MAX 500)
 */
router.post('/resolve', adminAuth, async (req: Request, res: Response) => {
  try {
    const { challengeId, winner, pointsAwarded, reason } = req.body;

    if (!challengeId || !winner) {
      return res.status(400).json({
        error: 'Missing required fields: challengeId, winner',
      });
    }

    console.log(`\n👨‍⚖️  Admin resolving challenge ${challengeId}...`);
    console.log(`   Winner: ${winner}`);

    // Get challenge
    const dbChallenge = await db
      .select()
      .from(challenges)
      .where(eq(challenges.id, challengeId))
      .limit(1);

    if (!dbChallenge.length) {
      return res.status(404).json({
        error: `Challenge ${challengeId} not found in database`,
      });
    }

    const challenge = dbChallenge[0];

    // Use provided pointsAwarded or fall back to challenge's pointsAwarded
    const finalPointsAwarded = pointsAwarded !== undefined ? pointsAwarded : (challenge.pointsAwarded || 0);
    
    if (finalPointsAwarded < 0) {
      return res.status(400).json({
        error: 'Points awarded must be non-negative',
      });
    }

    console.log(`   Points: ${finalPointsAwarded} BPTS`);

    // Verify challenge can be resolved
    if (challenge.onChainStatus === 'resolved') {
      return res.status(400).json({
        error: 'Challenge already resolved',
      });
    }

    // Step 1: Sign resolution
    console.log(`📝 Signing resolution...`);
    const signResult = await resolveChallengeOnChain({
      challengeId,
      winner,
      pointsAwarded: finalPointsAwarded,
    });

    // Step 2: Update database
    console.log(`💾 Updating database...`);
    await db
      .update(challenges)
      .set({
        status: 'resolved',
        onChainStatus: 'resolved',
        onChainResolved: true,
        blockchainResolutionTxHash: signResult.transactionHash,
        resolutionTimestamp: new Date(),
      })
      .where(eq(challenges.id, challengeId));

    // Step 3: Record points transaction
    console.log(`📊 Recording points award...`);
    await recordPointsTransaction({
      userId: winner,
      challengeId,
      transactionType: 'earned_challenge',
      amount: BigInt(Math.floor(finalPointsAwarded * 1e18)), // Convert to wei
      reason: reason || `Challenge ${challengeId} win`,
      blockchainTxHash: signResult.transactionHash,
    });

    // Send win notification
    await notifyPointsEarnedWin(
      winner,
      challengeId,
      finalPointsAwarded,
      challenge.title || `Challenge #${challengeId}`
    ).catch(err => console.error('Failed to send win notification:', err));

    // Step 4: Log blockchain transaction
    await logBlockchainTransaction({
      chainId: 84532,
      transactionHash: signResult.transactionHash,
      blockNumber: signResult.blockNumber,
      transactionType: 'challenge_resolve',
      contractAddress: challenge.blockchainContractAddress || '',
      contractName: 'ChallengeFactory',
      fromAddress: challenge.blockchainContractAddress || '',
      toAddress: winner,
      functionName: 'resolveChallenge',
      parameters: JSON.stringify({
        challengeId,
        winner,
        pointsAwarded: finalPointsAwarded,
      }),
      status: 'success',
      gasUsed: BigInt(signResult.gasUsed),
      challengeId,
    });

    console.log(`✅ Challenge resolved! TX: ${signResult.transactionHash}`);

    res.json({
      success: true,
      message: 'Challenge resolved on-chain',
      challengeId,
      winner,
      pointsAwarded: finalPointsAwarded,
      transactionHash: signResult.transactionHash,
      blockNumber: signResult.blockNumber,
      gasUsed: signResult.gasUsed,
    });
  } catch (error: any) {
    console.error('❌ Failed to resolve challenge:', error);
    res.status(500).json({
      error: 'Failed to resolve challenge',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/challenges/batch-resolve
 * Resolve multiple challenges in batch
 * Useful for end-of-day settlement
 */
router.post('/batch-resolve', adminAuth, async (req: Request, res: Response) => {
  try {
    const { challenges: resolveChallenges } = req.body;

    if (!Array.isArray(resolveChallenges) || resolveChallenges.length === 0) {
      return res.status(400).json({
        error: 'Must provide array of challenges to resolve',
      });
    }

    console.log(`\n📦 Batch resolving ${resolveChallenges.length} challenges...`);

    const results = [];
    const failures = [];

    for (const challengeResolve of resolveChallenges) {
      try {
        const { challengeId, winner, pointsAwarded } = challengeResolve;

        console.log(`\n  ⛓️  Challenge ${challengeId}...`);

        // Get challenge
        const dbChallenge = await db
          .select()
          .from(challenges)
          .where(eq(challenges.id, challengeId))
          .limit(1);

        if (!dbChallenge.length) {
          failures.push({
            challengeId,
            error: 'Challenge not found',
          });
          continue;
        }

        // Resolve on-chain
        const signResult = await resolveChallengeOnChain({
          challengeId,
          winner,
          pointsAwarded,
        });

        // Update database
        await db
          .update(challenges)
          .set({
            status: 'resolved',
            onChainStatus: 'resolved',
            blockchainResolutionTxHash: signResult.transactionHash,
            resolutionTimestamp: new Date(),
          })
          .where(eq(challenges.id, challengeId));

        // Award points
        await recordPointsTransaction({
          userId: winner,
          challengeId,
          transactionType: 'earned_challenge',
          amount: BigInt(pointsAwarded),
          blockchainTxHash: signResult.transactionHash,
        });

        results.push({
          challengeId,
          success: true,
          transactionHash: signResult.transactionHash,
        });
      } catch (error: any) {
        failures.push({
          challengeId: challengeResolve.challengeId,
          error: error.message,
        });
      }
    }

    console.log(`\n✅ Batch complete: ${results.length} resolved, ${failures.length} failed`);

    res.json({
      total: resolveChallenges.length,
      successful: results.length,
      failed: failures.length,
      results,
      failures: failures.length > 0 ? failures : undefined,
    });
  } catch (error: any) {
    console.error('❌ Batch resolution failed:', error);
    res.status(500).json({
      error: 'Batch resolution failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/challenges/pending
 * Get all challenges awaiting admin resolution
 */
router.get('/pending', adminAuth, async (req: Request, res: Response) => {
  try {
    const pendingChallenges = await db
      .select()
      .from(challenges)
      .where(eq(challenges.onChainStatus, 'active'))
      .orderBy(challenges.createdAt);

    res.json({
      pending: pendingChallenges.length,
      challenges: pendingChallenges,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch pending challenges',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/challenges/by-status/:status
 * Get challenges by status
 */
router.get('/by-status/:status', adminAuth, async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const dbChallenges = await db
      .select()
      .from(challenges)
      .where(eq(challenges.onChainStatus, status))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));

    res.json({
      status,
      count: dbChallenges.length,
      challenges: dbChallenges,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch challenges',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/blockchain/signing-stats
 * Get admin signing infrastructure status
 */
router.get('/blockchain/signing-stats', adminAuth, async (req: Request, res: Response) => {
  try {
    const stats = await getSigningStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get signing stats',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/challenges/verify-resolution
 * Verify that a challenge resolution is valid
 * Useful for testing signatures before submission
 */
router.post('/verify-resolution', adminAuth, async (req: Request, res: Response) => {
  try {
    const { challengeId, winner, pointsAwarded, signature } = req.body;

    if (!signature) {
      return res.status(400).json({
        error: 'Signature required for verification',
      });
    }

    // Import verifyChallengeSignature
    const { verifyChallengeSignature } = await import('../blockchain/signing');

    const verification = await verifyChallengeSignature(
      { challengeId, winner, pointsAwarded },
      signature
    );

    res.json({
      isValid: verification.isValid,
      signer: verification.signer,
      message: verification.isValid
        ? 'Signature is valid and can be submitted'
        : 'Signature is invalid',
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Signature verification failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/challenges/:challengeId/resolution-history
 * Get resolution history for a challenge (all attempted resolutions)
 */
router.get(
  '/:challengeId/resolution-history',
  adminAuth,
  async (req: Request, res: Response) => {
    try {
      const { challengeId } = req.params;

      // Get challenge
      const dbChallenge = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(challengeId)))
        .limit(1);

      if (!dbChallenge.length) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const challenge = dbChallenge[0];

      res.json({
        challengeId: parseInt(challengeId),
        status: challenge.onChainStatus,
        resolutionTxHash: challenge.blockchainResolutionTxHash,
        resolutionTimestamp: challenge.resolutionTimestamp,
        pointsAwarded: challenge.pointsAwarded,
        onChainResolved: challenge.onChainResolved,
        metadata: challenge.onChainMetadata,
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to get resolution history',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/admin/challenges/disputes/list
 * Get all disputed challenges requiring admin review
 */
router.get('/disputes/list', adminAuth, async (req: Request, res: Response) => {
  try {
    const disputedChallenges = await db
      .select()
      .from(challenges)
      .where(eq(challenges.status, 'disputed'))
      .orderBy(challenges.createdAt);

    console.log(`📋 Retrieved ${disputedChallenges.length} disputed challenges for admin review`);

    res.json({
      total: disputedChallenges.length,
      disputes: disputedChallenges.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        amount: c.amount,
        status: c.status,
        evidence: c.evidence,
        result: c.result,
        dueDate: c.dueDate,
        createdAt: c.createdAt,
        completedAt: c.completedAt,
        challenger: c.challenger,
        challenged: c.challenged,
        disputeReason: c.disputeReason || 'Evidence submission',
        disputeEvidence: c.evidence,
      })),
    });
  } catch (error: any) {
    console.error('❌ Failed to fetch disputes:', error);
    res.status(500).json({
      error: 'Failed to fetch disputes',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/challenges/:id/resolve-dispute
 * Resolve a disputed challenge on-chain with admin decision
 * Admin can award to challenger, challenged, or refund both
 */
router.post('/:id/resolve-dispute', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { decision, adminNotes } = req.body;
    const challengeId = parseInt(id);

    if (!decision || !['challenger_won', 'challenged_won', 'draw'].includes(decision)) {
      return res.status(400).json({
        error: 'Invalid decision. Must be: challenger_won, challenged_won, or draw',
      });
    }

    console.log(`⚖️  Admin resolving disputed challenge ${challengeId}...`);
    console.log(`   Decision: ${decision}`);
    console.log(`   Notes: ${adminNotes}`);

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

    if (challenge.status !== 'disputed') {
      return res.status(400).json({
        error: 'Challenge is not disputed. Current status: ' + challenge.status,
      });
    }

    // Determine winner
    let winner: string | null = null;
    if (decision === 'challenger_won') {
      winner = challenge.challenger;
    } else if (decision === 'challenged_won') {
      winner = challenge.challenged;
    }
    // For draw, winner stays null

    console.log(`📝 Resolving dispute on-chain...`);

    // Sign resolution with admin authority
    let txResult;
    let pointsAwarded = 0;

    if (winner) {
      // Award points for dispute winner
      const amount = parseInt(challenge.amount as any) || 0;
      pointsAwarded = Math.min(50 + (amount * 5), 500);

      txResult = await resolveChallengeOnChain({
        challengeId,
        winner,
        pointsAwarded,
      });

      console.log(`📊 Awarding ${pointsAwarded} BPTS to dispute winner: ${winner}`);

      // Record points
      await recordPointsTransaction({
        userId: winner,
        challengeId,
        transactionType: 'earned_challenge',
        amount: BigInt(Math.floor(pointsAwarded * 1e18)),
        reason: `Dispute resolution: ${decision}`,
        blockchainTxHash: txResult.transactionHash,
      });

      // Send win notification
      await notifyPointsEarnedWin(
        winner,
        challengeId,
        pointsAwarded,
        `${challenge.title} - Dispute Resolved`
      ).catch(err => console.error('Notification failed:', err));
    } else {
      // Draw - refund both
      txResult = await resolveChallengeOnChain({
        challengeId,
        winner: '0x0000000000000000000000000000000000000000',
        pointsAwarded: 0,
      });
      console.log(`🤝 Draw settlement - both participants refunded`);
    }

    // Update challenge with dispute resolution
    await db
      .update(challenges)
      .set({
        result: decision,
        status: 'completed',
        onChainStatus: 'resolved',
        onChainResolved: true,
        blockchainResolutionTxHash: txResult.transactionHash,
        resolutionTimestamp: new Date(),
        completedAt: new Date(),
      })
      .where(eq(challenges.id, challengeId));

    // Log blockchain transaction
    await logBlockchainTransaction({
      chainId: 84532,
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      transactionType: 'dispute_resolve',
      contractAddress: challenge.blockchainContractAddress || '',
      contractName: 'ChallengeFactory',
      fromAddress: challenge.blockchainContractAddress || '',
      toAddress: winner || '0x0000000000000000000000000000000000000000',
      functionName: 'resolveDispute',
      parameters: JSON.stringify({
        challengeId,
        decision,
        winner,
        adminNotes,
        pointsAwarded,
      }),
      status: 'success',
      gasUsed: BigInt(txResult.gasUsed || 0),
      challengeId,
    });

    console.log(`✅ Dispute resolved on-chain! TX: ${txResult.transactionHash}`);

    res.json({
      success: true,
      message: 'Dispute resolved on-chain',
      challengeId,
      decision,
      winner: winner || 'draw',
      pointsAwarded,
      adminNotes,
      transactionHash: txResult.transactionHash,
      blockNumber: txResult.blockNumber,
      chainId: 84532,
    });
  } catch (error: any) {
    console.error('❌ Failed to resolve dispute:', error);
    res.status(500).json({
      error: 'Failed to resolve dispute',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/challenges/:id/payout
 * Get payout information for resolved challenge (on-chain)
 * Returns blockchain transaction hash and settlement details
 */
router.post('/:id/payout', adminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const challengeId = parseInt(id);

    console.log(`\n⛓️  Getting on-chain payout details for challenge ${challengeId}...`);

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

    if (!challenge.result) {
      return res.status(400).json({
        error: 'Challenge not yet resolved. Set result first.',
      });
    }

    if (challenge.onChainStatus !== 'resolved') {
      return res.status(400).json({
        error: 'Challenge not resolved on-chain yet',
        currentStatus: challenge.onChainStatus,
      });
    }

    // Return on-chain settlement details
    res.json({
      success: true,
      message: 'Challenge settled on-chain',
      challengeId,
      result: challenge.result,
      status: challenge.onChainStatus,
      transactionHash: challenge.blockchainResolutionTxHash,
      chainId: 84532,
      blockchainNetwork: 'Base Sepolia',
      onChainResolved: challenge.onChainResolved,
      resolutionTimestamp: challenge.resolutionTimestamp,
    });
  } catch (error: any) {
    console.error('❌ Failed to get payout details:', error);
    res.status(500).json({
      error: 'Failed to get payout details',
      message: error.message,
    });
  }
});

export default router;
