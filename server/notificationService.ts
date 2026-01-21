/**
 * 🔔 FOMO Notification Service (Final Spec)
 * Push + In-App Only
 * 9 Core Events with Rate Limiting & Anti-Spam
 */

import { db } from './db';
import { notifications } from '../shared/schema';
import { users } from '../shared/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import Pusher from 'pusher';
import { sendPushNotification } from './firebase/admin';
import { initializeFirebase } from './firebase/admin';

export enum NotificationEvent {
  // Challenge Events
  CHALLENGE_CREATED = 'challenge.created',
  CHALLENGE_STARTING_SOON = 'challenge.starting_soon',
  CHALLENGE_ENDING_SOON = 'challenge.ending_soon',
  CHALLENGE_JOINED_FRIEND = 'challenge.joined.friend',
  NEW_CHALLENGE_ACCEPTED = 'challenge.accepted',
  
  // Friend Events
  FRIEND_REQUEST = 'friend.request',
  FRIEND_ACCEPTED = 'friend.accepted',
  
  // Follower Events
  NEW_FOLLOWER = 'new_follower',
  
  // Leaderboard & Points
  LEADERBOARD_RANK_CHANGE = 'leaderboard.rank_change',
  POINTS_EARNED = 'points.earned',
  
  // Achievements & Bonuses
  ACHIEVEMENT_UNLOCKED = 'achievement.unlocked',
  BONUS_ACTIVATED = 'bonus.activated',
  BONUS_EXPIRING = 'bonus.expiring',
  
  // Payouts & Referrals
  PAYOUT_READY = 'payout.ready',
  REFERRAL_BONUS = 'referral.bonus',
  
  // System Events
  IMBALANCE_DETECTED = 'imbalance.detected',
  MATCH_FOUND = 'match.found',
  SYSTEM_JOINED = 'system.joined',
  ACCOUNT_ALERT = 'account.alert',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

interface NotificationPayload {
  userId: string;
  challengeId: string;
  event: NotificationEvent;
  title: string;
  body: string;
  channels: NotificationChannel[];
  priority: NotificationPriority;
  data?: Record<string, any>;
}

/**
 * Rate limiting & deduplication rules
 */
interface RateLimitConfig {
  perUserPerMinute: number;           // Max notifications per user per minute
  perChallengePerEvent: number;       // Max same event per challenge per hour
  eventCooldownSeconds: Record<NotificationEvent, number>;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  perUserPerMinute: 5,
  perChallengePerEvent: 1,
  eventCooldownSeconds: {
    [NotificationEvent.CHALLENGE_CREATED]: 300,           // 5 mins
    [NotificationEvent.CHALLENGE_STARTING_SOON]: 120,     // 2 mins
    [NotificationEvent.CHALLENGE_ENDING_SOON]: 300,       // 5 mins
    [NotificationEvent.CHALLENGE_JOINED_FRIEND]: 60,      // 1 min
    [NotificationEvent.FRIEND_REQUEST]: 300,              // 5 mins
    [NotificationEvent.FRIEND_ACCEPTED]: 60,              // 1 min
    [NotificationEvent.LEADERBOARD_RANK_CHANGE]: 600,     // 10 mins (don't spam rank changes)
    [NotificationEvent.POINTS_EARNED]: 120,               // 2 mins
    [NotificationEvent.ACHIEVEMENT_UNLOCKED]: 60,         // 1 min
    [NotificationEvent.BONUS_ACTIVATED]: 60,              // 1 min
    [NotificationEvent.BONUS_EXPIRING]: 120,              // 2 mins
    [NotificationEvent.PAYOUT_READY]: 0,                  // No cooldown (critical)
    [NotificationEvent.REFERRAL_BONUS]: 60,               // 1 min
    [NotificationEvent.IMBALANCE_DETECTED]: 600,          // 10 mins
    [NotificationEvent.MATCH_FOUND]: 0,                   // No cooldown (critical)
    [NotificationEvent.SYSTEM_JOINED]: 300,               // 5 mins
    [NotificationEvent.ACCOUNT_ALERT]: 0,                 // No cooldown (critical)
  },
};

export class NotificationService {
  private pusher: Pusher;
  private rateLimitConfig: RateLimitConfig;

  constructor(rateLimitConfig = DEFAULT_RATE_LIMIT) {
    this.pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID || '1553294',
      key: process.env.PUSHER_KEY || 'decd2cca5e39cf0cbcd4',
      secret: process.env.PUSHER_SECRET || '1dd966e56c465ea285d9',
      cluster: process.env.PUSHER_CLUSTER || 'mt1',
      useTLS: true,
    });
    this.rateLimitConfig = rateLimitConfig;
    
    // Initialize Firebase Admin SDK for push notifications
    initializeFirebase();
  }

  /**
   * Main entry point: Send notification
   */
  async send(payload: NotificationPayload): Promise<boolean> {
    try {
      // Check rate limits
      const canSend = await this.checkRateLimits(payload);
      if (!canSend) {
        console.log(`⏸ Notification rate-limited: ${payload.event} for user ${payload.userId}`);
        return false;
      }

      // Determine which channels to send based on priority
      const channels = this.filterChannelsByPriority(payload.channels, payload.priority);

      // Save to database
      await this.saveToDatabase(payload);

      // Send via channels
      if (channels.includes(NotificationChannel.IN_APP)) {
        await this.sendInApp(payload);
      }

      if (channels.includes(NotificationChannel.PUSH)) {
        await this.sendPush(payload);
      }

      console.log(`✅ Notification sent: ${payload.event} to ${payload.userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending notification: ${payload.event}`, error);
      return false;
    }
  }

  /**
   * Rate limiting: Check if notification can be sent
   */
  private async checkRateLimits(payload: NotificationPayload): Promise<boolean> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    // Check per-user-per-minute limit
    const recentCount = await db
      .select({ count: db.$count(notifications) })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, payload.userId),
          gt(notifications.createdAt, oneMinuteAgo)
        )
      );

    const recentCountValue = Array.isArray(recentCount) && recentCount.length > 0
      ? Number(recentCount[0]?.count || 0)
      : 0;

    if (recentCountValue >= this.rateLimitConfig.perUserPerMinute) {
      // Always allow critical MATCH_FOUND notifications through the per-minute
      // throttle so users receive immediate match alerts even if other
      // informational notifications were recently sent.
      if (payload.event === NotificationEvent.MATCH_FOUND) {
        // allow
      } else {
        return false;
      }
    }

    // Check event cooldown (best-effort). Wrap in try/catch because some DB schemas
    // or reserved column names (e.g. `type`) may cause SQL generation issues in
    // edge environments. If the cooldown check fails, allow sending to avoid
    // blocking notifications.
    try {
      const cooldownSeconds = this.rateLimitConfig.eventCooldownSeconds[payload.event];
      if (cooldownSeconds > 0) {
        // If there's no challengeId provided in the payload, skip the per-challenge
        // cooldown check to avoid generating SQL that may fail in some DB
        // environments (this is best-effort rate limiting).
        if (!payload.challengeId) {
          return true;
        }
        const cooldownTime = new Date(now.getTime() - cooldownSeconds * 1000);

        // Only include challengeId in the where clause when present to avoid
        // generating malformed SQL if it's undefined/null.
        const whereClauses: any[] = [
          eq(notifications.userId, payload.userId),
          eq(notifications.type, payload.event),
          gt(notifications.createdAt, cooldownTime),
        ];

        if (payload.challengeId) {
          whereClauses.splice(1, 0, eq(notifications.challengeId, String(payload.challengeId)));
        }

        const recentSameEvent = await db
          .select({ count: db.$count(notifications) })
          .from(notifications)
          .where(and(...whereClauses));

        const recentSameEventValue = Array.isArray(recentSameEvent) && recentSameEvent.length > 0
          ? Number(recentSameEvent[0]?.count || 0)
          : 0;

        if (recentSameEventValue > 0) {
          return false;
        }
      }
    } catch (err) {
      console.error('Rate limit cooldown check failed (allowing notification):', err);
    }

    return true;
  }

  /**
   * Filter channels based on priority
   */
  private filterChannelsByPriority(
    requestedChannels: NotificationChannel[],
    priority: NotificationPriority
  ): NotificationChannel[] {
    // Always include in-app
    const result = [NotificationChannel.IN_APP];

    // Only add push for high/medium priority
    if (
      priority === NotificationPriority.HIGH ||
      priority === NotificationPriority.MEDIUM
    ) {
      if (requestedChannels.includes(NotificationChannel.PUSH)) {
        result.push(NotificationChannel.PUSH);
      }
    }

    return result;
  }

  /**
   * Save notification to database
   */
  private async saveToDatabase(payload: NotificationPayload): Promise<void> {
    const priorityMap: Record<string, number> = {
      [NotificationPriority.LOW]: 1,
      [NotificationPriority.MEDIUM]: 2,
      [NotificationPriority.HIGH]: 3,
    };

    const priorityValue = priorityMap[payload.priority] || 1;

    await db.insert(notifications).values({
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: payload.userId,
      type: payload.event,
      title: payload.title,
      message: payload.body,
      data: payload.data as any,
      channels: payload.channels as any,
      priority: priorityValue,
      read: false,
      createdAt: new Date(),
    });
  }

  /**
   * Send to in-app feed via Pusher
   */
  private async sendInApp(payload: NotificationPayload): Promise<void> {
    try {
      const channelName = `user-${payload.userId}`;
      await this.pusher.trigger(channelName, 'notification', {
        id: `notif_${Date.now()}`,
        event: payload.event,
        title: payload.title,
        body: payload.body,
        challengeId: payload.challengeId,
        priority: payload.priority,
        timestamp: new Date(),
        data: payload.data,
      });
    } catch (error) {
      console.error('Error sending in-app notification:', error);
    }
  }

  /**
   * Send push notification
   */
  private async sendPush(payload: NotificationPayload): Promise<void> {
    try {
      // Get user's FCM token from database
      const userRecord = await db
        .select({ fcmToken: users.fcmToken })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!userRecord || !userRecord[0]?.fcmToken) {
        console.log(`⚠️  No FCM token found for user ${payload.userId}, skipping push`);
        return;
      }

      const fcmToken = userRecord[0].fcmToken;

      // Determine priority
      const priority = payload.priority === 'high' ? 'high' : 'normal';
      const requireInteraction = payload.priority === 'high';

      // Send via Firebase Cloud Messaging
      const sent = await sendPushNotification(
        fcmToken,
        payload.title,
        payload.body,
        {
          event: payload.event,
          challengeId: payload.challengeId,
          priority: payload.priority,
          ...payload.data,
        },
        {
          priority,
          requireInteraction,
        }
      );

      if (sent) {
        console.log(`📱 Push notification sent via Firebase to ${payload.userId}`);
      } else {
        console.warn(`📱 Failed to send push notification to ${payload.userId}`);
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  /**
   * Get unread notification count for user
   */
  async getUnreadCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: db.$count(notifications) })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));

    return result[0].count || 0;
  }

  /**
   * Get notifications for user (paginated)
   */
  async getNotifications(userId: string, limit = 20, offset = 0) {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(eq(notifications.id, notificationId));
  }
}

export const notificationService = new NotificationService();
