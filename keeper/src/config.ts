import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

// ─── Contract ABI (subset needed by keeper) ───
export const LITE_PREDICT_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function genesisStartOnce() view returns (bool)",
  "function genesisLockOnce() view returns (bool)",
  "function intervalSeconds() view returns (uint256)",
  "function bufferSeconds() view returns (uint256)",
  "function rounds(uint256) view returns (uint256 epoch, uint256 startTimestamp, uint256 lockTimestamp, uint256 closeTimestamp, int256 lockPrice, int256 closePrice, uint256 totalAmount, uint256 bullAmount, uint256 bearAmount, uint256 rewardBaseCalData, uint256 rewardAmount, bool oracleCalled, bool cancelled)",
  "function genesisLockRound()",
  "function executeRound()",
  "function paused() view returns (bool)",
  "event StartRound(uint256 indexed epoch)",
  "event EndRound(uint256 indexed epoch, uint256 indexed roundId, int256 price)",
  "event CancelRound(uint256 indexed epoch)",
];

// ─── Config ───
export const CONFIG = {
  rpcUrl:          process.env["LITVM_RPC"]          ?? "https://liteforge.rpc.caldera.xyz/http",
  privateKey:      process.env["PRIVATE_KEY"]         ?? "",
  contractAddress: process.env["CONTRACT_ADDRESS"]    ?? "",
  telegramToken:   process.env["TELEGRAM_BOT_TOKEN"]  ?? "",
  telegramChatId:  process.env["TELEGRAM_CHAT_ID"]    ?? "",
  healthPort:      parseInt(process.env["HEALTH_PORT"] ?? "3030"),
  pollIntervalMs:  30_000,  // 30 seconds
  maxRetries:      3,
  retryDelayMs:    5_000,
  gasPremiumPct:   20,      // add 20% to estimated gas
};

// ─── RPC Provider with retry ───
export function createProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(CONFIG.rpcUrl, {
    chainId: 4441,
    name: "liteforge",
  });
}

export function createSigner(provider: ethers.JsonRpcProvider): ethers.Wallet {
  if (!CONFIG.privateKey) throw new Error("PRIVATE_KEY not set in .env");
  return new ethers.Wallet(CONFIG.privateKey, provider);
}

export function createContract(
  signer: ethers.Signer
): ethers.Contract {
  if (!CONFIG.contractAddress) throw new Error("CONTRACT_ADDRESS not set in .env");
  return new ethers.Contract(CONFIG.contractAddress, LITE_PREDICT_ABI, signer);
}

// ─── Types ───
export interface RoundInfo {
  epoch:          bigint;
  startTimestamp: bigint;
  lockTimestamp:  bigint;
  closeTimestamp: bigint;
  lockPrice:      bigint;
  closePrice:     bigint;
  totalAmount:    bigint;
  bullAmount:     bigint;
  bearAmount:     bigint;
  oracleCalled:   boolean;
  cancelled:      boolean;
}
