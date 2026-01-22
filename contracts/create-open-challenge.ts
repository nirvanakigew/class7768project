import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const CHALLENGE_FACTORY_ABI = [
  "function createP2PChallenge(address participant, address paymentToken, uint256 stakeAmount, uint256 pointsReward, string calldata metadataURI) external returns (uint256)",
  "function getChallenge(uint256 challengeId) external view returns (tuple(uint256 id, uint8 challengeType, address creator, address participant, address paymentToken, uint256 stakeAmount, uint256 pointsReward, uint8 status, address winner, uint256 createdAt, uint256 resolvedAt, string metadataURI) memory)",
  "event ChallengeCreatedP2P(uint256 indexed challengeId, address indexed creator, address indexed participant, address paymentToken, uint256 stakeAmount, uint256 pointsReward)",
];

const USDC_ABI = ["function approve(address spender, uint256 amount) external returns (bool)"];

async function main() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "https://sepolia.base.org";
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  const factoryAddress = process.env.VITE_CHALLENGE_FACTORY_ADDRESS?.toLowerCase();
  const usdcAddress = "0x1c7d4b196cb0c7b01d743fbc6116a792bf68cf5d".toLowerCase();

  if (!adminPrivateKey || !factoryAddress) {
    throw new Error("Missing required env variables");
  }

  console.log("🚀 Creating Open Challenge...\n");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(adminPrivateKey, provider);

  console.log(`📍 Admin Address: ${wallet.address}`);
  console.log(`📍 Factory Address: ${factoryAddress}`);
  console.log(`📍 USDC Address: ${usdcAddress}`);

  // Get USDC contract
  const usdc = new ethers.Contract(usdcAddress, USDC_ABI, wallet);
  const factory = new ethers.Contract(factoryAddress, CHALLENGE_FACTORY_ABI, wallet);

  // Challenge parameters
  const stakeAmount = ethers.parseUnits("10", 6); // 10 USDC
  const pointsReward = 100; // 100 points
  const participant = ethers.ZeroAddress; // Open challenge: address(0)
  const metadataURI = "ipfs://QmOpenChallenge2026";

  console.log("\n📋 Challenge Parameters:");
  console.log(`   Stake: ${ethers.formatUnits(stakeAmount, 6)} USDC`);
  console.log(`   Points Reward: ${pointsReward}`);
  console.log(`   Participant: ${participant} (Open - anyone can join)`);
  console.log(`   Metadata: ${metadataURI}`);

  try {
    // Step 1: Approve USDC transfer
    console.log("\n⏳ Step 1/3: Approving USDC...");
    const approveTx = await usdc.approve(factoryAddress, stakeAmount);
    const approveReceipt = await approveTx.wait();
    console.log(`   ✅ Approved. TX: ${approveReceipt?.hash}`);

    // Step 2: Create open challenge
    console.log("\n⏳ Step 2/3: Creating open challenge...");
    const createTx = await factory.createP2PChallenge(
      participant, // address(0) for open challenge
      usdcAddress,
      stakeAmount,
      pointsReward,
      metadataURI
    );

    const createReceipt = await createTx.wait();
    console.log(`   ✅ Created. TX: ${createReceipt?.hash}`);

    // Parse event to get challenge ID
    const eventLog = createReceipt?.logs[0];
    const event = factory.interface.parseLog(eventLog as any);
    const challengeId = event?.args?.[0];

    console.log(`   🎯 Challenge ID: ${challengeId}`);

    // Step 3: Verify challenge on-chain
    console.log("\n⏳ Step 3/3: Verifying challenge...");
    const challenge = await factory.getChallenge(challengeId);

    console.log(`\n✅ Challenge Created Successfully!\n`);
    console.log("📊 Challenge Details:");
    console.log(`   ID: ${challenge.id}`);
    console.log(`   Creator: ${challenge.creator}`);
    console.log(`   Participant: ${challenge.participant} (Open: anyone can accept)`);
    console.log(`   Stake: ${ethers.formatUnits(challenge.stakeAmount, 6)} USDC`);
    console.log(`   Points: ${challenge.pointsReward}`);
    console.log(`   Status: ${challenge.status} (0=CREATED, 1=ACTIVE, etc.)`);
    console.log(`   Created At: ${new Date(Number(challenge.createdAt) * 1000).toISOString()}`);

    console.log("\n💡 Next Steps:");
    console.log(`   1. Accept challenge from another wallet`);
    console.log(`   2. Resolve challenge via admin panel`);
    console.log(`   3. Verify winner payout\n`);

    // Save challenge info to file
    const challengeInfo = {
      challengeId: challengeId.toString(),
      creator: challenge.creator,
      participant: challenge.participant,
      stakeAmount: ethers.formatUnits(challenge.stakeAmount, 6),
      pointsReward: challenge.pointsReward.toString(),
      token: usdcAddress,
      createdAt: new Date(Number(challenge.createdAt) * 1000).toISOString(),
    };

    fs.writeFileSync("last-open-challenge.json", JSON.stringify(challengeInfo, null, 2));
    console.log("📁 Saved to: last-open-challenge.json");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.reason) console.error("   Reason:", error.reason);
    process.exit(1);
  }
}

main().catch(console.error);
