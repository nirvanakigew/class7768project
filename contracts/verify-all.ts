import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const CONTRACTS = [
  {
    name: "BantahPoints",
    address: "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB",
    constructorArgs: ["Bantah Points", "BPTS", "18", "1000000000000000000000000"], // 1M tokens
  },
  {
    name: "ChallengeEscrow",
    address: "0xC107f8328712998abBB2cCf559f83EACF476AE82",
    constructorArgs: [],
  },
  {
    name: "ChallengeFactory",
    address: "0xcE1D04A1830035Aa117A910f285818FF1AFca621",
    constructorArgs: [
      "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB", // BantahPoints
      "0xC107f8328712998abBB2cCf559f83EACF476AE82", // ChallengeEscrow
      "0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95", // Admin
      "0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95", // Platform Fee Recipient
    ],
  },
  {
    name: "PointsEscrow",
    address: "0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf",
    constructorArgs: [
      "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB", // BantahPoints
      "0xcE1D04A1830035Aa117A910f285818FF1AFca621", // ChallengeFactory
    ],
  },
];

async function verifyContract(contract: (typeof CONTRACTS)[0]) {
  console.log(`\n📋 Verifying ${contract.name}...`);

  try {
    const args = contract.constructorArgs.length > 0
      ? `--constructor-args ${contract.name}Args.js`
      : "";

    // Create constructor args file if needed
    if (contract.constructorArgs.length > 0) {
      const argsContent = `module.exports = ${JSON.stringify(contract.constructorArgs, null, 2)};`;
      fs.writeFileSync(`${contract.name}Args.js`, argsContent);
    }

    const cmd = `npx hardhat verify --network base-sepolia ${contract.address} ${
      contract.constructorArgs.length > 0
        ? `--constructor-args ${contract.name}Args.js`
        : ""
    }`;

    console.log(`Running: ${cmd}`);
    const result = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    console.log(`✅ ${contract.name} verified!`);
    console.log(result);

    // Clean up args file
    if (contract.constructorArgs.length > 0) {
      fs.unlinkSync(`${contract.name}Args.js`);
    }
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`ℹ️  ${contract.name} is already verified on BaseScan`);
    } else {
      console.error(`❌ Failed to verify ${contract.name}:`);
      console.error(error.message);
    }
  }
}

async function main() {
  console.log("🔍 Starting contract verification on Base Sepolia...\n");
  console.log(`API Key set: ${process.env.ETHERSCAN_API_KEY ? "YES ✅" : "NO ❌"}\n`);

  for (const contract of CONTRACTS) {
    await verifyContract(contract);
  }

  console.log("\n✅ Verification process complete!");
  console.log(`\n📊 Verify contracts at: https://sepolia.basescan.org`);
}

main().catch(console.error);
