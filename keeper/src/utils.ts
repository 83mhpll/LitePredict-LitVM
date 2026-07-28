import { ethers } from "ethers";
import { CONFIG } from "./config";
import { sendAlert } from "./alerts";

/**
 * Execute a contract function with automatic gas estimation, retry logic,
 * and receipt confirmation.
 */
export async function executeWithRetry(
  fn: () => Promise<ethers.TransactionResponse>,
  label: string,
  retries = CONFIG.maxRetries
): Promise<ethers.TransactionReceipt | null> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[TX] Attempting ${label} (attempt ${attempt}/${retries})...`);
      const tx = await fn();
      console.log(`[TX] ${label} sent: ${tx.hash}`);

      const receipt = await tx.wait(1); // wait for 1 confirmation
      if (receipt && receipt.status === 1) {
        console.log(`[TX] ✅ ${label} confirmed in block ${receipt.blockNumber} | gas: ${receipt.gasUsed}`);
        await sendAlert(
          `✅ *${label}* confirmed\nTx: \`${tx.hash}\`\nBlock: ${receipt.blockNumber}`,
          "info"
        );
        return receipt;
      } else {
        throw new Error(`Transaction reverted: ${tx.hash}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[TX] ❌ ${label} attempt ${attempt} failed: ${message}`);

      // Don't retry on "too early" errors — these are expected
      if (message.includes("too early") || message.includes("not ready") || message.includes("genesis")) {
        console.log(`[TX] Skipping retry — condition not met yet.`);
        return null;
      }

      if (attempt === retries) {
        await sendAlert(`❌ *${label}* FAILED after ${retries} attempts\n\`${message}\``, "error");
        return null;
      }

      await delay(CONFIG.retryDelayMs * attempt); // exponential-ish backoff
    }
  }
  return null;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatEther(wei: bigint): string {
  return parseFloat(ethers.formatEther(wei)).toFixed(6);
}

export function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString();
}

export function secondsUntil(ts: bigint): number {
  return Math.max(0, Number(ts) - Math.floor(Date.now() / 1000));
}
