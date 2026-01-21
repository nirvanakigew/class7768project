/**
 * Bantah Points Notification Helpers
 * Sends notifications for all points-related events
 */

import { notificationService, NotificationEvent, NotificationChannel, NotificationPriority } from '../notificationService';

/**
 * Notify user when they earn points from challenge creation
 */
export async function notifyPointsEarnedCreation(
  userId: string,
  challengeId: number,
  points: number,
  challengeTitle: string
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.POINTS_EARNED,
    title: '🎁 Bantah Points Earned!',
    body: `You earned ${points} Bantah Points for creating "${challengeTitle}"`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.MEDIUM,
    data: {
      pointsType: 'challenge_creation',
      points,
      challengeId,
      actionUrl: `/challenges/${challengeId}`,
    },
  });
}

/**
 * Notify user when they earn points from challenge participation
 */
export async function notifyPointsEarnedParticipation(
  userId: string,
  challengeId: number,
  points: number,
  challengeTitle: string
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.POINTS_EARNED,
    title: '🎉 Participation Points Earned!',
    body: `You earned ${points} Bantah Points for joining "${challengeTitle}"`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.MEDIUM,
    data: {
      pointsType: 'challenge_participation',
      points,
      challengeId,
      actionUrl: `/challenges/${challengeId}`,
    },
  });
}

/**
 * Notify user when they win a challenge and earn points
 */
export async function notifyPointsEarnedWin(
  userId: string,
  challengeId: number,
  points: number,
  challengeTitle: string,
  winAmount?: string
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.POINTS_EARNED,
    title: '🏆 Challenge Won! Points Awarded',
    body: `You earned ${points} Bantah Points for winning "${challengeTitle}"${winAmount ? ` + ${winAmount} prize` : ''}`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.HIGH,
    data: {
      pointsType: 'challenge_win',
      points,
      challengeId,
      winAmount,
      actionUrl: `/challenges/${challengeId}`,
    },
  });
}

/**
 * Notify referrer when they earn referral bonus
 */
export async function notifyReferralBonus(
  userId: string,
  referredUserName: string,
  points: number = 200
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: '0',
    event: NotificationEvent.REFERRAL_BONUS,
    title: '👥 Referral Bonus Earned!',
    body: `${referredUserName} joined using your code! You earned ${points} Bantah Points`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.HIGH,
    data: {
      pointsType: 'referral_bonus',
      points,
      referredUser: referredUserName,
      actionUrl: '/wallet',
    },
  });
}

/**
 * Notify user that weekly claiming window is now open
 */
export async function notifyWeeklyClaimingOpen(userId: string, points: number): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: '0',
    event: NotificationEvent.BONUS_ACTIVATED,
    title: '📅 Weekly Points Claim Available!',
    body: `Your weekly claiming window is now open! Claim your ${points} Bantah Points`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.HIGH,
    data: {
      pointsType: 'weekly_claim_open',
      points,
      actionUrl: '/wallet',
    },
  });
}

/**
 * Notify user that weekly claiming window is closing soon (24 hours left)
 */
export async function notifyWeeklyClaimingExpiring(userId: string, points: number): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: '0',
    event: NotificationEvent.BONUS_EXPIRING,
    title: '⏰ Weekly Claim Expires Soon!',
    body: `Your weekly claiming window expires in 24 hours! Claim your ${points} Bantah Points now`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.HIGH,
    data: {
      pointsType: 'weekly_claim_expiring',
      points,
      actionUrl: '/wallet',
    },
  });
}

/**
 * Notify user that they've reached a points milestone
 */
export async function notifyPointsMilestone(
  userId: string,
  totalPoints: number,
  milestone: number
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: '0',
    event: NotificationEvent.ACHIEVEMENT_UNLOCKED,
    title: `🌟 Milestone Reached: ${milestone} Bantah Points!`,
    body: `Congratulations! You've earned ${totalPoints} total Bantah Points. Keep going!`,
    channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
    priority: NotificationPriority.MEDIUM,
    data: {
      pointsType: 'milestone',
      totalPoints,
      milestone,
      actionUrl: '/wallet/leaderboard',
    },
  });
}

/**
 * Notify user about points balance change (bulk notification)
 */
export async function notifyPointsBalanceUpdate(
  userId: string,
  oldBalance: number,
  newBalance: number,
  reason: string
): Promise<boolean> {
  const change = newBalance - oldBalance;
  const isIncrease = change > 0;

  return notificationService.send({
    userId,
    challengeId: '0',
    event: NotificationEvent.POINTS_EARNED,
    title: isIncrease ? '📈 Points Added!' : '📉 Points Deducted',
    body: `${isIncrease ? '+' : ''}${change} Bantah Points. ${reason}. Balance: ${newBalance}`,
    channels: [NotificationChannel.IN_APP],
    priority: isIncrease ? NotificationPriority.MEDIUM : NotificationPriority.LOW,
    data: {
      pointsType: 'balance_update',
      change,
      oldBalance,
      newBalance,
      reason,
      actionUrl: '/wallet',
    },
  });
}

/**
 * Notify when points are locked in escrow (challenge started)
 */
export async function notifyPointsLocked(
  userId: string,
  challengeId: number,
  points: number,
  challengeTitle: string
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.BONUS_ACTIVATED,
    title: '🔒 Points Locked in Challenge',
    body: `${points} Bantah Points locked as stake in "${challengeTitle}"`,
    channels: [NotificationChannel.IN_APP],
    priority: NotificationPriority.LOW,
    data: {
      pointsType: 'points_locked',
      points,
      challengeId,
      actionUrl: `/challenges/${challengeId}`,
    },
  });
}

/**
 * Notify when points are released from escrow (challenge ended/cancelled)
 */
export async function notifyPointsReleased(
  userId: string,
  challengeId: number,
  points: number,
  challengeTitle: string,
  reason: string
): Promise<boolean> {
  return notificationService.send({
    userId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.BONUS_ACTIVATED,
    title: '🔓 Points Released from Challenge',
    body: `${points} Bantah Points released. ${reason}`,
    channels: [NotificationChannel.IN_APP],
    priority: NotificationPriority.LOW,
    data: {
      pointsType: 'points_released',
      points,
      challengeId,
      reason,
      actionUrl: `/challenges/${challengeId}`,
    },
  });
}

/**
 * Notify admin when challenge points awards are queued
 */
export async function notifyPointsAwardPending(
  adminId: string,
  challengeId: number,
  winnerCount: number,
  totalPoints: number
): Promise<boolean> {
  return notificationService.send({
    userId: adminId,
    challengeId: challengeId.toString(),
    event: NotificationEvent.ACCOUNT_ALERT,
    title: '⏳ Points Awards Pending',
    body: `Challenge #${challengeId}: ${winnerCount} winners pending ${totalPoints} points award`,
    channels: [NotificationChannel.IN_APP],
    priority: NotificationPriority.MEDIUM,
    data: {
      pointsType: 'admin_pending_awards',
      challengeId,
      winnerCount,
      totalPoints,
      actionUrl: `/admin/challenges/${challengeId}`,
    },
  });
}

/**
 * Batch notify multiple users about points earned
 */
export async function notifyBatchPointsEarned(
  userIds: string[],
  points: number,
  reason: string
): Promise<number> {
  let successCount = 0;

  for (const userId of userIds) {
    const sent = await notificationService.send({
      userId,
      challengeId: '0',
      event: NotificationEvent.POINTS_EARNED,
      title: '🎁 Points Earned!',
      body: `You earned ${points} Bantah Points. ${reason}`,
      channels: [NotificationChannel.PUSH, NotificationChannel.IN_APP],
      priority: NotificationPriority.MEDIUM,
      data: {
        pointsType: 'batch_earning',
        points,
        reason,
        actionUrl: '/wallet',
      },
    });

    if (sent) successCount++;
  }

  console.log(`📧 Batch notification: ${successCount}/${userIds.length} users notified`);
  return successCount;
}
