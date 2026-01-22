import * as ethers from 'ethers';

async function checkNonce() {
  const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
  const adminAddress = '0xb843A2D0D4B9E628500d2E0f6f0382e063C14a95';
  
  const nonce = await provider.getTransactionCount(adminAddress);
  const balance = await provider.getBalance(adminAddress);
  console.log(`Nonce for ${adminAddress}: ${nonce}`);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
}

checkNonce().catch(console.error);
