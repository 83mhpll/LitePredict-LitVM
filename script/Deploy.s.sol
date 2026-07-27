// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/LitePredict.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        address operator = vm.envOr("OPERATOR_ADDRESS", address(0));
        
        address oracleAddress = 0x45dDa5d881BD2C917976CCfde74fFd6f6412da29; // LitVM Testnet DIA LTC/USD Adapter
        uint256 intervalSeconds = 300; // 5 minute rounds
        uint256 bufferSeconds = 30;    // 30 seconds buffer
        uint256 minBetAmount = 0.001 ether; // 0.001 zkLTC
        uint256 treasuryFee = 200;     // 2% fee

        if (deployerPrivateKey != 0) {
            vm.startBroadcast(deployerPrivateKey);
        } else {
            vm.startBroadcast();
        }

        // If operator address is not specified, use the deployer's address
        address finalOperator = operator == address(0) ? msg.sender : operator;

        LitePredict predictor = new LitePredict(
            oracleAddress,
            finalOperator,
            intervalSeconds,
            bufferSeconds,
            minBetAmount,
            treasuryFee
        );

        console.log("LitePredict deployed to:", address(predictor));
        console.log("Operator is:", finalOperator);
        console.log("Oracle address is:", oracleAddress);

        vm.stopBroadcast();
    }
}
