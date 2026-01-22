#!/bin/bash

# Load env
set -a
source ../.env
set +a

echo "🔍 Verifying contracts on Base Sepolia..."
echo ""

# BantahPoints (no constructor args)
echo "📋 [1/4] Verifying BantahPoints..."
npx hardhat verify --network base-sepolia 0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB --quiet
echo "✅ BantahPoints verified"
echo ""

# ChallengeEscrow (1 arg: ChallengeFactory)
echo "📋 [2/4] Verifying ChallengeEscrow..."
npx hardhat verify --network base-sepolia 0xC107f8328712998abBB2cCf559f83EACF476AE82 0xcE1D04A1830035Aa117A910f285818FF1AFca621 --quiet
echo "✅ ChallengeEscrow verified"
echo ""

# ChallengeFactory (4 args)
echo "📋 [3/4] Verifying ChallengeFactory..."
npx hardhat verify --network base-sepolia 0xcE1D04A1830035Aa117A910f285818FF1AFca621 \
  0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB \
  0xC107f8328712998abBB2cCf559f83EACF476AE82 \
  0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95 \
  0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95 --quiet
echo "✅ ChallengeFactory verified"
echo ""

# PointsEscrow (2 args)
echo "📋 [4/4] Verifying PointsEscrow..."
npx hardhat verify --network base-sepolia 0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf \
  0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB \
  0xcE1D04A1830035Aa117A910f285818FF1AFca621 --quiet
echo "✅ PointsEscrow verified"
echo ""

echo "🎉 All contracts verified!"
echo "📊 View at: https://sepolia.basescan.org"
