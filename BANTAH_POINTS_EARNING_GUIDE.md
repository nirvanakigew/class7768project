# Bantah Points - Complete Earning Guide

## All Actions That Grant Bantah Points

### 1. **Sign Up Bonus** ⭐
**Points Earned:** 1,000 Bantah Points

**When:** User creates a new account
**File:** `/server/auth.ts` (line 105)
**Code:**
```typescript
let bonusPoints = 1000; // Default signup bonus
```

**Details:**
- New users get 1,000 points automatically upon registration
- Added to `user.points` immediately
- Creates transaction record of type `signup_bonus`
- Notification type: `welcome_bonus`

---

### 2. **Referral Signup Bonus** 🎁
**Points Earned (Referrer):** 500 Bantah Points
**Points Earned (New User):** 1,500 Bantah Points

**When:** A new user signs up using a referral code
**File:** `/server/auth.ts` (lines 112, 172-198)

**For New User:**
```typescript
bonusPoints = 1500; // Bonus for being referred (instead of 1000)
```

**For Referrer:**
```typescript
const referrerBonus = 500; // Bantah Points for referring someone
await storage.updateUserPoints(referrerUser.id, referrerBonus);
```

**Details:**
- Referrer gets 500 additional points
- New user gets 500 extra points (1500 total instead of 1000)
- Updates `user_points_ledgers` table
- Transaction type: `referral_reward`
- Creates referral record
- Notifications sent to both users

---

### 3. **Challenge Win** 🏆
**Points Earned:** Variable (set at challenge creation)

**When:** User wins a challenge
**Files:** 
- `/contracts/src/ChallengeFactory.sol` (lines 315-320)
- `/server/routes/api-payouts.ts`

**On-Chain (Smart Contract):**
```solidity
// Award BantahPoints to winner
pointsToken.awardPoints(
    winner,
    pointsAwarded,
    challengeId,
    "challenge_win"
);
```

**Details:**
- Points amount defined when challenge is created
- Both Admin-created and P2P challenges award points
- Called during `resolveChallenge()` function
- Also updates `user_points_balance[user]` mapping on-chain
- Points awarded via ERC-20 token (BantahPoints contract)

---

### 4. **Daily Login Streak** 📅 (PLANNED/INFRASTRUCTURE READY)
**Points Earned:** TBD (mechanism ready but not fully implemented)

**When:** User logs in daily consecutively
**Files:** 
- `/shared/schema.ts` (loginStreaks table)
- `/server/auth.ts` (checkDailyLogin function)

**Infrastructure:**
```typescript
// Daily login tracking exists
await storage.checkDailyLogin(user.id);
```

**Details:**
- Database schema ready for tracking streaks
- Table: `login_streaks`
- Backend function exists but reward amount not configured
- UI ready to display streaks

---

### 5. **Achievement Unlock** 🎯 (INFRASTRUCTURE READY)
**Points Earned:** Variable per achievement (defined in DB)

**Files:**
- `/shared/schema.ts` (achievements, userAchievements tables)
- `/client/src/pages/PointsAndBadges.tsx` (displays achievementPointsReward)

**Database Schema:**
```typescript
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  icon: varchar("icon"),
  category: varchar("category"),
  pointsReward: integer("points_reward").default(0), // Points for this achievement
  // ... other fields
});
```

**Details:**
- System defined in schema but not fully connected to reward engine
- UI displays points per achievement
- Achievements tracked in `userAchievements` table
- Ready for integration with points system

---

## Database Schema - Points Tracking

### User Points Ledger
```sql
CREATE TABLE user_points_ledgers (
  user_id VARCHAR NOT NULL,
  points_balance DECIMAL(18, 2) NOT NULL,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Transactions
```sql
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL, -- signup_bonus, referral_reward, challenge_win, achievement_unlock
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  status VARCHAR DEFAULT 'completed', -- completed, pending
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Transaction Types Currently Used:
- `signup_bonus` - New user signup
- `referral_bonus` - Referral coins (not points, but tracked)
- `referral_reward` - Referrer's 500 points
- `challenge_win` - Challenge victory (on-chain)

---

## Points Display & Updates

### Wallet Page Updates
**File:** `/client/src/pages/WalletPage.tsx` (lines 389-393)
**How it displays Bantah Points:**
```tsx
<p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Bantah Points</p>
<h3 className="text-sm sm:text-xl font-bold text-amber-900 dark:text-amber-100">{currentPointsDisplay}</h3>
```

**API Endpoint:** `GET /api/points/balance/:userId`
- Returns current Bantah Points balance
- Updates from `user_points_ledgers` table
- Called when user visits wallet page

---

### Leaderboard Updates
**File:** `/client/src/pages/Leaderboard.tsx`
**API Endpoint:** `GET /api/points/leaderboard`

**Response includes:**
- User rank
- Total Bantah Points
- Points sorted descending
- Updated real-time from `user_points_ledgers`

**Details:**
- Global leaderboard shows all users by points
- Points from ALL earning actions combined
- Updated after each transaction

---

## Flow Diagram - How Points Get Updated

```
USER ACTION
    ↓
┌───────────────────────────────────────────┐
│ Signup / Referral / Challenge / Achievement│
└───────────────────────────────────────────┘
    ↓
BACKEND PROCESSES
    ├─ storage.updateUserPoints() 
    │  ├─ Updates `user_points_ledgers.points_balance`
    │  └─ Creates transaction record
    │
    ├─ On Smart Contract (Challenges)
    │  ├─ pointsToken.awardPoints() (ERC-20)
    │  └─ Updates userPointsBalance mapping
    │
    └─ Create Notification + Transaction Log
    ↓
DATABASE UPDATED
    ├─ `user_points_ledgers` table
    ├─ `transactions` table
    ├─ `referrals` table (if referral)
    └─ `leaderboard` view (cached)
    ↓
FRONTEND DISPLAYS
    ├─ Wallet Page: Fresh balance from /api/points/balance/:userId
    ├─ Leaderboard: Updated rank from /api/points/leaderboard
    ├─ Profile: Achievement badges with points
    └─ Notifications: Real-time popup notification
```

---

## API Endpoints for Points

### Check Balance
```
GET /api/points/balance/:userId

Response:
{
  "userId": "user123",
  "balance": 5500,
  "lastUpdated": "2026-01-21T10:30:00Z"
}
```

### Get Leaderboard
```
GET /api/points/leaderboard?limit=100&offset=0

Response:
[
  {
    "rank": 1,
    "userId": "user456",
    "username": "TopPlayer",
    "points": 25000,
    "level": 15,
    "avatar": "..."
  },
  ...
]
```

### Get Transaction History
```
GET /api/points/history/:userId

Response:
[
  {
    "id": 1,
    "type": "challenge_win",
    "amount": 500,
    "description": "Won challenge #123",
    "createdAt": "2026-01-21T09:15:00Z"
  },
  ...
]
```

---

## Summary Table - All Points Earning Actions

| Action | Points | When | File | Status |
|--------|--------|------|------|--------|
| **Sign Up** | 1,000 | Account creation | auth.ts | ✅ Active |
| **Referral (Referrer)** | 500 | New user via referral code | auth.ts | ✅ Active |
| **Referral (New User)** | +500 (1,500 total) | Sign up with referral code | auth.ts | ✅ Active |
| **Challenge Win** | Variable | Challenge resolved, user wins | ChallengeFactory.sol | ✅ Active |
| **Daily Login Streak** | TBD | Consecutive daily logins | schema.ts | 🔧 Ready (Not Configured) |
| **Achievement Unlock** | Variable | Achievement earned | schema.ts | 🔧 Ready (Not Integrated) |

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `/server/auth.ts` | Signup & referral points logic |
| `/server/routes/api-points.ts` | Points endpoints (balance, leaderboard, history) |
| `/contracts/src/ChallengeFactory.sol` | Challenge win points awards |
| `/contracts/src/BantahPoints.sol` | ERC-20 points token |
| `/shared/schema.ts` | Database schema for points tracking |
| `/client/src/pages/WalletPage.tsx` | Display wallet points |
| `/client/src/pages/Leaderboard.tsx` | Display leaderboard |
| `/server/blockchain/db-utils.ts` | `updateUserPointsBalance()` function |

---

## YES - Points Update Across All Pages

✅ **Wallet Page** - Shows live Bantah Points balance
✅ **Leaderboard** - Ranks users by total Bantah Points
✅ **Profile Page** - Shows achievements with points rewards
✅ **Notifications** - Real-time alerts when points earned
✅ **Transaction History** - All points earning tracked

**All systems use the same `user_points_ledgers` table as the source of truth**

