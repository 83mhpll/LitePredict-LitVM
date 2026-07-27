// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/LitePredict.sol";
import "../src/interfaces/IDiaOracle.sol";

contract MockDiaOracle is IDiaOracle {
    int256 private _price;
    uint256 private _updatedAt;

    constructor(int256 price) {
        _price = price;
        _updatedAt = block.timestamp;
    }

    function setPrice(int256 price) external {
        _price = price;
        _updatedAt = block.timestamp;
    }

    function setTimestamp(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }

    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, _price, _updatedAt, _updatedAt, 1);
    }
}

contract LitePredictTest is Test {
    LitePredict public predictor;
    MockDiaOracle public mockOracle;

    address public admin = address(0xAD);
    address public operator = address(0x0E);
    address public user1 = address(0x1111);
    address public user2 = address(0x2222);

    uint256 public constant INTERVAL = 300; // 5 minutes
    uint256 public constant BUFFER = 30;    // 30 seconds
    uint256 public constant MIN_BET = 0.001 ether; // 1e15 wei
    uint256 public constant FEE = 200;      // 2%

    struct RoundView {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp;
        uint256 closeTimestamp;
        int256 lockPrice;
        int256 closePrice;
        uint256 totalAmount;
        uint256 bullAmount;
        uint256 bearAmount;
        uint256 rewardBaseCalData;
        uint256 rewardAmount;
        bool oracleCalled;
        bool cancelled;
    }

    function getRound(uint256 epoch) internal view returns (RoundView memory r) {
        (
            r.epoch,
            r.startTimestamp,
            r.lockTimestamp,
            r.closeTimestamp,
            r.lockPrice,
            r.closePrice,
            r.totalAmount,
            r.bullAmount,
            r.bearAmount,
            r.rewardBaseCalData,
            r.rewardAmount,
            r.oracleCalled,
            r.cancelled
        ) = predictor.rounds(epoch);
    }

    function setUp() public {
        vm.label(admin, "Admin");
        vm.label(operator, "Operator");
        vm.label(user1, "User1");
        vm.label(user2, "User2");

        // Start time at 100000 to avoid block.timestamp == 0 issues
        vm.warp(100000);

        vm.startPrank(admin);
        mockOracle = new MockDiaOracle(85_000000000000000000); // $85 LTC (18 decimals)
        predictor = new LitePredict(
            address(mockOracle),
            operator,
            INTERVAL,
            BUFFER,
            MIN_BET,
            FEE
        );
        vm.stopPrank();

        // Give some zkLTC (ether in tests) to users
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
    }

    function testGenesisRounds() public {
        vm.startPrank(operator);

        // 1. Genesis Start
        predictor.genesisStartRound();
        assertEq(predictor.currentEpoch(), 1);
        assertTrue(predictor.genesisStartOnce());
        assertFalse(predictor.genesisLockOnce());

        // Check Round 1 settings
        RoundView memory r1 = getRound(1);
        assertEq(r1.epoch, 1);
        assertEq(r1.startTimestamp, 100000);
        assertEq(r1.lockTimestamp, 100000 + INTERVAL);
        assertEq(r1.closeTimestamp, 100000 + (2 * INTERVAL));

        // 2. Warp to lock time
        vm.warp(100000 + INTERVAL);

        // Genesis Lock
        predictor.genesisLockRound();
        assertTrue(predictor.genesisLockOnce());
        assertEq(predictor.currentEpoch(), 2);

        // Check locked price for round 1
        r1 = getRound(1);
        assertEq(r1.lockPrice, 85_000000000000000000);

        // Check Round 2 is initialized
        RoundView memory r2 = getRound(2);
        assertEq(r2.epoch, 2);
        assertEq(r2.startTimestamp, 100000 + INTERVAL);
        assertEq(r2.lockTimestamp, 100000 + (2 * INTERVAL));
        assertEq(r2.closeTimestamp, 100000 + (3 * INTERVAL));

        vm.stopPrank();
    }

    function testBetting() public {
        // Start genesis
        vm.prank(operator);
        predictor.genesisStartRound();

        // User1 bets on Bull for Round 1
        vm.prank(user1);
        predictor.betBull{value: 1 ether}(1);

        // User2 bets on Bear for Round 1
        vm.prank(user2);
        predictor.betBear{value: 2 ether}(1);

        // Verify round pool balances
        RoundView memory r1 = getRound(1);
        assertEq(r1.totalAmount, 3 ether);
        assertEq(r1.bullAmount, 1 ether);
        assertEq(r1.bearAmount, 2 ether);

        // Verify user bets
        (LitePredict.Position pos1, uint256 amt1, bool claimed1) = predictor.userBets(1, user1);
        assertEq(uint(pos1), uint(LitePredict.Position.Bull));
        assertEq(amt1, 1 ether);
        assertFalse(claimed1);

        (LitePredict.Position pos2, uint256 amt2, bool claimed2) = predictor.userBets(1, user2);
        assertEq(uint(pos2), uint(LitePredict.Position.Bear));
        assertEq(amt2, 2 ether);
        assertFalse(claimed2);
    }

    function testExecuteRoundBullWins() public {
        // Setup genesis
        vm.prank(operator);
        predictor.genesisStartRound();

        // Bet on Round 1 (bidding)
        vm.prank(user1);
        predictor.betBull{value: 1 ether}(1);
        vm.prank(user2);
        predictor.betBear{value: 1 ether}(1);

        vm.startPrank(operator);
        vm.warp(100000 + INTERVAL);
        predictor.genesisLockRound(); // locks Round 1, starts Round 2 (bidding)
        vm.stopPrank();

        // Round 1 is live (lockPrice = $85)
        // Let's bet on Round 2 (bidding)
        vm.prank(user1);
        predictor.betBull{value: 2 ether}(2);

        vm.prank(user2);
        predictor.betBear{value: 3 ether}(2);

        // Warp to execution time for Round 2 (which is when Round 1 closeTimestamp is reached: 100000 + 2*INTERVAL)
        vm.warp(100000 + (2 * INTERVAL));

        // Let's increase the price to $90 (Bull wins for Round 1)
        mockOracle.setPrice(90_000000000000000000);

        // Execute round
        vm.prank(operator);
        predictor.executeRound(); // closes Round 1, locks Round 2 (lockPrice = $90), starts Round 3

        // Verify Round 1 state
        RoundView memory r1 = getRound(1);
        assertEq(r1.lockPrice, 85_000000000000000000);
        assertEq(r1.closePrice, 90_000000000000000000);
        assertTrue(r1.oracleCalled);
        assertFalse(r1.cancelled);

        // Let's warp to close Round 2 (closeTimestamp = 100000 + 3*INTERVAL)
        vm.warp(100000 + (3 * INTERVAL));

        // Set price to $95 (Bull wins for Round 2)
        mockOracle.setPrice(95_000000000000000000);

        // Execute round again (closes Round 2, locks Round 3, starts Round 4)
        vm.prank(operator);
        predictor.executeRound();

        // Verify Round 2 details
        RoundView memory r2 = getRound(2);
        assertEq(r2.lockPrice, 90_000000000000000000);
        assertEq(r2.closePrice, 95_000000000000000000);
        assertTrue(r2.oracleCalled);
        assertFalse(r2.cancelled);

        // Since Bull won Round 2:
        // User1 is the winner. Total pool is 5 ether. Fee is 2% = 0.1 ether. Reward pool = 4.9 ether.
        // User1 wins.
        assertTrue(predictor.claimable(2, user1));
        assertFalse(predictor.claimable(2, user2));

        // Check user1 balance before claiming
        uint256 balBefore = user1.balance;

        vm.prank(user1);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 2;
        predictor.claim(epochs);

        // Payout to User1 should be: 2 ether * 4.9 ether / 2 ether = 4.9 ether
        assertEq(user1.balance - balBefore, 4.9 ether);
    }

    function testExecuteRoundBearWins() public {
        // Setup genesis
        vm.startPrank(operator);
        predictor.genesisStartRound();
        vm.warp(100000 + INTERVAL);
        predictor.genesisLockRound();
        vm.stopPrank();

        // Round 2 (bidding)
        vm.prank(user1);
        predictor.betBull{value: 2 ether}(2);

        vm.prank(user2);
        predictor.betBear{value: 3 ether}(2);

        // Warp to execute
        vm.warp(100000 + (2 * INTERVAL));
        mockOracle.setPrice(85_000000000000000000); // round 1 close price
        vm.prank(operator);
        predictor.executeRound(); // closes 1, locks 2

        // Warp to close Round 2
        vm.warp(100000 + (3 * INTERVAL));
        mockOracle.setPrice(80_000000000000000000); // price drops, Bear wins for Round 2 (lockPrice = 85, closePrice = 80)
        vm.prank(operator);
        predictor.executeRound(); // closes 2, locks 3

        // Verify Bear wins Round 2
        assertFalse(predictor.claimable(2, user1));
        assertTrue(predictor.claimable(2, user2));

        // User2 claims rewards
        uint256 balBefore = user2.balance;
        vm.prank(user2);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 2;
        predictor.claim(epochs);

        // Total pool: 5 ether. Fee: 2% = 0.1 ether. Reward pool: 4.9 ether.
        // User2 winning payout: 3 ether * 4.9 ether / 3 ether = 4.9 ether.
        assertEq(user2.balance - balBefore, 4.9 ether);
    }

    function testCancelledRoundNoBets() public {
        // Setup genesis
        vm.startPrank(operator);
        predictor.genesisStartRound();
        vm.warp(100000 + INTERVAL);
        predictor.genesisLockRound();
        vm.stopPrank();

        // Warp to close Round 2 (bidding has 0 bets)
        vm.warp(100000 + (2 * INTERVAL));
        mockOracle.setPrice(85_000000000000000000);
        vm.prank(operator);
        predictor.executeRound(); // closes 1, locks 2

        vm.warp(100000 + (3 * INTERVAL));
        mockOracle.setPrice(90_000000000000000000);
        vm.prank(operator);
        predictor.executeRound(); // closes 2, locks 3

        // Round 2 should be cancelled because there are no bets on either side (totalAmount = 0)
        RoundView memory r2 = getRound(2);
        assertTrue(r2.cancelled);
    }

    function testOracleStaleTimestamp() public {
        // Setup genesis
        vm.startPrank(operator);
        predictor.genesisStartRound();
        vm.warp(100000 + INTERVAL);
        predictor.genesisLockRound();
        vm.stopPrank();

        // Warp to close Round 2
        vm.warp(100000 + (2 * INTERVAL));

        // Make oracle stale by warping oracle update timestamp back in time
        // 100000 + 2*INTERVAL = 100600. Stale threshold is 14400 seconds (4 hours).
        // Let's set oracle updated timestamp to 80000.
        mockOracle.setTimestamp(80000); 

        vm.prank(operator);
        vm.expectRevert("Oracle price too stale");
        predictor.executeRound();
    }
}
