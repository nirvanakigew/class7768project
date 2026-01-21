# Referral System - Bantah Points Analysis

## Summary
✅ **YES - The referral system uses Bantah Points** (not the old points system)

---

## Current Implementation

### Referral Reward Amount
- **500 Bantah Points** per successful referral
- This is hardcoded in multiple places:
  - `/server/auth.ts` line 172: `const referrerBonus = 500; // Bantah Points for referring someone`
  - `/client/src/pages/ReferralNew.tsx` line 50: `const totalEarned = totalReferrals * 500; // 500 points per referral`
  - `/client/src/pages/ReferralPage.tsx` line 81: `const totalRewards = totalReferrals * 500; // 500 points per referral`

### How It Works

#### 1. **User Signs Up with Referral Code**
   - File: `/server/auth.ts` (lines 145-198)
   - When a new user registers with a referral code:
     ```typescript
     if (referrerUser) {
       const referrerBonus = 500; // Bantah Points for referring someone
       await storage.updateUserPoints(referrerUser.id, referrerBonus);
     }
     ```

#### 2. **Points Are Updated**
   - Function: `storage.updateUserPoints(referrerUser.id, referrerBonus)`
   - This updates the `user_points_ledgers` table (see below for schema)
   - **Points system used**: Bantah Points (not old points system)

#### 3. **Transaction Record Created**
   - Type: `referral_reward`
   - Amount: `500` (Bantah Points)
   - Description: `Referral bonus - 500 Bantah Points for [user] joining`

#### 4. **Notification Sent to Referrer**
   - Title: "🎉 Referral Success!"
   - Message: "You earned 500 Bantah Points"

---

## Database Schema

### Referrals Table
```sql
CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  referrer_id VARCHAR NOT NULL,
  referred_id VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active', -- active, completed, expired
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Referral Rewards Table
```sql
CREATE TABLE referral_rewards (
  id SERIAL PRIMARY KEY,
  referral_id INTEGER NOT NULL,
  user_id VARCHAR NOT NULL,
  type VARCHAR NOT NULL, -- signup_bonus, activity_bonus
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### User Points Ledger (Updated on Referral)
```sql
CREATE TABLE user_points_ledgers (
  user_id VARCHAR NOT NULL,
  points_balance DECIMAL(18, 2) NOT NULL,
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Key Files Involved

| File | Role | Points Used |
|------|------|------------|
| `/server/auth.ts` | Handles signup & referral logic | ✅ Bantah Points (500) |
| `/client/src/pages/ReferralNew.tsx` | Display referral UI (new design) | ✅ Bantah Points |
| `/client/src/pages/ReferralPage.tsx` | Display referral UI (old design) | ✅ Bantah Points |
| `/shared/schema.ts` | Database schema | Bantah Points tracking |
| `/server/routes/api-points.ts` | Points API endpoints | Bantah Points |

---

## UI Display

### Referral Reward Display
- **Text**: "Earn 500 Bantah Points when friends join using your link"
- **Location**: ReferralNew.tsx line 168
- **Visual**: Shows "500 Bantah Points Per Friend"

### Points Calculation
- `totalEarned = totalReferrals × 500 Bantah Points`
- Example: 10 referrals = 5,000 Bantah Points

---

## Related Systems

### Points Types (from Blockchain)
The system now uses **Bantah Points (BPTS)** - an ERC-20 token on Base Testnet Sepolia:
- Contract: `BantahPoints.sol`
- Symbol: `BPTS`
- Decimals: 18
- Used for challenge winnings and referrals
- Can be transferred, burned, and redeemed

### Points Leaderboard
- Tracked via `/api/points/leaderboard`
- Used for global rankings
- Same points used for referrals

---

## No "Old Points System" in Referrals

### What Was Removed/Changed
- The referral system does NOT use any old/legacy points system
- ALL referral rewards are in **Bantah Points** (the new blockchain-integrated system)
- No separate "referral coins" or "old points" - just Bantah Points

### Consistency
✅ Referral system uses same points as:
- Challenge winnings
- Daily streaks
- Achievement completion
- User wallet display

---

## Summary Answer

**Does the referral system use Bantah Points or old points?**

→ **Bantah Points (NEW SYSTEM)**
- 500 Bantah Points per referral
- Integrated with blockchain (ERC-20 BPTS token)
- Same points used across entire platform
- No old points system in referrals

