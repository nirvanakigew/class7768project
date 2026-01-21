# Open Challenges Settlement Guide

## Overview
Open P2P challenges are now fully integrated with on-chain blockchain settlement on Base Sepolia (84532). This document explains how open challenges work and how admins settle them when disputes arise.

## Challenge Types & Settlement

### 1. **Direct P2P Challenges** (2 players, specific)
- **Settlement buttons**: Player1 (Challenger) | Player2 (Challenged) | Draw
- **On-chain**: Signs and posts to blockchain
- **Result format**: `challenger_won` | `challenged_won` | `draw`
- **Points awarded**: 50 + (amount × 5), MAX 500
- **Process**: Admin clicks winner button → On-chain settlement confirmation → TX hash recorded

### 2. **Admin-Created Challenges** (Betting pools)
- **Settlement buttons**: YES ✓ | NO ✗ | Draw
- **On-chain**: Signs and posts to blockchain
- **Result format**: `yes_won` | `no_won` | `draw`
- **Points awarded**: 50 + (amount × 5), MAX 500
- **Process**: Admin selects outcome → On-chain settlement → Points distributed to winners

### 3. **Open P2P Challenges** (First-to-accept)
- **Settlement buttons**: Player1 (First to Accept) | Player2 (Original) | Draw
- **On-chain**: Signs and posts to blockchain
- **Result format**: `challenger_won` | `challenged_won` | `draw`
- **Points awarded**: 50 + (amount × 5), MAX 500
- **Lifecycle**:
  1. User creates open challenge with initial stake
  2. First user to accept becomes Player2
  3. Both players have specific challenge details
  4. On completion → Settlement (with optional proof/evidence)

## Settlement Workflow

```
Challenge Completion
         ↓
Admin panel shows in "Pending Challenges"
         ↓
Admin clicks settlement button (type-specific)
         ↓
Confirmation dialog appears
┌─────────────────────────────┐
│ ⛓️ Blockchain Settlement     │
│ Base Sepolia (84532)         │
│                              │
│ Award [Winner] + [Points]    │
│                              │
│ [Confirm] [Cancel]           │
└─────────────────────────────┘
         ↓
Backend signs resolution on-chain
         ↓
Base Sepolia TX hash recorded
         ↓
Winner receives points
         ↓
Challenge marked: ⛓️ On-Chain (Settled)
```

## Dispute Resolution (NEW)

### When Users Dispute
- User submits proof/evidence in challenge chat
- Challenge status changes to `disputed`
- Admin sees in **Admin > Disputes** panel
- Admin reviews evidence and decides

### Admin Dispute Resolution
```
Admin Challenges > Disputes Tab
    ↓
View disputed challenge details
    ↓
Click "View Evidence" button
    ↓
Modal shows:
  - Challenge Evidence (original challenge details)
  - Dispute Evidence (user-submitted proof)
    ↓
Add Admin Notes explaining decision
    ↓
Click one of three buttons:
  - 🏆 Award Challenger (challenger_won)
  - 🏆 Award Challenged (challenged_won)  
  - 🤝 Refund Both (draw)
    ↓
⛓️ On-chain settlement executed
    ↓
TX hash recorded
    ↓
Challenge resolved with blockchain proof
```

## API Endpoints

### Settlement Endpoint
```
POST /api/admin/challenges/:id/result
Body: { result: 'yes_won' | 'no_won' | 'challenger_won' | 'challenged_won' | 'draw' }

Response:
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345,
  "pointsAwarded": 150,
  "chainId": 84532,
  "message": "Challenge settled on-chain"
}
```

### Disputes List Endpoint
```
GET /api/admin/challenges/disputes/list

Response:
{
  "total": 5,
  "disputes": [
    {
      "id": 123,
      "title": "Challenge Title",
      "status": "disputed",
      "challenger": "user1",
      "challenged": "user2",
      "disputeReason": "Evidence submitted",
      "evidence": {...},
      "disputeEvidence": {...}
    }
  ]
}
```

### Resolve Dispute Endpoint (NEW)
```
POST /api/admin/challenges/:id/resolve-dispute
Body: { 
  decision: 'challenger_won' | 'challenged_won' | 'draw',
  adminNotes: "Admin decision notes"
}

Response:
{
  "success": true,
  "transactionHash": "0x...",
  "blockNumber": 12345,
  "winner": "user1",
  "pointsAwarded": 150,
  "adminNotes": "Admin decision notes",
  "chainId": 84532,
  "message": "Dispute resolved on-chain"
}
```

## Database Schema Changes

### Challenge Fields (PostgreSQL)
```sql
-- Challenge status tracking
status: 'active' | 'completed' | 'disputed'

-- Blockchain tracking
onChainStatus: 'pending' | 'resolved'
blockchainResolutionTxHash: string (Base Sepolia TX)

-- Evidence & Disputes
evidence: JSONB (challenge details/proof)
disputeReason: string (why disputed)
disputed: boolean

-- Points
pointsAwarded: integer (BPTS earned)
onChainResolved: boolean

-- Settlement
result: 'challenger_won' | 'challenged_won' | 'draw' | 'yes_won' | 'no_won'
resolutionTimestamp: datetime
```

## Blockchain Integration

### Base Sepolia (Testnet)
- **Chain ID**: 84532
- **Contract**: ChallengeFactory (Base Sepolia)
- **Settlement Method**: Cryptographic signing + on-chain posting
- **Transaction Visibility**: https://sepolia.basescan.org/tx/{hash}

### Transaction Types
1. **Direct Resolution**: Admin settles challenge → Points awarded → TX posted
2. **Dispute Resolution**: Admin reviews proof → Awards winner → TX posted
3. **Draw/Refund**: Both players refunded → Points not awarded → TX posted

## Admin Panel UI

### Pending Challenges Tab
- Shows all unsettled challenges
- Buttons colored by type:
  - **Admin-created**: 🏊 Purple badge + YES/NO buttons
  - **P2P**: ⚔️ Cyan badge + Player name buttons
- Shows challenge details: Title, Stake, Players, Category

### Disputes Tab (NEW)
- Shows all challenged/disputed items
- Status: Disputed | Pending Resolution | Resolved
- Evidence viewer modal
- Admin notes field
- Three resolution buttons (Award/Award/Refund)
- On-chain status display

### Completed Challenges
- Shows settlement status: ⛓️ On-Chain
- Base Sepolia TX hash with BaseScan link
- Winner and points awarded
- Settlement timestamp

## Best Practices

1. **Before Settling**: Review all available evidence
2. **For Disputes**: Always add admin notes explaining decision
3. **Chain Status**: Always verify TX hash appears on BaseScan
4. **Points Tracking**: Confirm points awarded before marking complete
5. **Documentation**: Keep admin notes for transparency

## Common Scenarios

### Scenario 1: Open Challenge Completed Fairly
1. Admin sees open challenge in pending list
2. Clicks winner's name button
3. Confirms blockchain settlement
4. Challenge marked: ⛓️ On-Chain
5. Winner receives points

### Scenario 2: Open Challenge with Dispute
1. User submits proof in chat
2. Challenge status → `disputed`
3. Admin views in Disputes tab
4. Clicks "View Evidence" to see proof
5. Selects "Award Challenger" for on-chain settlement
6. TX hash recorded
7. Challenge resolved

### Scenario 3: Open Challenge - User Error
1. Admin reviews challenge details
2. Notes should have been different
3. Submits dispute resolution as "draw"
4. Both players refunded on-chain
5. Challenge resolved fairly

## Support

For issues with on-chain settlement:
1. Check TX hash on BaseScan
2. Verify chain ID (84532)
3. Review admin notes for context
4. Contact blockchain team if TX failed

---

**Last Updated**: Phase 4 - On-Chain Settlement Complete
**Status**: ✅ Open Challenges & Disputes - Fully On-Chain
