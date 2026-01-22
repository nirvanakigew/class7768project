#!/usr/bin/env node

/**
 * Deployment Script for Bantah On-Chain Challenges (FIXED NONCE VERSION)
 * Deploys all contracts to Base Testnet Sepolia with explicit nonce management
 * 
 * Usage: npx ts-node deploy-fixed.ts
 */

import * as ethers from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read contract ABIs
const readABI = (contractName: string): string => {
  let abiPath = path.join(__dirname, "artifacts", "src", `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(abiPath)) {
    abiPath = path.join(__dirname, "artifacts", `${contractName}.json`);
  }
  if (!fs.existsSync(abiPath)) {
    console.error(`⚠️  Contract ${contractName}.json not found. Have you compiled contracts?`);
    console.error(`Run: npx hardhat compile`);
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(abiPath, "utf-8"));
  return artifact.abi;
};

// Read compiled bytecode
const readBytecode = (contractName: string): string => {
  let artifactPath = path.join(__dirname, "artifacts", "src", `${contractName}.sol`, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    artifactPath = path.join(__dirname, "artifacts", `${contractName}.json`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  return artifact.bytecode;
};

async function deploy() {
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    console.error("❌ ADMIN_PRIVATE_KEY not set in environment");
    process.exit(1);
  }

  // Setup provider and signer
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(adminPrivateKey, provider);

  console.log("\n🚀 Deploying Bantah On-Chain Challenge System (FIXED NONCE)");
  console.log(`📍 Network: Base Testnet Sepolia (Chain ID: 84532)`);
  console.log(`👤 Deployer: ${wallet.address}`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.error("❌ No balance on deployer account. Get testnet ETH from faucet:");
    console.error("   https://www.alchemy.com/faucets/base-sepolia");
    process.exit(1);
  }

  // Get fresh nonce from RPC (not from wallet cache)
  let currentNonce = await provider.getTransactionCount(wallet.address);
  console.log(`📌 Starting nonce: ${currentNonce}\n`);

  try {
    // Step 1: Deploy BantahPoints
    console.log("📋 Step 1/5: Deploying BantahPoints.sol...");
    const pointsBytecode = readBytecode("BantahPoints");
    const pointsABI = readABI("BantahPoints");
    
    const pointsFactory = new ethers.ContractFactory(pointsABI, pointsBytecode, wallet);
    const pointsContract = await pointsFactory.deploy({ nonce: currentNonce++ });
    await pointsContract.waitForDeployment();
    const pointsAddress = await pointsContract.getAddress();
    console.log(`✅ BantahPoints deployed: ${pointsAddress}\n`);

    // Step 2: Deploy ChallengeEscrow (needed for ChallengeFactory)
    console.log("📋 Step 2/5: Deploying ChallengeEscrow.sol...");
    const challengeEscrowBytecode = readBytecode("ChallengeEscrow");
    const challengeEscrowABI = readABI("ChallengeEscrow");
    
    const challengeEscrowFactory = new ethers.ContractFactory(challengeEscrowABI, challengeEscrowBytecode, wallet);
    const challengeEscrow = await challengeEscrowFactory.deploy(wallet.address, { nonce: currentNonce++ });
    await challengeEscrow.waitForDeployment();
    const escrowAddress = await challengeEscrow.getAddress();
    console.log(`✅ ChallengeEscrow deployed: ${escrowAddress}\n`);

    // Step 3: Deploy ChallengeFactory
    console.log("📋 Step 3/5: Deploying ChallengeFactory.sol...");
    const factoryBytecode = readBytecode("ChallengeFactory");
    const factoryABI = readABI("ChallengeFactory");
    
    const factoryFactory = new ethers.ContractFactory(factoryABI, factoryBytecode, wallet);
    const platformFeeRecipient = wallet.address;
    const challengeFactory = await factoryFactory.deploy(
      pointsAddress,
      escrowAddress,
      wallet.address,
      platformFeeRecipient,
      { nonce: currentNonce++ }
    );
    await challengeFactory.waitForDeployment();
    const factoryAddress = await challengeFactory.getAddress();
    console.log(`✅ ChallengeFactory deployed: ${factoryAddress}\n`);

    // Step 3.5: Update ChallengeEscrow to point to the real factory
    console.log("📋 Updating ChallengeEscrow factory reference...");
    const challengeEscrowInstance = new ethers.Contract(escrowAddress, challengeEscrowABI, wallet);
    const setChallengeFactoryTx = await challengeEscrowInstance.setChallengeFactory(factoryAddress, { nonce: currentNonce++ });
    await setChallengeFactoryTx.wait();
    console.log(`✅ Updated ChallengeEscrow to use ChallengeFactory\n`);

    // Step 4: Deploy PointsEscrow
    console.log("📋 Step 4/5: Deploying PointsEscrow.sol...");
    const pointsEscrowBytecode = readBytecode("PointsEscrow");
    const pointsEscrowABI = readABI("PointsEscrow");
    
    const pointsEscrowFactory = new ethers.ContractFactory(pointsEscrowABI, pointsEscrowBytecode, wallet);
    const pointsEscrow = await pointsEscrowFactory.deploy(pointsAddress, factoryAddress, { nonce: currentNonce++ });
    await pointsEscrow.waitForDeployment();
    const pointsEscrowAddress = await pointsEscrow.getAddress();
    console.log(`✅ PointsEscrow deployed: ${pointsEscrowAddress}\n`);

    // Step 5: Setup permissions
    console.log("📋 Step 5/5: Setting up permissions...");
    const pointsContractInstance = new ethers.Contract(pointsAddress, pointsABI, wallet);
    const setManagerTx = await pointsContractInstance.setPointsManager(factoryAddress, { nonce: currentNonce++ });
    await setManagerTx.wait();
    console.log(`✅ Set ChallengeFactory as PointsManager\n`);

    // Output results
    const envContent = `
# Bantah On-Chain Challenge System - Base Testnet Sepolia (NEW DEPLOYMENT)
# Generated by deploy-fixed.ts

VITE_BASE_TESTNET_RPC=https://sepolia.base.org
VITE_CHAIN_ID=84532

# Smart Contracts
VITE_POINTS_CONTRACT_ADDRESS=${pointsAddress}
VITE_CHALLENGE_FACTORY_ADDRESS=${factoryAddress}
VITE_CHALLENGE_ESCROW_ADDRESS=${escrowAddress}
VITE_POINTS_ESCROW_ADDRESS=${pointsEscrowAddress}

# Tokens (Base Sepolia)
VITE_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b3566dA8860
VITE_USDT_ADDRESS=0x3c499c542cEF5E3811e1192ce70d8cC7d307B653

# Admin (for signing challenge resolutions)
ADMIN_PRIVATE_KEY=${adminPrivateKey}
ADMIN_ADDRESS=${wallet.address}

# Fallback env vars
CONTRACT_ESCROW_ADDRESS=${escrowAddress}
`;

    fs.writeFileSync(".env.base-sepolia-new", envContent);
    console.log("✅ Deployment Complete!\n");
    console.log("📄 Contract Addresses:");
    console.log(`   BantahPoints: ${pointsAddress}`);
    console.log(`   ChallengeFactory: ${factoryAddress}`);
    console.log(`   ChallengeEscrow: ${escrowAddress}`);
    console.log(`   PointsEscrow: ${pointsEscrowAddress}\n`);
    console.log("📝 Environment variables saved to .env.base-sepolia-new");
    console.log("💡 Next: Copy variables to .env and restart backend");
    
  } catch (error) {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  }
}

deploy();
