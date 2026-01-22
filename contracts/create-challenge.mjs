#!/usr/bin/env node
const ethers = require('ethers');
require('dotenv').config({ path: '../.env' });

const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.base.org";
const adminKey = process.env.ADMIN_PRIVATE_KEY;
const factoryAddr = process.env.VITE_CHALLENGE_FACTORY_ADDRESS;
const usdcAddr = "0x1c7d4b196cb0c7b01d743fbc6116a792bf68cf5d";

const FACTORY_ABI = [
  "function createP2PChallenge(address participant, address paymentToken, uint256 stakeAmount, uint256 pointsReward, string metadataURI) external returns (uint256)",
];

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

async function createChallenge() {
  console.log("🚀 Creating Open Challenge...\n");
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(adminKey, provider);
  
  console.log("📍 Admin:", wallet.address);
  console.log("📍 Factory:", factoryAddr);
  console.log("📍 USDC:", usdcAddr);
  
  const usdc = new ethers.Contract(usdcAddr, USDC_ABI, wallet);
  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, wallet);
  
  const stakeAmount = ethers.parseUnits("10", 6); // 10 USDC
  const pointsReward = 100;
  const participant = ethers.ZeroAddress;
  const metadata = "ipfs://QmOpenChallenge2026";
  
  try {
    console.log("\n⏳ Checking balance...");
    const balance = await usdc.balanceOf(wallet.address);
    console.log("✅ Balance:", ethers.formatUnits(balance, 6), "USDC");
    
    console.log("\n⏳ Approving USDC...");
    const approveTx = await usdc.approve(factoryAddr, stakeAmount);
    const approveRcp = await approveTx.wait();
    console.log("✅ Approved:", approveRcp.hash);
    
    console.log("\n⏳ Creating challenge...");
    const createTx = await factory.createP2PChallenge(
      participant,
      usdcAddr,
      stakeAmount,
      pointsReward,
      metadata
    );
    const createRcp = await createTx.wait();
    console.log("✅ Created:", createRcp.hash);
    console.log("\n🎉 Challenge Created!");
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

createChallenge();
