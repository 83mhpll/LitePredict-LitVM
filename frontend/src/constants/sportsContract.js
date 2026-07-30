/* ── SportsMarket Contract Config ──
 * SPORTS_MARKET_ADDRESS starts empty (demo mode). Once you run
 * deploy_sports_litvm.sh, paste the deployed address below and the
 * frontend automatically switches from local-storage demo bets to
 * real on-chain markets - no other code changes needed.
 */
export const SPORTS_MARKET_ADDRESS = ""; // e.g. "0xAbC123..." after deploying

export const SPORTS_MARKET_ABI = [
  "function nextMarketId() view returns (uint256)",
  "function markets(uint256) view returns (string title, string homeTeam, string awayTeam, uint256 closeTime, uint256 homePool, uint256 awayPool, uint8 outcome, bool exists)",
  "function bet(uint256 marketId, uint8 side) payable",
  "function resolveMarket(uint256 marketId, uint8 outcome)",
  "function claim(uint256 marketId)",
  "function bets(uint256, address, uint8) view returns (uint256)",
  "function claimed(uint256, address) view returns (bool)",
];
