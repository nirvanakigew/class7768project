const ethers = require('ethers');

async function checkNonce() {
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const adminAddress = '0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95';
  
  const nonce = await provider.getTransactionCount(adminAddress);
  console.log(`Current nonce for ${adminAddress}: ${nonce}`);
}

checkNonce().catch(console.error);
