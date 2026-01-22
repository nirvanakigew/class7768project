/**
 * Contract Interaction Helpers
 * High-level functions for common blockchain operations
 */

import { ethers, Contract } from 'ethers';
import type { Signer } from 'ethers';
import { getBlockchainClient } from './client';

/**
 * Helper to get challenge details
 */
export async function getChallenge(challengeId: number) {
  const client = getBlockchainClient();
  try {
    const challenge = await client.challengeFactoryContract.getChallenge(challengeId);
    return {
      id: Number(challenge.id),
      type: challenge.challengeType === 0 ? 'ADMIN' : 'P2P',
      creator: challenge.creator,
      participant: challenge.participant,
      stakeAmount: challenge.stakeAmount.toString(),
      paymentToken: challenge.paymentToken,
      status: ['CREATED', 'ACTIVE', 'RESOLVED', 'CLAIMED', 'CANCELLED'][challenge.status],
      winner: challenge.winner,
      createdAt: new Date(Number(challenge.createdAt) * 1000),
      resolvedAt: challenge.resolvedAt > 0 ? new Date(Number(challenge.resolvedAt) * 1000) : null,
      metadataURI: challenge.metadataURI,
    };
  } catch (error) {
    console.error(`Failed to fetch challenge ${challengeId}:`, error);
    throw error;
  }
}

/**
 * Helper to create admin challenge
 */
export async function createAdminChallenge(
  stakeAmount: string,
  paymentToken: string,
  metadataURI: string,
  userSigner?: Signer
) {
  const client = getBlockchainClient();
  try {
    // For admin-created challenges, use the admin signer from the blockchain client
    // The admin is the contract owner and can create challenges on behalf of users
    const contract = client.getChallengeFactoryForWriting();
    
    // Convert stake amount to wei
    const stakeWei = ethers.parseUnits(stakeAmount, 6); // USDC/USDT are 6 decimals
    
    const tx = await contract.createAdminChallenge(
      stakeWei,
      paymentToken,
      metadataURI
    );

    const receipt = await tx.wait();
    
    // Extract challenge ID from event
    const event = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === 'ChallengeCreated');

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      challengeId: event ? Number(event.args.challengeId) : null,
    };
  } catch (error) {
    console.error('Failed to create admin challenge:', error);
    throw error;
  }
}

/**
 * Helper to create P2P challenge
 */
export async function createP2PChallenge(
  opponent: string,
  stakeAmount: string,
  paymentToken: string,
  metadataURI: string,
  userSigner: Signer
) {
  const client = getBlockchainClient();
  try {
    const contract = client.getChallengeFactoryForUser(userSigner);
    const stakeWei = ethers.parseUnits(stakeAmount, 6);

    const tx = await contract.createP2PChallenge(
      opponent,
      stakeWei,
      paymentToken,
      metadataURI
    );

    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log: any) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e: any) => e?.name === 'ChallengeCreated');

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      challengeId: event ? Number(event.args.challengeId) : null,
    };
  } catch (error) {
    console.error('Failed to create P2P challenge:', error);
    throw error;
  }
}

/**
 * Helper to join admin challenge
 */
export async function joinAdminChallenge(
  challengeId: number,
  side: boolean, // true = YES, false = NO
  userSigner: Signer
) {
  const client = getBlockchainClient();
  try {
    const contract = client.getChallengeFactoryForUser(userSigner);

    const tx = await contract.joinAdminChallenge(challengeId, side);
    const receipt = await tx.wait();

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      side: side ? 'YES' : 'NO',
    };
  } catch (error) {
    console.error(`Failed to join challenge ${challengeId}:`, error);
    throw error;
  }
}

/**
 * Helper to accept P2P challenge
 */
export async function acceptP2PChallenge(
  challengeId: number,
  userSigner: Signer
) {
  const client = getBlockchainClient();
  try {
    const contract = client.getChallengeFactoryForUser(userSigner);

    const tx = await contract.acceptP2PChallenge(challengeId);
    const receipt = await tx.wait();

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error(`Failed to accept challenge ${challengeId}:`, error);
    throw error;
  }
}

/**
 * Helper to claim payout
 */
export async function claimPayout(
  challengeId: number,
  userSigner: Signer
) {
  const client = getBlockchainClient();
  try {
    const contract = client.getChallengeFactoryForUser(userSigner);

    const tx = await contract.claimPayout(challengeId);
    const receipt = await tx.wait();

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error(`Failed to claim payout for challenge ${challengeId}:`, error);
    throw error;
  }
}

/**
 * Helper to get user's points balance
 */
export async function getUserPointsBalance(userAddress: string): Promise<string> {
  const client = getBlockchainClient();
  try {
    const balance = await client.pointsContract.getUserPointsBalance(userAddress);
    return ethers.formatUnits(balance, 18); // BPTS is 18 decimals
  } catch (error) {
    console.error(`Failed to get points balance for ${userAddress}:`, error);
    throw error;
  }
}

/**
 * Helper to get token balance
 */
export async function getTokenBalance(
  tokenAddress: string,
  userAddress: string
): Promise<string> {
  const client = getBlockchainClient();
  try {
    const token = new Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      client.getProvider()
    );
    const balance = await token.balanceOf(userAddress);
    return ethers.formatUnits(balance, 6); // USDC/USDT are 6 decimals
  } catch (error) {
    console.error(`Failed to get token balance for ${userAddress}:`, error);
    throw error;
  }
}

/**
 * Helper to approve token spending
 */
export async function approveToken(
  tokenAddress: string,
  spender: string,
  amount: string,
  userSigner: Signer
): Promise<string> {
  try {
    const token = new Contract(
      tokenAddress,
      ['function approve(address, uint256) returns (bool)'],
      userSigner
    );
    
    const amountWei = ethers.parseUnits(amount, 6);
    const tx = await token.approve(spender, amountWei);
    const receipt = await tx.wait();

    return receipt.transactionHash;
  } catch (error) {
    console.error(`Failed to approve token ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Helper to get challenge participants
 */
export async function getChallengeParticipants(challengeId: number) {
  const client = getBlockchainClient();
  try {
    const [yesParticipants, noParticipants] = await Promise.all([
      client.challengeFactoryContract.getYesParticipants(challengeId),
      client.challengeFactoryContract.getNoParticipants(challengeId),
    ]);

    return {
      yes: yesParticipants,
      no: noParticipants,
      totalParticipants: yesParticipants.length + noParticipants.length,
    };
  } catch (error) {
    console.error(`Failed to get participants for challenge ${challengeId}:`, error);
    throw error;
  }
}

/**
 * Helper to get user's locked stakes
 */
export async function getUserLockedStakes(userAddress: string): Promise<string> {
  const client = getBlockchainClient();
  try {
    const stakes = await client.challengeFactoryContract.getUserLockedStakes(userAddress);
    return ethers.formatUnits(stakes, 6); // USDC/USDT are 6 decimals
  } catch (error) {
    console.error(`Failed to get locked stakes for ${userAddress}:`, error);
    throw error;
  }
}

/**
 * Helper to estimate gas for challenge creation
 */
export async function estimateGasForChallenge(
  stakeAmount: string,
  paymentToken: string,
  metadataURI: string,
  userAddress: string
): Promise<string> {
  const client = getBlockchainClient();
  try {
    const stakeWei = ethers.parseUnits(stakeAmount, 6);
    
    const gasEstimate = await client.challengeFactoryContract.createAdminChallenge.estimateGas(
      stakeWei,
      paymentToken,
      metadataURI,
      { from: userAddress }
    );

    return ethers.formatUnits(gasEstimate, 0);
  } catch (error) {
    console.error('Failed to estimate gas:', error);
    throw error;
  }
}

export { ethers };

/**
 * Release locked stakes for a challenge on-chain using ChallengeEscrow contract
 * Admin signer must be owner or have permission to call releaseStakes
 */
export async function releaseStakesOnChain(challengeId: number, users: string[]) {
  const client = getBlockchainClient();
  try {
    const escrowAddress = process.env.VITE_CHALLENGE_ESCROW_ADDRESS || process.env.CONTRACT_ESCROW_ADDRESS;
    if (!escrowAddress) throw new Error('ChallengeEscrow contract address not configured');

    const abi = ['function releaseStakes(uint256,address[])'];
    const contract = new Contract(escrowAddress, abi, client.getAdminSigner());

    const tx = await contract.releaseStakes(challengeId, users);
    const receipt = await tx.wait();

    return {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : undefined,
    };
  } catch (error) {
    console.error('Failed to release stakes on-chain:', error);
    throw error;
  }
}
