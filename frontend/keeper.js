const { ethers } = require("ethers");

// ABI for keeper operations
const LITE_PREDICT_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function genesisStartOnce() view returns (bool)",
  "function genesisLockOnce() view returns (bool)",
  "function rounds(uint256) view returns (uint256 epoch, uint256 startTimestamp, uint256 lockTimestamp, uint256 closeTimestamp, int256 lockPrice, int256 closePrice, uint256 totalAmount, uint256 bullAmount, uint256 bearAmount, uint256 rewardBaseCalData, uint256 rewardAmount, bool oracleCalled, bool cancelled)",
  "function genesisLockRound()",
  "function executeRound()",
  "function oracleAddress() view returns (address)"
];

const MOCK_ORACLE_ABI = [
  "function setPrice(int256 price) external",
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

// Local node config
const RPC_URL = "http://127.0.0.1:8545";
// Anvil default account 0 private key (deployer / operator)
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; 
const CONTRACT_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"; // Default address deployed by DeployPOC

async function main() {
  console.log("Starting LitePredict Auto-Keeper POC Script...");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Verify connection
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`Connected to local Anvil node at block: ${blockNumber}`);
  } catch (err) {
    console.error("Error: Could not connect to local Anvil node. Make sure Anvil is running on port 8545.");
    process.exit(1);
  }

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`Keeper Address: ${wallet.address}`);

  const predictor = new ethers.Contract(CONTRACT_ADDRESS, LITE_PREDICT_ABI, wallet);
  
  // Get oracle address from contract
  const oracleAddr = await predictor.oracleAddress();
  const oracle = new ethers.Contract(oracleAddr, MOCK_ORACLE_ABI, wallet);
  console.log(`DIA Mock Oracle Address: ${oracleAddr}`);

  // Loop checking round status
  setInterval(async () => {
    try {
      const currentEpoch = Number(await predictor.currentEpoch());
      const genesisStart = await predictor.genesisStartOnce();
      const genesisLock = await predictor.genesisLockOnce();
      const block = await provider.getBlock("latest");
      const currentTimestamp = block.timestamp;

      console.log(`[Status] Epoch: ${currentEpoch} | Start: ${genesisStart} | Lock: ${genesisLock} | Time: ${currentTimestamp}`);

      if (!genesisStart) {
        console.log("Genesis round has not started. Please deploy or call genesisStartRound.");
        return;
      }

      if (genesisStart && !genesisLock) {
        // We are in the genesis round (epoch 1)
        const round1 = await predictor.rounds(1);
        const lockTime = Number(round1.lockTimestamp);
        
        if (currentTimestamp >= lockTime) {
          console.log(">>> Lock time reached for Genesis Round 1! Calling genesisLockRound()...");
          // Simulate some random price fluctuation for locked price
          const oldPriceBig = (await oracle.latestRoundData()).answer;
          const oldPrice = Number(oldPriceBig) / 1e18;
          const newPrice = oldPrice * (1 + (Math.random() * 0.04 - 0.02)); // +/- 2%
          console.log(`Adjusting Oracle Price: $${oldPrice.toFixed(2)} -> $${newPrice.toFixed(2)}`);
          await (await oracle.setPrice(ethers.parseEther(newPrice.toFixed(4)))).wait();

          const tx = await predictor.genesisLockRound();
          await tx.wait();
          console.log("Genesis Round 1 locked successfully!");
        } else {
          console.log(`Waiting for Genesis Round 1 lock in ${lockTime - currentTimestamp}s...`);
        }
      } else if (genesisLock) {
        // Standard round execution logic
        const epochToClose = currentEpoch - 1;
        const roundToClose = await predictor.rounds(epochToClose);
        const closeTime = Number(roundToClose.closeTimestamp);

        if (currentTimestamp >= closeTime) {
          console.log(`>>> Close time reached for Round ${epochToClose}! Calling executeRound()...`);
          
          // Simulate random price fluctuation for closing price
          const oldPriceBig = (await oracle.latestRoundData()).answer;
          const oldPrice = Number(oldPriceBig) / 1e18;
          const newPrice = oldPrice * (1 + (Math.random() * 0.04 - 0.02)); // +/- 2%
          console.log(`Adjusting Oracle Price: $${oldPrice.toFixed(2)} -> $${newPrice.toFixed(2)}`);
          await (await oracle.setPrice(ethers.parseEther(newPrice.toFixed(4)))).wait();

          const tx = await predictor.executeRound();
          await tx.wait();
          console.log(`Round ${epochToClose} closed & Round ${currentEpoch} locked successfully!`);
        } else {
          console.log(`Waiting for Round ${epochToClose} close in ${closeTime - currentTimestamp}s...`);
        }
      }
    } catch (err) {
      console.error("Keeper Error:", err.message);
    }
  }, 3000); // Check every 3 seconds
}

main();
