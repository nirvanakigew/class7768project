import hre from "hardhat";

// Contract addresses from deployment
const CONTRACTS = {
  BantahPoints: {
    address: "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB",
    args: [],
    contract: "src/BantahPoints.sol:BantahPoints",
  },
  ChallengeEscrow: {
    address: "0xC107f8328712998abBB2cCf559f83EACF476AE82",
    args: ["0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB"],
    contract: "src/ChallengeEscrow.sol:ChallengeEscrow",
  },
  ChallengeFactory: {
    address: "0xcE1D04A1830035Aa117A910f285818FF1AFca621",
    args: [
      "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB", // BantahPoints
      "0xC107f8328712998abBB2cCf559f83EACF476AE82", // ChallengeEscrow
      "0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95", // Admin
      "0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95", // Platform fee recipient
    ],
    contract: "src/ChallengeFactory.sol:ChallengeFactory",
  },
  PointsEscrow: {
    address: "0xCfAa7FCE305c26F2429251e5c27a743E1a0C3FAf",
    args: [
      "0x3Fc4Eb09540625A07AB7c485c8e2c03a0F15FDCB", // BantahPoints
      "0xcE1D04A1830035Aa117A910f285818FF1AFca621", // ChallengeFactory
    ],
    contract: "src/PointsEscrow.sol:PointsEscrow",
  },
};

async function main() {
  console.log("🔍 Verifying contracts on Base Sepolia...\n");

  for (const [name, contract] of Object.entries(CONTRACTS)) {
    try {
      console.log(`📝 Verifying ${name}...`);
      console.log(`   Address: ${contract.address}`);
      console.log(`   Args: ${JSON.stringify(contract.args)}`);

      await hre.run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.args,
        contract: contract.contract,
      });

      console.log(`✅ ${name} verified successfully!\n`);
    } catch (error: any) {
      if (error.message.includes("Already Verified")) {
        console.log(`ℹ️  ${name} is already verified\n`);
      } else {
        console.log(`❌ Error verifying ${name}:`);
        console.log(`   ${error.message}\n`);
      }
    }
  }

  console.log("✅ Verification complete!");
  console.log("\n📊 Verified Contracts:");
  console.log(`   BantahPoints: https://sepolia.basescan.org/address/${CONTRACTS.BantahPoints.address}`);
  console.log(`   ChallengeEscrow: https://sepolia.basescan.org/address/${CONTRACTS.ChallengeEscrow.address}`);
  console.log(`   ChallengeFactory: https://sepolia.basescan.org/address/${CONTRACTS.ChallengeFactory.address}`);
  console.log(`   PointsEscrow: https://sepolia.basescan.org/address/${CONTRACTS.PointsEscrow.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
