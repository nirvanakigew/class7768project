/**
 * Followers Management API Routes
 * Handles follow/unfollow relationships and follower lists
 */

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { followers, users } from '../../shared/schema';
import { eq, and, or } from 'drizzle-orm';
import { isAuthenticated } from '../middleware/auth';
import { NotificationService, NotificationEvent, NotificationChannel, NotificationPriority } from '../notificationService';

const router = Router();
const notificationService = new NotificationService();

/**
 * POST /api/followers/:userId/follow
 * Follow a user or unfollow if already following
 */
router.post('/:userId/follow', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Invalid target user' });
    }

    // Check if target user exists
    const targetUser = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if already following
    const existingFollow = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, userId),
          eq(followers.followeeId, targetUserId)
        )
      )
      .limit(1);

    let isFollowing = false;

    if (existingFollow && existingFollow.length > 0) {
      // Unfollow
      await db
        .delete(followers)
        .where(
          and(
            eq(followers.followerId, userId),
            eq(followers.followeeId, targetUserId)
          )
        );

      // Update follower count for target user
      await db
        .update(users)
        .set({
          followerCount: Math.max(0, (targetUser[0].followerCount || 0) - 1),
        })
        .where(eq(users.id, targetUserId));

      // Update following count for current user
      const currentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      await db
        .update(users)
        .set({
          followingCount: Math.max(0, (currentUser[0]?.followingCount || 0) - 1),
        })
        .where(eq(users.id, userId));

      console.log(`✅ User unfollowed: ${userId} unfollowed ${targetUserId}`);
      isFollowing = false;
    } else {
      // Follow
      await db
        .insert(followers)
        .values({
          followerId: userId,
          followeeId: targetUserId,
          createdAt: new Date(),
        });

      // Update follower count for target user
      await db
        .update(users)
        .set({
          followerCount: (targetUser[0].followerCount || 0) + 1,
        })
        .where(eq(users.id, targetUserId));

      // Update following count for current user
      const currentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      await db
        .update(users)
        .set({
          followingCount: (currentUser[0]?.followingCount || 0) + 1,
        })
        .where(eq(users.id, userId));

      console.log(`✅ User followed: ${userId} → ${targetUserId}`);
      isFollowing = true;

      // Get follower name for notification
      const follower = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const followerName = follower[0]?.firstName || follower[0]?.username || 'Someone';

      // Send notification to target user
      await notificationService.send({
        userId: targetUserId,
        challengeId: targetUserId, // Use target user ID as identifier
        event: NotificationEvent.NEW_FOLLOWER,
        title: `👥 ${followerName} started following you!`,
        body: `${followerName} is now following your profile`,
        channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
        priority: NotificationPriority.LOW,
        data: {
          followerId: userId,
          followerName,
          action: 'new_follower',
        },
      }).catch(err => console.warn('Failed to send follower notification:', err.message));
    }

    res.json({
      success: true,
      isFollowing,
      message: isFollowing ? 'User followed' : 'User unfollowed',
    });
  } catch (error) {
    console.error('Error toggling follow:', error);
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

/**
 * GET /api/followers/:userId
 * Get followers list for a user
 */
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all followers
    const followerRelationships = await db
      .select()
      .from(followers)
      .where(eq(followers.followeeId, userId));

    if (followerRelationships.length === 0) {
      return res.json({
        success: true,
        followers: [],
        count: 0,
      });
    }

    // Get follower details
    const followerIds = followerRelationships.map(f => f.followerId);
    const followerUsers = await db
      .select()
      .from(users)
      .where(or(...followerIds.map(id => eq(users.id, id))));

    const followerList = followerUsers.map(follower => ({
      id: follower.id,
      firstName: follower.firstName,
      lastName: follower.lastName,
      username: follower.username,
      profileImageUrl: follower.profileImageUrl,
      level: follower.level,
      points: follower.points,
      followerCount: follower.followerCount,
      followingCount: follower.followingCount,
    }));

    res.json({
      success: true,
      followers: followerList,
      count: followerList.length,
    });
  } catch (error) {
    console.error('Error getting followers:', error);
    res.status(500).json({ error: 'Failed to get followers list' });
  }
});

/**
 * GET /api/followers/:userId/following
 * Get users that this user is following
 */
router.get('/:userId/following', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all users this user is following
    const followingRelationships = await db
      .select()
      .from(followers)
      .where(eq(followers.followerId, userId));

    if (followingRelationships.length === 0) {
      return res.json({
        success: true,
        following: [],
        count: 0,
      });
    }

    // Get following user details
    const followingIds = followingRelationships.map(f => f.followeeId);
    const followingUsers = await db
      .select()
      .from(users)
      .where(or(...followingIds.map(id => eq(users.id, id))));

    const followingList = followingUsers.map(followed => ({
      id: followed.id,
      firstName: followed.firstName,
      lastName: followed.lastName,
      username: followed.username,
      profileImageUrl: followed.profileImageUrl,
      level: followed.level,
      points: followed.points,
      followerCount: followed.followerCount,
      followingCount: followed.followingCount,
    }));

    res.json({
      success: true,
      following: followingList,
      count: followingList.length,
    });
  } catch (error) {
    console.error('Error getting following list:', error);
    res.status(500).json({ error: 'Failed to get following list' });
  }
});

/**
 * GET /api/followers/status/:userId
 * Check if current user is following a specific user
 */
router.get('/status/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const followRelationship = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, userId),
          eq(followers.followeeId, targetUserId)
        )
      )
      .limit(1);

    const isFollowing = followRelationship && followRelationship.length > 0;

    res.json({
      success: true,
      isFollowing,
    });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ error: 'Failed to check follow status' });
  }
});

export default router;
