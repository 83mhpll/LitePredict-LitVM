// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/SportsMarket.sol";

/// @title DeploySportsMarket - Deploy SportsMarket to LitVM Testnet (LiteForge, Chain 4441)
/// @notice Deploys the contract and seeds it with real upcoming NFL preseason games
///         so there's something live to bet on immediately after deploy.
///
/// Usage:
///   forge script script/DeploySportsMarket.s.sol \
///     --rpc-url https://liteforge.rpc.caldera.xyz/http \
///     --broadcast \
///     --private-key $PRIVATE_KEY \
///     -vvvv
///
/// Set env:
///   export PRIVATE_KEY=0x<your_private_key>
///
/// Get testnet funds from: https://liteforge.hub.caldera.xyz
contract DeploySportsMarket is Script {

    function run() external {
        uint256 deployerPk = vm.envUint("PRIVATE_KEY");
        address deployer   = vm.addr(deployerPk);

        console.log("==============================================");
        console.log("  SportsMarket - LitVM Testnet Deployment");
        console.log("==============================================");
        console.log("  Deployer / resolver:", deployer);
        console.log("  Chain:    LiteForge (4441)");

        vm.startBroadcast(deployerPk);

        // Deployer is also the resolver for now (same trust model as the
        // keeper bot pattern already used for LitePredict). Move this to a
        // multisig before handling real funds - see notes at the bottom of
        // SportsMarket.sol.
        SportsMarket market = new SportsMarket(deployer);
        console.log("");
        console.log("  [OK] SportsMarket deployed:", address(market));

        // ─── Seed real upcoming NFL preseason games ───
        // Timestamps below are the actual scheduled kickoff times (UTC).
        uint256 hofGame = market.createMarket(
            "CAR @ ARI - Hall of Fame Game",
            "Arizona Cardinals",
            "Carolina Panthers",
            1786060800 // 2026-08-07 00:00 UTC (adjust if this drifts before you run it)
        );
        console.log("  [OK] Market created: CAR @ ARI, id =", hofGame);

        uint256 preseasonGame1 = market.createMarket(
            "DET @ CIN - Preseason Wk 1",
            "Cincinnati Bengals",
            "Detroit Lions",
            1786748400 // 2026-08-14 23:00 UTC
        );
        console.log("  [OK] Market created: DET @ CIN, id =", preseasonGame1);

        uint256 preseasonGame2 = market.createMarket(
            "IND @ NE - Preseason Wk 1",
            "New England Patriots",
            "Indianapolis Colts",
            1786750200 // 2026-08-14 23:30 UTC
        );
        console.log("  [OK] Market created: IND @ NE, id =", preseasonGame2);

        vm.stopBroadcast();

        console.log("");
        console.log("==============================================");
        console.log("  DEPLOYMENT COMPLETE");
        console.log("==============================================");
        console.log("  Contract Address:", address(market));
        console.log("  Explorer: https://liteforge.explorer.caldera.xyz/address/", address(market));
        console.log("");
        console.log("  NEXT STEPS:");
        console.log("  1. Copy the contract address above");
        console.log("  2. Put it in frontend/src/constants/sportsContract.js as SPORTS_MARKET_ADDRESS");
        console.log("  3. Start the oracle keeper: node keeper/sports-oracle-keeper.js");
        console.log("     (needs SPORTS_MARKET_ADDRESS + RESOLVER_PRIVATE_KEY env vars set)");
        console.log("  4. Run: npm run dev in frontend/ and check the Sports tab");
        console.log("==============================================");
    }
}
