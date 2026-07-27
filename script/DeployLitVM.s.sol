// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/LitePredict.sol";

/// @title DeployLitVM - Deploy LitePredict to LitVM Testnet (LiteForge, Chain 4441)
/// @notice Uses DIA Oracle LTC/USD on LitVM Testnet
///
/// Usage:
///   forge script script/DeployLitVM.s.sol \
///     --rpc-url https://liteforge.rpc.caldera.xyz/http \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvvv
///
/// Set env:
///   export PRIVATE_KEY=0x<your_private_key>
///
/// Get testnet funds from: https://liteforge.hub.caldera.xyz
contract DeployLitVM is Script {

    // ─── LitVM Testnet Addresses (Chain ID: 4441) ───
    // DIA Oracle adapter for LTC/USD – deployed by LitVM team
    address constant DIA_LTC_USD_ORACLE = 0x45dDa5d881BD2C917976CCfde74fFd6f6412da29;

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer   = vm.addr(deployerPk);

        console.log("==============================================");
        console.log("  LitePredict - LitVM Testnet Deployment");
        console.log("==============================================");
        console.log("  Deployer:", deployer);
        console.log("  Oracle:  ", DIA_LTC_USD_ORACLE);
        console.log("  Chain:    LiteForge (4441)");

        vm.startBroadcast(deployerPk);

        // ─── Deploy LitePredict ───
        //   intervalSeconds = 300  (5-minute rounds)
        //   bufferSeconds   = 30   (30s buffer after lock for oracle update)
        //   minBetAmount    = 0.001 zkLTC
        //   treasuryFee     = 200  (2% = 200 bps)
        LitePredict predictor = new LitePredict(
            DIA_LTC_USD_ORACLE,
            deployer,          // operator  = deployer
            300,               // 5-minute rounds
            30,                // 30s buffer
            0.001 ether,       // 0.001 zkLTC minimum bet
            200                // 2% treasury fee
        );

        console.log("");
        console.log("  [OK] LitePredict deployed:", address(predictor));

        // ─── Start Genesis Round so users can bet immediately ───
        predictor.genesisStartRound();
        console.log("  [OK] Genesis round started - Round 1 is LIVE");

        vm.stopBroadcast();

        console.log("");
        console.log("==============================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("  Contract Address:", address(predictor));
        console.log("  Explorer: https://liteforge.explorer.caldera.xyz/address/", address(predictor));
        console.log("");
        console.log("  NEXT STEPS:");
        console.log("  1. Copy contract address above");
        console.log("  2. Update DEFAULT_CONTRACT in frontend/src/App.jsx");
        console.log("  3. Run: npm run dev in frontend/");
        console.log("  4. After 5 min: call genesisLockRound() then executeRound()");
        console.log("==============================================");
    }
}
