// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/LitePredict.sol";
import "../test/LitePredict.t.sol"; // imports MockDiaOracle

contract DeployPOC is Script {
    function run() external {
        uint256 deployerPrivateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // Anvil default account 0
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock DIA Oracle
        MockDiaOracle mockOracle = new MockDiaOracle(85_000000000000000000); // Start LTC at $85

        // 2. Deploy LitePredict with 60-second intervals for fast local testing
        uint256 intervalSeconds = 60; // 1 minute rounds
        uint256 bufferSeconds = 5;    // 5 seconds buffer
        uint256 minBetAmount = 0.001 ether;
        uint256 treasuryFee = 200;    // 2% fee

        LitePredict predictor = new LitePredict(
            address(mockOracle),
            vm.addr(deployerPrivateKey), // Operator is deployer
            intervalSeconds,
            bufferSeconds,
            minBetAmount,
            treasuryFee
        );

        // 3. Initialize genesis rounds so the game is ready to play immediately!
        predictor.genesisStartRound();
        
        console.log("=== LOCAL POC DEPLOYMENT SUCCESS ===");
        console.log("MockDiaOracle deployed to:", address(mockOracle));
        console.log("LitePredict deployed to:", address(predictor));
        console.log("Deployer Address:", vm.addr(deployerPrivateKey));

        vm.stopBroadcast();
    }
}
