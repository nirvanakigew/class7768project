# Bantah Points Quick Reference

## Points Earning Summary

### Challenge Creation
- **Formula:** 50 + (stake amount in USD × 5)
- **Cap:** 500 points max
- **When:** On challenge creation
- **Examples:**
  - $1 challenge → 55 pts (50 + 5)
  - $10 challenge → 100 pts (50 + 50)
  - $100 challenge → 500 pts (capped, normally would be 550)

### Challenge Participation (Joining)
- **Formula:** 10 + (stake amount in USD × 4)
- **Cap:** 500 points max
- **When:** Immediately when user joins
- **Examples:**
  - $1 challenge → 14 pts (10 + 4)
  - $10 challenge → 50 pts (10 + 40)
  - $122.50 challenge → 500 pts (capped, normally would be 500)

### Challenge Win
- **Amount:** Determined by creator's stake (same as creation formula)
- **Cap:** 500 points max
- **When:** On admin resolution when challenge is won
- **Note:** Winner gets points based on challenge they created

### Referral
- **Amount:** 200 points (fixed)
- **Cap:** 200 points exactly
- **When:** When referred user completes sign-up
- **Frequency:** One-time per referred user

### Weekly Claiming
- **Mechanism:** Points visible real-time, claiming happens once per week
- **Window:** Every Sunday
- **Limit:** Can only claim once per week
- **Restriction:** If already claimed this week, must wait until next Sunday

---

## Implementation Files

| File | Change |
|------|--------|
| `/server/utils/points-calculator.ts` | NEW - Central calculation functions |
| `/server/auth.ts` | Updated referral from 500→200 pts |
| `/server/routes/api-challenges.ts` | Added creation & participation points |
| `/server/routes/api-admin-resolve.ts` | Updated to use stored pointsAwarded |
| `/server/routes/api-points.ts` | Added lastClaimedAt to response |
| `/client/src/pages/WalletPage.tsx` | Added weekly claim UI indicators |
| `/shared/schema-blockchain.ts` | Added lastClaimedAt field |
| `/migrations/0007_add_weekly_claiming.sql` | NEW - DB migration |

---

## Key Calculations

### Hard Cap Enforcement
```
creationPoints = Math.min(50 + (amount × 5), 500)
participationPoints = Math.min(10 + (amount × 4), 500)
```

### Weekly Claiming Eligibility
```
User can claim if:
  - Never claimed before, OR
  - Last claim was before current Sunday
```

### Next Claim Time
```
If never claimed: Next Sunday at 00:00
If claimed before: 7 days after last claim timestamp
```

---

## Database Schema

### user_points_ledgers Table
- `id` (serial, primary key)
- `userId` (varchar, unique)
- `pointsBalance` (bigint) - Current balance in wei
- `totalPointsEarned` (bigint) - Lifetime earned
- `totalPointsBurned` (bigint) - Lifetime burned
- `pointsLockedInEscrow` (bigint) - Locked in challenges
- **`lastClaimedAt` (timestamp)** - When user last claimed weekly
- `chainSyncedAt` (timestamp)
- `lastUpdatedAt` (timestamp)
- `createdAt` (timestamp)

### points_transactions Table
Transaction types:
- `challenge_joined` - User joined challenge (participation points)
- `earned_challenge` - User won challenge (creation points)
- `earned_referral` - Referral bonus
- Other transaction types...

---

## API Endpoints

### Get Points Balance
```
GET /api/points/balance/:userId
Response includes:
{
  "userId": "...",
  "balance": "500000000000000000",      // wei
  "balanceFormatted": "0.50",            // BPTS
  "lastClaimedAt": "2024-01-07T00:00:00Z", // Last claim or null
  "pointsBalance": 500000000000000000,
  // ... other ledger fields
}
```

### Resolve Challenge
```
POST /api/admin/challenges/resolve
Body:
{
  "challengeId": 123,
  "winner": "user-id",
  "pointsAwarded": 500  // optional, uses challenge.pointsAwarded if not provided
}
```

---

## Frontend Display

### Wallet Page - Bantah Points Card
Shows:
- Current points balance
- Weekly claim status:
  - ✓ "Ready to claim" (if eligible)
  - 📅 "Next claim in X days" (if already claimed)

### Calculation
```typescript
canClaimThisWeek = (lastClaimedAt) => {
  if (!lastClaimedAt) return true;
  const lastClaim = new Date(lastClaimedAt);
  const currentSunday = getThisSunday();
  return lastClaim < currentSunday;
};
```

---

## Testing Examples

### Test Case: $50 Challenge Creation
```
Setup: User creates challenge with $50 stake
Expected: Creator gets 50 + (50 × 5) = 300 points
Check: Challenge.pointsAwarded = 300
```

### Test Case: Weekly Claiming
```
Setup: 
  - User claims on Sunday 1/7
  - lastClaimedAt = 2024-01-07T00:00:00Z
On Monday 1/8: canClaim = false ✓
On Sunday 1/14: canClaim = true ✓
```

### Test Case: Referral
```
Setup: User signs up via referral code
Expected: Referrer gets exactly 200 points
Check: pointsTransaction.amount = 200 × 1e18 (wei)
```

---

## Troubleshooting

**Problem:** User sees 0 points
- Check: `pointsBalance` in database
- Check: User has entry in `user_points_ledgers`
- Action: Run `ensureUserPointsLedger(userId)` if missing

**Problem:** Claiming button disabled incorrectly
- Check: `lastClaimedAt` timestamp format
- Check: Current date and time
- Action: Verify backend time zone is UTC

**Problem:** Points not awarded on challenge join
- Check: Challenge has valid `stakeAmountWei`
- Check: `recordPointsTransaction` doesn't throw error
- Action: Check logs for "Failed to record participation points"

---

## Future Enhancements

Potential additions:
- Daily bonus points (small daily login bonus)
- Milestone achievements (100pts, 500pts, 1000pts badges)
- VIP multipliers (premium members get 1.5× points)
- Seasonal bonuses (double points during events)
- Leaderboard tiers with point requirements
- Points conversion to cash (exchange rate)
- Challenge difficulty multipliers
- Team bonuses (earn extra points in group challenges)
