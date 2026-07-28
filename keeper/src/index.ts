import { createProvider, createSigner, createContract, CONFIG } from "./config";
import { executeWithRetry, delay, secondsUntil, formatEther } from "./utils";
import { sendAlert } from "./alerts";
import { startHealthServer, updateHealth } from "./health";

async function main() {
  console.log("[Keeper] Starting LitePredict Keeper Bot...");
  
  // ─── Initialize Express Health server ───
  startHealthServer();

  // ─── Setup Web3 Provider and Signer ───
  const provider = createProvider();
  const signer = createSigner(provider);
  const contract = createContract(signer);

  const address = await signer.getAddress();
  await sendAlert(`🚀 Bot started!\nAddress: \`${address}\`\nRPC: \`${CONFIG.rpcUrl}\``);

  while (true) {
    try {
      const timestamp = new Date().toISOString();
      updateHealth({ lastPollAt: timestamp });

      // Check balance
      const balance = await provider.getBalance(address);
      updateHealth({ walletBalance: formatEther(balance) });
      console.log(`[Keeper] [${timestamp}] Balance: ${formatEther(balance)} zkLTC`);

      if (balance === 0n) {
        await sendAlert("🚨 OUT OF FUNDS! Cannot execute transactions.", "error");
        updateHealth({ status: "error", errors: ["Out of funds"] });
        await delay(60_000); // Wait longer before checking again
        continue;
      }

      // Check pause state
      const isPaused = await contract.paused();
      if (isPaused) {
        console.log(`[Keeper] Contract is paused. Skipping...`);
        updateHealth({ status: "degraded", errors: ["Contract paused"] });
        await delay(CONFIG.pollIntervalMs);
        continue;
      }

      // Read contract states
      const epoch = await contract.currentEpoch();
      const genesisStarted = await contract.genesisStartOnce();
      const genesisLocked = await contract.genesisLockOnce();

      updateHealth({
        status: "ok",
        currentEpoch: Number(epoch),
        genesisReady: genesisStarted && genesisLocked,
        errors: [],
      });

      console.log(`[Keeper] Epoch: ${epoch} | genesisStart: ${genesisStarted} | genesisLock: ${genesisLocked}`);

      // ─────────────────────────────────────────────
      // Case 1: Genesis Start (Not run yet)
      // ─────────────────────────────────────────────
      if (!genesisStarted) {
        console.log(`[Keeper] Genesis round not started. Initiating genesisStartRound...`);
        const receipt = await executeWithRetry(
          () => contract.genesisStartRound(),
          "genesisStartRound"
        );
        if (receipt) updateHealth({ lastTxAt: new Date().toISOString() });
        await delay(10_000);
        continue;
      }

      // Fetch active round times
      const round = await contract.rounds(epoch);
      const startTimestamp = round.startTimestamp;
      const lockTimestamp = round.lockTimestamp;
      const closeTimestamp = round.closeTimestamp;

      // ─────────────────────────────────────────────
      // Case 2: Genesis Lock (Started but not locked)
      // ─────────────────────────────────────────────
      if (!genesisLocked) {
        const timeToLock = secondsUntil(lockTimestamp);
        console.log(`[Keeper] Genesis round #1 Lock in ${timeToLock} seconds...`);
        if (timeToLock <= 0) {
          const receipt = await executeWithRetry(
            () => contract.genesisLockRound(),
            "genesisLockRound"
          );
          if (receipt) updateHealth({ lastTxAt: new Date().toISOString() });
        }
        await delay(CONFIG.pollIntervalMs);
        continue;
      }

      // ─────────────────────────────────────────────
      // Case 3: Regular Execution
      // ─────────────────────────────────────────────
      const prevRound = await contract.rounds(epoch - 1n);
      const timeToClose = secondsUntil(prevRound.closeTimestamp);
      console.log(`[Keeper] Round #${epoch - 1n} closes in ${timeToClose} seconds...`);

      if (timeToClose <= 0) {
        const receipt = await executeWithRetry(
          () => contract.executeRound(),
          `executeRound #${epoch}`
        );
        if (receipt) updateHealth({ lastTxAt: new Date().toISOString() });
      }

      await delay(CONFIG.pollIntervalMs);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Keeper] Error in main loop:", errMsg);
      updateHealth({ status: "error", errors: [errMsg] });
      await sendAlert(`💥 Loop crash error:\n\`${errMsg}\``, "error");
      await delay(CONFIG.pollIntervalMs);
    }
  }
}

main().catch((err) => {
  console.error("[Keeper] Fatal startup error:", err);
  sendAlert(`💥 Fatal startup error:\n\`${err.message || err}\``, "error").then(() => {
    process.exit(1);
  });
});
