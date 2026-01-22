import { pool } from '../db';
import { NotificationService, NotificationEvent, NotificationChannel, NotificationPriority } from '../notificationService';
import { releaseStakesOnChain } from '../blockchain/helpers';
import { logBlockchainTransaction } from '../blockchain/db-utils';

const notificationService = new NotificationService();

export async function runExpiryPass() {
  const now = new Date().toISOString();
  try {
    // 1) Cancel unaccepted P2P challenges (pending and not admin-created) whose due_date has passed
    const cancelResult = await pool.query(
      `UPDATE challenges SET status='cancelled', on_chain_status='cancelled', completed_at=now() WHERE status='pending' AND admin_created = false AND due_date <= $1 RETURNING id, challenger, challenged, title`,
      [now]
    );

    for (const row of cancelResult.rows) {
      try {
        // Attempt to release any locked escrows for this challenge on-chain
        try {
          // Find locked escrow records and their primary wallet addresses
          const escrowRows = await pool.query(
            `SELECT e.id as escrow_id, e.user_id, e.token_address, u.wallet_address
             FROM challenge_escrow_records e
             LEFT JOIN user_wallet_addresses u ON u.user_id = e.user_id AND u.is_primary = true
             WHERE e.challenge_id = $1 AND e.status = 'locked'`,
            [row.id]
          );

          const addresses = escrowRows.rows.map((r: any) => r.wallet_address).filter(Boolean);
          if (addresses.length > 0) {
            const tx = await releaseStakesOnChain(row.id, addresses).catch(err => {
              console.warn('On-chain release failed for challenge', row.id, err?.message || err);
              return null;
            });

            if (tx) {
              // Update escrow records to released with tx hash
              await pool.query(
                `UPDATE challenge_escrow_records SET status='released', release_tx_hash=$2, released_at=now() WHERE challenge_id=$1 AND status='locked'`,
                [row.id, tx.transactionHash]
              );

              // Log blockchain transaction
              const chainId = Number(process.env.BLOCKCHAIN_CHAIN_ID || process.env.VITE_CHAIN_ID || 84532);
              await logBlockchainTransaction({
                chainId,
                transactionHash: tx.transactionHash,
                blockNumber: tx.blockNumber,
                transactionType: 'escrow_release',
                contractAddress: process.env.VITE_CHALLENGE_ESCROW_ADDRESS || process.env.CONTRACT_ESCROW_ADDRESS || '',
                contractName: 'ChallengeEscrow',
                fromAddress: process.env.ADMIN_ADDRESS || '',
                toAddress: '',
                functionName: 'releaseStakes',
                parameters: JSON.stringify({ challengeId: row.id, users: addresses }),
                status: 'success',
                gasUsed: tx.gasUsed ? BigInt(tx.gasUsed) : BigInt(0),
                challengeId: row.id,
              }).catch(() => {});
            } else {
              // Fallback: mark DB escrows released (off-chain) so users can be credited via internal flow
              await pool.query(`UPDATE challenge_escrow_records SET status='released', released_at=now() WHERE challenge_id=$1 AND status='locked'`, [row.id]);

              // --- DB-offchain refund: credit users' balances and create transaction records ---
              try {
                const lockedEscrows = await pool.query(
                  `SELECT id, user_id, amount_escrowed, token_address FROM challenge_escrow_records WHERE challenge_id=$1 AND status='released'`,
                  [row.id]
                );

                for (const e of lockedEscrows.rows) {
                  try {
                    // amount_escrowed stored as bigint (smallest unit, 6 decimals for USDC/USDT)
                    const amountSmall = BigInt(e.amount_escrowed || 0);
                    const amountDecimal = Number(amountSmall) / 1e6; // convert to token units

                    // Update user balance (fallback credit in app currency)
                    await pool.query(
                      `UPDATE users SET balance = COALESCE(balance, 0) + $1 WHERE id = $2`,
                      [amountDecimal.toFixed(2), e.user_id]
                    );

                    // Insert transaction record
                    await pool.query(
                      `INSERT INTO transactions (user_id, type, amount, description, related_id, status, created_at)
                       VALUES ($1, $2, $3, $4, $5, $6, now())`,
                      [
                        e.user_id,
                        'challenge_refund',
                        amountDecimal.toFixed(2),
                        `Auto-refund for cancelled challenge ${row.id}`,
                        row.id,
                        'completed',
                      ]
                    );
                  } catch (innerErr) {
                    console.warn('Failed to credit user for escrow', e.id, innerErr?.message || innerErr);
                  }
                }
              } catch (creditErr) {
                console.warn('Failed to perform DB refunds for challenge', row.id, creditErr?.message || creditErr);
              }
            }
          }
        } catch (err) {
          console.warn('Error attempting escrow release for challenge', row.id, err?.message || err);
          // As fallback, mark DB escrows released to avoid locking forever
          await pool.query(`UPDATE challenge_escrow_records SET status='released', released_at=now() WHERE challenge_id=$1 AND status='locked'`, [row.id]);
        }
        // Notify challenger
        if (row.challenger) {
          await notificationService.send({
            userId: row.challenger,
            challengeId: String(row.id),
            event: NotificationEvent.CHALLENGE_CANCELLED,
            title: `Challenge cancelled`,
            body: `Your P2P challenge "${row.title}" was automatically cancelled because it was not accepted in time.`,
            channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
            priority: NotificationPriority.HIGH,
            data: { challengeId: row.id }
          }).catch(() => {});
        }

        // Notify challenged if present
        if (row.challenged) {
          await notificationService.send({
            userId: row.challenged,
            challengeId: String(row.id),
            event: NotificationEvent.CHALLENGE_CANCELLED,
            title: `Challenge expired`,
            body: `A P2P challenge directed at you ("${row.title}") was cancelled because it was not accepted in time.`,
            channels: [NotificationChannel.IN_APP],
            priority: NotificationPriority.MEDIUM,
            data: { challengeId: row.id }
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Failed to notify about cancelled challenge', row.id, err?.message || err);
      }
    }

    // 2) For admin-created group challenges, when due_date passes mark them pending admin resolution
    const adminResult = await pool.query(
      `UPDATE challenges SET status='pending_admin' WHERE admin_created = true AND due_date <= $1 AND status NOT IN ('completed','cancelled','pending_admin') RETURNING id, challenger, title`,
      [now]
    );

    for (const row of adminResult.rows) {
      try {
        // Notify admins (broadcast to system admin channel) - send to creator as well
        if (row.challenger) {
          await notificationService.send({
            userId: row.challenger,
            challengeId: String(row.id),
            event: NotificationEvent.CHALLENGE_ENDED,
            title: `Group challenge ended`,
            body: `Your group challenge "${row.title}" has reached its end date and awaits resolution.`,
            channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
            priority: NotificationPriority.HIGH,
            data: { challengeId: row.id }
          }).catch(() => {});
        }

      } catch (err) {
        console.warn('Failed to notify about admin-ended challenge', row.id, err?.message || err);
      }
    }

    return { cancelled: cancelResult.rowCount || 0, adminMarked: adminResult.rowCount || 0 };
  } catch (error: any) {
    console.error('Error running expiry pass:', error?.message || error);
    throw error;
  }
}

export function startExpiryScheduler(intervalMs = 5 * 60 * 1000) {
  // Run once immediately
  runExpiryPass().catch(() => {});
  // Schedule periodic passes
  setInterval(() => {
    runExpiryPass().catch(() => {});
  }, intervalMs);
}

export default { runExpiryPass, startExpiryScheduler };
