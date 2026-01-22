# Contract Verification Instructions

Your contracts have been deployed to Base Sepolia. Now they need to be verified on BaseScan for transparency.

## Deployed Contracts

| Contract | Address | 
|----------|---------|
| BantahPoints | `0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB` |
| ChallengeEscrow | `0xC107f8328712998abBB2cCf559f83EACF476AE82` |
| ChallengeFactory | `0xcE1D04A1830035Aa117A910f285818FF1AFca621` |
| PointsEscrow | `0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf` |

## Verification Method 1: Manual Web UI (Recommended)

### For each contract:

1. Go to: `https://sepolia.basescan.org/address/[CONTRACT_ADDRESS]#code`
2. Click **"Verify & Publish"** button
3. Fill in:
   - **Contract Address**: The address above
   - **Compiler Type**: Solidity (Single File)
   - **Compiler Version**: v0.8.20+commit.a35aead5
   - **Optimization**: Yes
   - **Optimization Runs**: 200
   - **Source Code**: Copy the entire `.sol` file from `contracts/src/`
   - **License Type**: MIT (12)

4. Verify the CAPTCHA and submit
5. Wait 1-5 minutes for verification to complete

## Verification Method 2: Hardhat CLI

If the web UI is slow, try:

```bash
cd /workspaces/class7768project/contracts

# BantahPoints
npx hardhat verify --network base-sepolia 0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB

# ChallengeEscrow (requires constructor arg)
npx hardhat verify --network base-sepolia 0xC107f8328712998abBB2cCf559f83EACF476AE82 0xcE1D04A1830035Aa117A910f285818FF1AFca621

# ChallengeFactory (requires 4 constructor args)
npx hardhat verify --network base-sepolia 0xcE1D04A1830035Aa117A910f285818FF1AFca621 \
  0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB \
  0xC107f8328712998abBB2cCf559f83EACF476AE82 \
  0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95 \
  0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95

# PointsEscrow (requires 2 constructor args)
npx hardhat verify --network base-sepolia 0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf \
  0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB \
  0xcE1D04A1830035Aa117A910f285818FF1AFca621
```

## Source Files

- **BantahPoints**: [contracts/src/BantahPoints.sol](./src/BantahPoints.sol)
- **ChallengeEscrow**: [contracts/src/ChallengeEscrow.sol](./src/ChallengeEscrow.sol)
- **ChallengeFactory**: [contracts/src/ChallengeFactory.sol](./src/ChallengeFactory.sol)
- **PointsEscrow**: [contracts/src/PointsEscrow.sol](./src/PointsEscrow.sol)

## Verification Status

Once verified, each contract will show:
- ✅ Source code on-chain
- ✅ ABI accessible for integrations
- ✅ Read/Write functions visible on BaseScan
- ✅ Transaction tracing enabled

## API Key

- **BaseScan API Key**: `Y8FSM4KAIQW5NSYUT2K7YXRJ8SYHHWPSAI`
- Configured in: `.env` → `ETHERSCAN_API_KEY`

## Links

- **BantahPoints**: https://sepolia.basescan.org/address/0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB
- **ChallengeEscrow**: https://sepolia.basescan.org/address/0xC107f8328712998abBB2cCf559f83EACF476AE82
- **ChallengeFactory**: https://sepolia.basescan.org/address/0xcE1D04A1830035Aa117A910f285818FF1AFca621
- **PointsEscrow**: https://sepolia.basescan.org/address/0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf

---

⏱️ Verification typically completes in 1-5 minutes after submission.
