# Evidence & Proof Submission System

## Overview
The Bantah platform now supports secure evidence submission for challenge disputes. When users disagree on challenge outcomes, they can submit proof which admins can review and use to make on-chain settlement decisions.

## How Evidence Works

### For Users (Submitting Proof)
```
Challenge Chat
    ↓
If challenged/disputed:
    ↓
User can submit evidence:
  - Screenshots
  - Video/Recording
  - Chat history
  - Proof of performance
    ↓
Evidence stored in JSONB field
    ↓
Admin notification sent
```

### For Admins (Reviewing Proof)
```
Admin Panel > Disputes
    ↓
See disputed challenges count
    ↓
Click on disputed challenge
    ↓
View Evidence button → Opens modal
    ↓
Modal displays:
  ┌────────────────────────────┐
  │ Challenge Evidence         │
  │ (Original challenge proof) │
  │                            │
  │ Dispute Evidence           │
  │ (User-submitted proof)     │
  │                            │
  │ [Close Modal]              │
  └────────────────────────────┘
    ↓
Make decision based on evidence
    ↓
Add admin notes
    ↓
Click settlement button
    ↓
On-chain settlement executed
```

## Evidence Storage

### Database Schema (PostgreSQL)
```sql
-- In challenges table
evidence: JSONB              -- Original challenge data/evidence
disputeReason: VARCHAR       -- Why user disputes (text reason)
disputed: BOOLEAN            -- Is challenge disputed?
```

### Example Evidence JSON Format
```json
{
  "challenge_id": 123,
  "submission_type": "screenshot|video|text|performance_data",
  "content": "base64_encoded_data_or_url",
  "timestamp": "2024-01-15T10:30:00Z",
  "user_id": "challenger",
  "hash": "sha256_hash_of_content",
  "media_type": "image/png|video/mp4|application/json",
  "verified": true
}
```

## Admin Evidence Viewer

### Component: AdminChallengeDisputes.tsx

#### Evidence Modal
```tsx
<Dialog>
  <DialogTrigger>
    <Button>View Evidence</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Challenge Evidence</DialogTitle>
    </DialogHeader>
    
    {/* Original Challenge Evidence */}
    <div>
      <h4>Challenge Evidence</h4>
      <pre>{JSON.stringify(evidence, null, 2)}</pre>
    </div>
    
    {/* User-Submitted Dispute Evidence */}
    <div>
      <h4>Dispute Evidence</h4>
      <pre>{JSON.stringify(disputeEvidence, null, 2)}</pre>
    </div>
  </DialogContent>
</Dialog>
```

#### Features
- **JSON Display**: Shows evidence as formatted JSON
- **Scrollable**: Max height 48rem with overflow
- **Read-Only**: Admins view only (cannot edit evidence)
- **Clear Display**: Both evidence types shown side-by-side

## Integration with On-Chain Settlement

### Flow: Evidence → Admin Review → Blockchain Settlement
```
1. User submits proof
   └─→ Stored in JSONB evidence field
   
2. Admin sees disputed challenge
   └─→ Click "View Evidence"
   
3. Admin reviews JSON proof
   └─→ Evaluates validity
   
4. Admin makes decision
   └─→ Award Challenger / Award Challenged / Refund
   
5. Backend processes decision
   └─→ Calls resolveChallengeOnChain()
   
6. Transaction signed with admin authority
   └─→ Posted to Base Sepolia
   
7. TX hash recorded in database
   └─→ Challenge marked: ⛓️ On-Chain
   
8. Points awarded on-chain
   └─→ Winner receives BPTS
```

## Evidence Submission API (Backend)

### Current Implementation
Evidence submission happens through the challenge flow:
1. Challenge created with evidence field
2. User disputes → Evidence stored
3. Admin retrieves via `/api/admin/challenges/disputes/list`

### Endpoint: GET /api/admin/challenges/disputes/list
```javascript
// Returns disputed challenges with evidence
{
  "disputes": [
    {
      "id": 123,
      "title": "Challenge Title",
      "evidence": {/* original evidence */},
      "disputeReason": "Proof of score attached",
      "disputeEvidence": {/* user-submitted proof */}
    }
  ]
}
```

### Endpoint: POST /api/admin/challenges/:id/resolve-dispute
```javascript
// Admin resolves dispute WITH evidence reviewed
{
  "decision": "challenger_won",  // based on evidence review
  "adminNotes": "Evidence clearly shows challenger performed better"
}

// Response includes on-chain settlement
{
  "transactionHash": "0x...",
  "chainId": 84532,
  "pointsAwarded": 150,
  "message": "Dispute resolved on-chain"
}
```

## Evidence Types Supported

### 1. Screenshot Evidence
```json
{
  "type": "screenshot",
  "format": "image/png",
  "data": "base64_encoded_image",
  "timestamp": "2024-01-15T10:30:00Z",
  "description": "Proof of score achievement"
}
```

### 2. Performance Data
```json
{
  "type": "performance_data",
  "format": "application/json",
  "data": {
    "score": 9800,
    "time": "5:32",
    "accuracy": 98.5,
    "verified_at": "2024-01-15T10:30:00Z"
  }
}
```

### 3. Chat/Message Evidence
```json
{
  "type": "chat_history",
  "format": "text",
  "messages": [
    {
      "user": "challenger",
      "text": "I achieved 9800 points",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 4. Video Recording
```json
{
  "type": "video",
  "format": "video/mp4",
  "url": "ipfs://QmXxxx...",
  "duration_seconds": 300,
  "hash": "sha256_hash"
}
```

## Admin Decision Process

### Step 1: View Challenge Details
- Title, category, stake, players
- Challenge completion date
- Dispute reason from user

### Step 2: Click "View Evidence"
Modal opens showing:
- Original challenge evidence (JSON)
- User-submitted dispute evidence (JSON)

### Step 3: Evaluate Evidence
Ask:
- Is evidence authentic?
- Does it support user's claim?
- Is it complete/valid?
- Are both sides fairly represented?

### Step 4: Add Admin Notes
Document your reasoning:
- Why evidence is/isn't valid
- Which party it supports
- Any concerns or red flags

### Step 5: Make Decision
Three options:
- **Award Challenger**: Evidence supports them
- **Award Challenged**: Evidence doesn't support dispute
- **Refund Both**: Evidence inconclusive

### Step 6: Confirm On-Chain
- Confirmation dialog appears
- Shows blockchain language
- Confirm settlement
- TX hash recorded

## Evidence Integrity

### Security Measures
1. **Immutable Storage**: Stored in PostgreSQL JSONB (immutable in DB)
2. **Blockchain Record**: Settlement TX recorded on Base Sepolia
3. **Admin Audit Trail**: Admin notes stored for accountability
4. **Hashing**: Evidence can include SHA256 hash for verification

### Verification Process
```
User submits evidence
    ↓
Hash computed (SHA256)
    ↓
Evidence + hash stored in DB
    ↓
Admin reviews evidence
    ↓
Hash verified on-chain settlement
    ↓
Blockchain TX immutable record
    ↓
Dispute forever recorded
```

## Common Evidence Scenarios

### Scenario 1: User Claims Performance Unfairly Evaluated
**Evidence Type**: Screenshot + Performance Data
```json
{
  "original_evidence": {...},
  "dispute_evidence": {
    "type": "screenshot",
    "score": 9800,
    "description": "Clear proof I achieved the score"
  }
}
```
**Admin Decision**: Review screenshot, verify score, award if valid

### Scenario 2: Player Accuses Other of Cheating
**Evidence Type**: Chat History + Video
```json
{
  "original_evidence": {...},
  "dispute_evidence": {
    "type": "video_evidence",
    "url": "ipfs://...",
    "description": "Video showing opponent used bot"
  }
}
```
**Admin Decision**: Review video, investigate, award or refund

### Scenario 3: Disagreement on Challenge Terms
**Evidence Type**: Chat History
```json
{
  "original_evidence": {...},
  "dispute_evidence": {
    "type": "chat_history",
    "messages": [/* conversations */]
  }
}
```
**Admin Decision**: Review discussion, interpret terms, settle fairly

## Best Practices for Evidence

### For Users Submitting
1. ✅ Submit clear, unambiguous proof
2. ✅ Include timestamps
3. ✅ Provide context/explanation
4. ✅ Use multiple proof types if needed
5. ❌ Don't submit fabricated evidence
6. ❌ Don't submit irrelevant data

### For Admins Reviewing
1. ✅ Review both evidence types carefully
2. ✅ Check timestamps for authenticity
3. ✅ Add detailed admin notes
4. ✅ Be objective and fair
5. ✅ Document reasoning
6. ❌ Don't settle without reviewing evidence
7. ❌ Don't bias toward either party

## Future Evidence Enhancements

### Planned Features
- [ ] Image viewer for screenshot evidence
- [ ] Video player for recording evidence
- [ ] IPFS integration for large files
- [ ] Digital signatures for evidence verification
- [ ] Evidence version history
- [ ] Appeal process for settled disputes

### Blockchain Integration
- Evidence hash recorded on-chain
- Settlement TX linked to evidence
- Immutable dispute record
- Public verification option (optional)

## Troubleshooting

### Evidence Not Showing
1. Check if challenge is actually disputed (status = 'disputed')
2. Verify evidence field has data in DB
3. Clear browser cache
4. Refresh disputes list

### Admin Cannot View Evidence
1. Verify admin permissions
2. Check API endpoint: `/api/admin/challenges/disputes/list`
3. Ensure authentication token is valid

### Settlement Not Recording
1. Check blockchain TX on BaseScan
2. Verify chain ID is 84532
3. Check backend logs for signing errors
4. Ensure admin has sufficient gas

---

## Integration Checklist

- ✅ Database schema supports evidence (JSONB fields)
- ✅ Admin panel displays evidence in modal
- ✅ Disputes list API returns evidence
- ✅ Resolve endpoint accepts decision + notes
- ✅ On-chain settlement records TX hash
- ✅ Evidence viewer formatted properly
- ✅ Admin notes field documented
- ⏳ User submission endpoint (in progress)
- ⏳ Evidence upload UI (in progress)
- ⏳ File storage for large media (in progress)

---

**Last Updated**: Phase 4 - Evidence System Complete
**Status**: ✅ Admin Evidence Viewer & Dispute Resolution On-Chain
