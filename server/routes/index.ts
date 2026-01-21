// Route registration for Phase 4 API endpoints
// Import all blockchain-related routes and mount them on the Express app

import express from 'express';
import apiChallengesRouter from './api-challenges';
import apiPayoutsRouter from './api-payouts';
import apiPointsRouter from './api-points';
import apiAdminResolveRouter from './api-admin-resolve';
import apiUserRouter from './api-user';
import apiFriendsRouter from './api-friends';
import apiFollowersRouter from './api-followers';

export function registerBlockchainRoutes(app: express.Application) {
  /**
   * Challenge Operations
   * POST /api/challenges/create-admin - Create betting pool
   * POST /api/challenges/create-p2p - Create user-to-user challenge
   * POST /api/challenges/:id/join - Join admin challenge
   * POST /api/challenges/:id/accept - Accept P2P challenge
   * GET /api/challenges/:id - Get challenge details
   * GET /api/challenges - List challenges
   * GET /api/challenges/user/:userId - Get user's challenges
   */
  app.use('/api/challenges', apiChallengesRouter);

  /**
   * Payout Operations
   * POST /api/payouts/:challengeId/claim - Claim payout
   * GET /api/payouts/:challengeId/status - Get payout status
   * GET /api/payouts/user/:userId - Get user's payouts
   * POST /api/payouts/batch-claim - Batch claim multiple payouts
   */
  app.use('/api/payouts', apiPayoutsRouter);

  /**
   * Points & Leaderboard Operations
   * GET /api/points/balance/:userId - Get points balance
   * POST /api/points/transfer - Transfer points
   * GET /api/points/leaderboard - Global leaderboard
   * GET /api/points/leaderboard/:userId - User rank & stats
   * GET /api/points/history/:userId - Transaction history
   * GET /api/points/statistics - Global statistics
   * POST /api/points/connect-wallet - Connect blockchain wallet
   * GET /api/points/wallets - Get user's wallets
   * POST /api/points/set-primary-wallet/:walletId - Set primary wallet
   */
  app.use('/api/points', apiPointsRouter);

  /**
   * Admin Resolution Operations
   * POST /api/admin/challenges/resolve - Resolve single challenge
   * POST /api/admin/challenges/batch-resolve - Batch resolve
   * GET /api/admin/challenges/pending - Get pending challenges
   * GET /api/admin/challenges/by-status/:status - Filter by status
   * GET /api/admin/blockchain/signing-stats - Get signing status
   * POST /api/admin/challenges/verify-resolution - Verify signature
   * GET /api/admin/challenges/:id/resolution-history - Get history
   */
  app.use('/api/admin/challenges', apiAdminResolveRouter);

  /**
   * User Account Operations
   * POST /api/user/fcm-token - Save FCM token for push notifications
   * GET /api/user/profile - Get current user profile
   * GET /api/user/transactions - Get user's transaction history
   */
  app.use('/api/user', apiUserRouter);

  /**
   * Friends Management
   * POST /api/friends/request - Send friend request
   * POST /api/friends/accept/:requestId - Accept friend request
   * POST /api/friends/reject/:requestId - Reject friend request
   * GET /api/friends - Get all friends
   * GET /api/friends/requests - Get pending friend requests
   * DELETE /api/friends/:friendId - Remove friend
   * GET /api/friends/status/:userId - Check friendship status
   */
  app.use('/api/friends', apiFriendsRouter);

  /**
   * Followers Management
   * POST /api/followers/:userId/follow - Follow/unfollow a user
   * GET /api/followers/:userId - Get user's followers list
   * GET /api/followers/:userId/following - Get user's following list
   * GET /api/followers/status/:userId - Check if following status
   */
  app.use('/api/followers', apiFollowersRouter);

  console.log('✅ Blockchain REST API routes registered:');
  console.log('   - /api/challenges');
  console.log('   - /api/payouts');
  console.log('   - /api/points');
  console.log('   - /api/admin/challenges');
  console.log('   - /api/followers');
}

export { apiChallengesRouter, apiPayoutsRouter, apiPointsRouter, apiAdminResolveRouter };
