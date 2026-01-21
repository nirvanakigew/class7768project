import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
  boolean,
  decimal,
  primaryKey,
  unique,
  json,
  uuid,
  bigint,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - Required for auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Core user table - Updated for email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").notNull().unique(),
  password: varchar("password").notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  username: varchar("username").unique(),
  level: integer("level").default(1),
  xp: integer("xp").default(0),
  points: integer("points").default(1000),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00"),
  followerCount: integer("follower_count").default(0),
  followingCount: integer("following_count").default(0),
  referralCode: varchar("referral_code").unique(),
  referredBy: varchar("referred_by"),
  streak: integer("streak").default(0),
  status: varchar("status").default("active"), // active, banned, suspended, inactive
  isAdmin: boolean("is_admin").default(false),
  // Admin wallet system (for bonuses and payouts)
  adminWalletBalance: decimal("admin_wallet_balance", { precision: 15, scale: 2 }).default("0.00"),
  adminTotalCommission: decimal("admin_total_commission", { precision: 15, scale: 2 }).default("0.00"),
  adminTotalBonusesGiven: decimal("admin_total_bonuses_given", { precision: 15, scale: 2 }).default("0.00"),
  isTelegramUser: boolean("is_telegram_user").default(false),
  telegramId: varchar("telegram_id"),
  telegramUsername: varchar("telegram_username"),
  coins: integer("coins").default(0), // For Telegram users
  fcmToken: varchar("fcm_token"), // Firebase Cloud Messaging token
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Events for prediction betting
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: varchar("category").notNull(), // crypto, sports, gaming, music, politics
  status: varchar("status").default("active"), // active, completed, cancelled, pending_admin
  creatorId: varchar("creator_id").notNull(),
  eventPool: integer("event_pool").default(0), // Single unified pool in coins
  yesPool: integer("yes_pool").default(0), // For display purposes in coins
  noPool: integer("no_pool").default(0), // For display purposes in coins
  entryFee: integer("entry_fee").notNull(), // Changed to coins
  endDate: timestamp("end_date").notNull(),
  result: boolean("result"), // true for yes, false for no, null for pending
  adminResult: boolean("admin_result"), // Admin's final decision on event outcome
  creatorFee: integer("creator_fee").default(0), // 3% creator fee in coins
  isPrivate: boolean("is_private").default(false), // Private events need approval
  maxParticipants: integer("max_participants").default(100), // FCFS limit
  imageUrl: varchar("image_url"),
  chatEnabled: boolean("chat_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Event participation tracking
export const eventParticipants = pgTable("event_participants", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: varchar("user_id").notNull(),
  prediction: boolean("prediction").notNull(), // true for yes, false for no
  amount: integer("amount").notNull(), // Changed to coins
  status: varchar("status").default("active"), // active, matched, won, lost
  matchedWith: varchar("matched_with"), // User ID of opponent (for FCFS matching)
  payout: integer("payout").default(0), // Winner payout amount in coins
  joinedAt: timestamp("joined_at").defaultNow(),
  payoutAt: timestamp("payout_at"),
});

// Event pool betting amounts
export const eventPools = pgTable("event_pools", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  yesAmount: integer("yes_amount").default(0), // In coins
  noAmount: integer("no_amount").default(0), // In coins
  totalPool: integer("total_pool").default(0), // In coins
  creatorFeeCollected: boolean("creator_fee_collected").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Event join requests for private events
export const eventJoinRequests = pgTable("event_join_requests", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: varchar("user_id").notNull(),
  prediction: boolean("prediction").notNull(), // true for yes, false for no
  amount: integer("amount").notNull(), // In coins
  status: varchar("status").default("pending"), // pending, approved, rejected
  requestedAt: timestamp("requested_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
});

// Real-time chat messages in events
export const eventMessages: any = pgTable("event_messages", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => events.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  replyToId: integer("reply_to_id").references((): any => eventMessages.id, { onDelete: "set null" }),
  mentions: json("mentions").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messageReactions = pgTable("message_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").references(() => eventMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserMessageEmoji: unique().on(table.messageId, table.userId, table.emoji),
}));

// Live typing indicators
export const eventTyping = pgTable("event_typing", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: varchar("user_id").notNull(),
  isTyping: boolean("is_typing").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Join/leave activity logs
export const eventActivity = pgTable("event_activity", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  userId: varchar("user_id").notNull(),
  action: varchar("action").notNull(), // joined, left, bet_placed
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// P2P betting matches between users
export const eventMatches = pgTable("event_matches", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  challenger: varchar("challenger").notNull(),
  challenged: varchar("challenged").notNull(),
  amount: integer("amount").notNull(), // In coins
  status: varchar("status").default("pending"), // pending, accepted, completed, cancelled
  result: varchar("result"), // challenger_won, challenged_won, draw
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Peer-to-peer challenges with escrow
export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  challenger: varchar("challenger"),
  challenged: varchar("challenged"),
  title: text("title").notNull(),
  description: text("description"),
  category: varchar("category").notNull(),
  amount: integer("amount").notNull(), // Changed to coins
  status: varchar("status").default("pending"), // pending, active, completed, disputed, cancelled, open
  evidence: jsonb("evidence"),
  result: varchar("result"), // challenger_won, challenged_won, draw
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  // Admin challenge fields
  adminCreated: boolean("admin_created").default(false),
  bonusSide: varchar("bonus_side"), // "YES", "NO", or null
  bonusMultiplier: decimal("bonus_multiplier", { precision: 3, scale: 2 }).default("1.00"),
  bonusAmount: integer("bonus_amount").default(0), // Custom bonus amount in naira
  bonusEndsAt: timestamp("bonus_ends_at"),
  yesStakeTotal: integer("yes_stake_total").default(0),
  noStakeTotal: integer("no_stake_total").default(0),
  coverImageUrl: varchar("cover_image_url"), // Cover art/image uploaded during challenge creation
  // Behavioral Bonus Configuration (Synced to DB)
  earlyBirdSlots: integer("early_bird_slots").default(0),
  earlyBirdBonus: integer("early_bird_bonus").default(0), // Fixed coin bonus
  streakBonusEnabled: boolean("streak_bonus_enabled").default(false),
  convictionBonusEnabled: boolean("conviction_bonus_enabled").default(false),
  firstTimeBonusEnabled: boolean("first_time_bonus_enabled").default(false),
  socialTagBonus: integer("social_tag_bonus").default(0), // Bonus for tagging friends
  isPinned: boolean("is_pinned").default(false), // Admin-only: pin challenge to top of feed
  // P2P Blockchain fields
  paymentTokenAddress: varchar("payment_token_address"), // ERC20 token contract address (USDC, USDT, etc.)
  stakeAmountWei: bigint("stake_amount_wei", { mode: "number" }), // Stake amount in wei (smallest unit)
  onChainStatus: varchar("on_chain_status").default("pending"), // pending, submitted, confirmed, failed, completed
  creatorTransactionHash: varchar("creator_transaction_hash"), // Hash of creator's blockchain tx
  acceptorTransactionHash: varchar("acceptor_transaction_hash"), // Hash of acceptor's blockchain tx
  blockchainChallengeId: varchar("blockchain_challenge_id"), // ID from smart contract
  blockchainCreatedAt: timestamp("blockchain_created_at"), // When tx was confirmed on-chain
  blockchainAcceptedAt: timestamp("blockchain_accepted_at"), // When acceptor signed and tx confirmed
});

// Pairing queue for challenge matching (FCFS with stake tolerance)
export const pairQueue = pgTable("pair_queue", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  userId: varchar("user_id").notNull(),
  side: varchar("side").notNull(), // "YES" or "NO"
  stakeAmount: integer("stake_amount").notNull(), // In coins
  status: varchar("status").default("waiting"), // waiting, matched, cancelled
  matchedWith: varchar("matched_with"), // User ID of matched opponent
  createdAt: timestamp("created_at").defaultNow(),
  matchedAt: timestamp("matched_at"),
});

// Telegram groups where the bot is added
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  telegramId: varchar("telegram_id", { length: 64 }).unique().notNull(),
  title: varchar("title", { length: 255 }),
  type: varchar("type", { length: 50 }),
  addedBy: varchar("added_by", { length: 64 }),
  addedAt: timestamp("added_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Group members tracked when they interact with the bot
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  telegramId: varchar("telegram_id", { length: 64 }).notNull(),
  username: varchar("username", { length: 100 }),
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
});

// Real-time chat in challenges
export const challengeMessages = pgTable("challenge_messages", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  userId: varchar("user_id").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Track participants who join challenges
export const challengeParticipants = pgTable("challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  userId: varchar("user_id").notNull(),
  side: varchar("side").notNull(), // "YES" or "NO"
  amount: integer("amount").notNull(), // stake in coins
  payoutAmount: integer("payout_amount").default(0),
  status: varchar("status").default("active"), // active, settled, refunded
  joinedAt: timestamp("joined_at").defaultNow(),
  payoutAt: timestamp("payout_at"),
});

// Secure fund holding for challenges
export const escrow = pgTable("escrow", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  amount: integer("amount").notNull(), // In coins
  status: varchar("status").default("holding"), // holding, released, refunded
  createdAt: timestamp("created_at").defaultNow(),
  releasedAt: timestamp("released_at"),
});

// Friend connections and requests
export const friends = pgTable("friends", {
  id: serial("id").primaryKey(),
  requesterId: varchar("requester_id").notNull(),
  addresseeId: varchar("addressee_id").notNull(),
  status: varchar("status").default("pending"), // pending, accepted, blocked
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

// Followers system - users can follow each other
export const followers = pgTable("followers", {
  id: uuid("id").primaryKey().defaultRandom(),
  followerId: varchar("follower_id").notNull(),
  followeeId: varchar("following_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  unique().on(table.followerId, table.followeeId),
]);

// Achievement definitions
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  icon: varchar("icon"),
  category: varchar("category"),
  xpReward: integer("xp_reward").default(0),
  pointsReward: integer("points_reward").default(0),
  requirement: jsonb("requirement"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User achievement unlocks
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  achievementId: integer("achievement_id").notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

// System notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // FOMO notification types
  title: text("title").notNull(),
  message: text("message"),
  icon: varchar("icon"), // emoji icon
  data: jsonb("data"),
  challengeId: integer("challenge_id"), // Reference to challenge if this notification is about a challenge
  channels: text("channels").array(), // in_app_feed, push_notification, telegram_bot
  fomoLevel: varchar("fomo_level").default('low'), // low, medium, high, urgent
  priority: integer("priority").default(1), // 1=low, 2=medium, 3=high, 4=urgent
  read: boolean("read").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User notification preferences
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique(),
  enablePush: boolean("enable_push").default(true),
  enableTelegram: boolean("enable_telegram").default(false),
  enableInApp: boolean("enable_in_app").default(true),
  notificationFrequency: varchar("notification_frequency").default("immediate"), // immediate, batched, digest
  mutedChallenges: text("muted_challenges").array().default([]),
  mutedUsers: text("muted_users").array().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// All financial transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // deposit, withdrawal, bet, win, challenge, referral
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  relatedId: integer("related_id"), // eventId, challengeId, etc.
  status: varchar("status").default("completed"), // pending, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin wallet transactions (for bonuses, payouts, commissions)
export const adminWalletTransactions = pgTable("admin_wallet_transactions", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id").notNull(),
  type: varchar("type").notNull(), // fund_load, bonus_sent, commission_earned, withdrawal
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  relatedId: integer("related_id"), // challengeId, eventId, transactionId
  relatedType: varchar("related_type"), // challenge, event, commission
  reference: varchar("reference"), // Paystack ref, withdrawal ref, etc.
  status: varchar("status").default("completed"), // pending, completed, failed
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily login streaks and rewards
export const dailyLogins = pgTable("daily_logins", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  date: timestamp("date").notNull(),
  streak: integer("streak").default(1),
  pointsEarned: integer("points_earned").default(50),
  claimed: boolean("claimed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Referral system with rewards
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: varchar("referrer_id").notNull(),
  referredId: varchar("referred_id").notNull(),
  code: varchar("code").notNull(),
  status: varchar("status").default("active"), // active, completed, expired
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin stories/status updates
export const stories = pgTable("stories", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("image_url"),
  backgroundColor: varchar("background_color").default("#6366f1"),
  textColor: varchar("text_color").default("#ffffff"),
  duration: integer("duration").default(15), // seconds
  viewCount: integer("view_count").default(0),
  category: varchar("category").default("general"), // announcement, update, tip, celebration, general
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Story views tracking
export const storyViews = pgTable("story_views", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull(),
  userId: varchar("user_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

// Referral reward tracking
export const referralRewards = pgTable("referral_rewards", {
  id: serial("id").primaryKey(),
  referralId: integer("referral_id").notNull(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // signup_bonus, activity_bonus
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI recommendation preferences and user settings
export const userPreferences = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  eventCategories: jsonb("event_categories"), // preferred categories
  riskLevel: varchar("risk_level").default("medium"), // low, medium, high
  notifications: jsonb("notifications"), // notification preferences
  privacy: jsonb("privacy"), // privacy settings
  appearance: jsonb("appearance"), // theme, compact view, language
  performance: jsonb("performance"), // auto refresh, sound effects, data usage
  regional: jsonb("regional"), // currency, timezone, locale
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User behavior tracking for AI
export const userInteractions = pgTable("user_interactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: varchar("type").notNull(), // view, click, bet, share
  entityType: varchar("entity_type").notNull(), // event, challenge, user
  entityId: varchar("entity_id").notNull(),
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  events: many(events, { relationName: "creator" }),
  eventParticipants: many(eventParticipants),
  eventMessages: many(eventMessages),
  challengesCreated: many(challenges, { relationName: "challenger" }),
  challengesReceived: many(challenges, { relationName: "challenged" }),
  friendRequestsSent: many(friends, { relationName: "requester" }),
  friendRequestsReceived: many(friends, { relationName: "addressee" }),
  followerRelationships: many(followers, { relationName: "followee" }),
  followingRelationships: many(followers, { relationName: "follower" }),
  achievements: many(userAchievements),
  notifications: many(notifications),
  transactions: many(transactions),
  dailyLogins: many(dailyLogins),
  referralsMade: many(referrals, { relationName: "referrer" }),
  referredBy: one(referrals, {
    fields: [users.referredBy],
    references: [referrals.referrerId],
    relationName: "referred"
  }),
  preferences: one(userPreferences),
  interactions: many(userInteractions),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  creator: one(users, {
    fields: [events.creatorId],
    references: [users.id],
    relationName: "creator"
  }),
  participants: many(eventParticipants),
  messages: many(eventMessages),
  pools: many(eventPools),
  activity: many(eventActivity),
  matches: many(eventMatches),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
  challengerUser: one(users, {
    fields: [challenges.challenger],
    references: [users.id],
    relationName: "challenger"
  }),
  challengedUser: one(users, {
    fields: [challenges.challenged],
    references: [users.id],
    relationName: "challenged"
  }),
  messages: many(challengeMessages),
  escrow: one(escrow),
}));

// Followers relations
export const followersRelations = relations(followers, ({ one }) => ({
  follower: one(users, {
    fields: [followers.followerId],
    references: [users.id],
    relationName: "follower"
  }),
  followee: one(users, {
    fields: [followers.followeeId],
    references: [users.id],
    relationName: "followee"
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    username: z.string().min(3, "Username must be at least 3 characters").optional(),
  });

// Auth specific schemas
export const loginSchema = z.object({
  emailOrUsername: z.string().min(1, "Please enter your email or username"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().min(3, "Username must be at least 3 characters").optional(),
  referralCode: z.string().optional(),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChallengeSchema = createInsertSchema(challenges).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertEventJoinRequestSchema = createInsertSchema(eventJoinRequests).omit({
  id: true,
  requestedAt: true,
  respondedAt: true,
});

// Platform settings table
export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  maintenanceMode: boolean("maintenance_mode").default(false),
  registrationEnabled: boolean("registration_enabled").default(true),
  minBetAmount: decimal("min_bet_amount", { precision: 10, scale: 2 }).default("100.00"),
  maxBetAmount: decimal("max_bet_amount", { precision: 10, scale: 2 }).default("100000.00"),
  platformFeePercentage: decimal("platform_fee_percentage", { precision: 3, scale: 1 }).default("5.0"),
  creatorFeePercentage: decimal("creator_fee_percentage", { precision: 3, scale: 1 }).default("3.0"),
  withdrawalEnabled: boolean("withdrawal_enabled").default(true),
  depositEnabled: boolean("deposit_enabled").default(true),
  maxWithdrawalDaily: decimal("max_withdrawal_daily", { precision: 10, scale: 2 }).default("50000.00"),
  maxDepositDaily: decimal("max_deposit_daily", { precision: 10, scale: 2 }).default("100000.00"),
  challengeCooldown: integer("challenge_cooldown").default(300), // seconds
  eventCreationEnabled: boolean("event_creation_enabled").default(true),
  chatEnabled: boolean("chat_enabled").default(true),
  maxChatLength: integer("max_chat_length").default(500),
  autoModeration: boolean("auto_moderation").default(true),
  welcomeMessage: text("welcome_message").default("Welcome to Bantah! Start creating events and challenges."),
  supportEmail: varchar("support_email").default("support@bantah.fun"),
  termsUrl: varchar("terms_url").default("/terms"),
  privacyUrl: varchar("privacy_url").default("/privacy"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Push subscriptions table for web push notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

// User recommendation profiles for personalized event suggestions  
export const userRecommendationProfiles = pgTable("user_recommendation_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  favoriteCategories: json("favorite_categories"), // ['crypto', 'sports', 'gaming']
  averageBetAmount: integer("average_bet_amount").default(0), // In coins
  preferredBetRange: json("preferred_bet_range"), // {min: 50, max: 500}
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00"), // Percentage
  totalEventsJoined: integer("total_events_joined").default(0),
  totalEventsWon: integer("total_events_won").default(0),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  engagementScore: decimal("engagement_score", { precision: 5, scale: 2 }).default("0.00"), // 0-100
  preferredEventTypes: json("preferred_event_types"), // ['prediction', 'poll', 'challenge']
  timePreferences: json("time_preferences"), // Activity patterns
  socialInteractions: integer("social_interactions").default(0), // Chat messages, reactions count
  riskProfile: varchar("risk_profile", { length: 50 }).default("moderate"), // conservative, moderate, aggressive
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Event recommendations for users
export const eventRecommendations = pgTable("event_recommendations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  eventId: integer("event_id").notNull(),
  recommendationScore: decimal("recommendation_score", { precision: 5, scale: 2 }).notNull(), // 0-100
  recommendationReason: varchar("recommendation_reason", { length: 255 }).notNull(), // category_match, amount_match, creator_history, etc
  matchFactors: json("match_factors"),
  isViewed: boolean("is_viewed").default(false),
  isInteracted: boolean("is_interacted").default(false), // Clicked, joined, or shared
  viewedAt: timestamp("viewed_at"),
  interactedAt: timestamp("interacted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User interaction tracking for recommendation learning
export const userEventInteractions = pgTable("user_event_interactions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  eventId: integer("event_id").notNull(),
  interactionType: varchar("interaction_type", { length: 50 }).notNull(), // view, like, share, join, comment, skip
  interactionValue: integer("interaction_value").default(1), // Weight of interaction (1-10)
  sessionId: varchar("session_id", { length: 255 }), // Track interaction sessions
  deviceType: varchar("device_type", { length: 50 }), // mobile, desktop, tablet
  referralSource: varchar("referral_source", { length: 100 }), // recommendation, search, trending, friend
  timeSpent: integer("time_spent").default(0), // Seconds spent viewing
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserRecommendationProfileSchema = createInsertSchema(userRecommendationProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventRecommendationSchema = createInsertSchema(eventRecommendations).omit({
  id: true,
  createdAt: true,
});

export const insertUserEventInteractionSchema = createInsertSchema(userEventInteractions).omit({
  id: true,
  createdAt: true,
});

// Push subscriptions relations
export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

// Recommendation relations
export const userRecommendationProfilesRelations = relations(userRecommendationProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userRecommendationProfiles.userId],
    references: [users.id],
  }),
}));

export const eventRecommendationsRelations = relations(eventRecommendations, ({ one }) => ({
  user: one(users, {
    fields: [eventRecommendations.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [eventRecommendations.eventId],
    references: [events.id],
  }),
}));

export const userEventInteractionsRelations = relations(userEventInteractions, ({ one }) => ({
  user: one(users, {
    fields: [userEventInteractions.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [userEventInteractions.eventId],
    references: [events.id],
  }),
}));

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Achievement = typeof achievements.$inferSelect;
export type Friend = typeof friends.$inferSelect;
export type Follower = typeof followers.$inferSelect;
export type EventParticipant = typeof eventParticipants.$inferSelect;
export type EventMessage = typeof eventMessages.$inferSelect;
export type ChallengeMessage = typeof challengeMessages.$inferSelect;
export type EventJoinRequest = typeof eventJoinRequests.$inferSelect;
export type UserRecommendationProfile = typeof userRecommendationProfiles.$inferSelect;
export type EventRecommendation = typeof eventRecommendations.$inferSelect;
export type UserEventInteraction = typeof userEventInteractions.$inferSelect;
export type InsertUserRecommendationProfile = z.infer<typeof insertUserRecommendationProfileSchema>;
// Payout job queue for batched processing
export const payoutJobs = pgTable("payout_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: integer("challenge_id").notNull(),
  totalWinners: integer("total_winners").notNull(),
  processedWinners: integer("processed_winners").default(0),
  totalPool: bigint("total_pool", { mode: "number" }).notNull(),
  platformFee: bigint("platform_fee", { mode: "number" }).notNull(),
  status: varchar("status").default("queued"), // queued, running, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

// Individual payout entries for batched processing
export const payoutEntries = pgTable("payout_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").notNull().references(() => payoutJobs.id),
  userId: varchar("user_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  status: varchar("status").default("pending"), // pending, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export type PayoutJob = typeof payoutJobs.$inferSelect;
export type InsertPayoutJob = typeof payoutJobs.$inferInsert;
export type PayoutEntry = typeof payoutEntries.$inferSelect;
export type InsertPayoutEntry = typeof payoutEntries.$inferInsert;

export type InsertEventRecommendation = z.infer<typeof insertEventRecommendationSchema>;
export type InsertUserEventInteraction = z.infer<typeof insertUserEventInteractionSchema>;
export type InsertEventJoinRequest = typeof eventJoinRequests.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type InsertMessageReaction = typeof messageReactions.$inferInsert;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;

// User preferences insert schema
export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
});