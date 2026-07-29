/* ── Contract Config ── */
export const LITE_PREDICT_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function rounds(uint256) view returns (uint256 epoch, uint256 startTimestamp, uint256 lockTimestamp, uint256 closeTimestamp, int256 lockPrice, int256 closePrice, uint256 totalAmount, uint256 bullAmount, uint256 bearAmount, uint256 rewardBaseCalData, uint256 rewardAmount, bool oracleCalled, bool cancelled)",
  "function userBets(uint256, address) view returns (uint8 position, uint256 amount, bool claimed)",
  "function betBull(uint256 epoch) payable",
  "function betBear(uint256 epoch) payable",
  "function claim(uint256[] epochs)",
  "function claimable(uint256 epoch, address user) view returns (bool)",
  "function executeRound()",
  "function intervalSeconds() view returns (uint256)",
  "function minBetAmount() view returns (uint256)",
  "function getUserRounds(address user) view returns (uint256[])",
  "function genesisStartOnce() view returns (bool)",
  "function genesisLockOnce() view returns (bool)",
  "function genesisLockRound()"
];

export const DEFAULT_CONTRACT = "0x32dDD87325e9fF3D522490ddb7c79F4c23744B01";
export const DIA_LTC_USD = "0x45dDa5d881BD2C917976CCfde74fFd6f6412da29";
export const LITVM_RPC = "https://liteforge.rpc.caldera.xyz/http";
export const LITVM_CHAIN_ID = 4441;
