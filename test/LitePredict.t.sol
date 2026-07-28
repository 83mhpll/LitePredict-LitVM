// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/LitePredict.sol";
import "../src/interfaces/IDiaOracle.sol";

contract TestMockDiaOracle is IDiaOracle {
    int256 public price;
    uint256 public updatedAt;
    uint80 public roundId = 1;

    function setPrice(int256 _price, uint256 _updatedAt) external {
        price = _price;
        updatedAt = _updatedAt;
        roundId++;
    }

    function latestRoundData() external view returns (
        uint80 _roundId,
        int256 answer,
        uint256 startedAt,
        uint256 _updatedAt,
        uint80 answeredInRound
    ) {
        return (roundId, price, updatedAt, updatedAt, roundId);
    }
}

contract ReentrancyAttacker {
    LitePredict public predict;
    uint256[] public epochsToClaim;

    constructor(LitePredict _predict) {
        predict = _predict;
    }

    function setEpochs(uint256[] memory _epochs) external {
        epochsToClaim = _epochs;
    }

    function betBull(uint256 epoch) external payable {
        predict.betBull{value: msg.value}(epoch);
    }

    function doClaim() external {
        predict.claim(epochsToClaim);
    }

    receive() external payable {
        if (epochsToClaim.length > 0) {
            uint256[] memory _epochs = epochsToClaim;
            delete epochsToClaim; // prevent infinite loop if reentrancy guard failed
            predict.claim(_epochs);
        }
    }
}

contract LitePredictTest is Test {
    LitePredict public lp;
    TestMockDiaOracle public oracle;

    address public admin = address(0x100);
    address public operator = address(0x200);
    address public alice = address(0x300);
    address public bob = address(0x400);
    address public charlie = address(0x500);

    uint256 public constant INTERVAL = 300;
    uint256 public constant BUFFER = 30;
    uint256 public constant MIN_BET = 0.001 ether;

    function setUp() public {
        vm.warp(100000);
        vm.startPrank(admin);
        oracle = new TestMockDiaOracle();
        oracle.setPrice(1000 * 10**8, block.timestamp);

        lp = new LitePredict(
            address(oracle),
            operator,
            INTERVAL,
            BUFFER,
            MIN_BET,
            200 // 2% fee
        );
        vm.stopPrank();

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // Helper functions
    function _doGenesisStart() internal {
        vm.prank(operator);
        lp.genesisStartRound();
    }

    function _doGenesisLock() internal {
        vm.warp(block.timestamp + INTERVAL);
        oracle.setPrice(1000 * 10**8, block.timestamp);
        vm.prank(operator);
        lp.genesisLockRound();
    }

    function _doExecuteRound() internal {
        vm.warp(block.timestamp + INTERVAL);
        oracle.setPrice(1000 * 10**8, block.timestamp);
        vm.prank(operator);
        lp.executeRound();
    }

    function _doExecuteRoundWithPrice(int256 newPrice) internal {
        vm.warp(block.timestamp + INTERVAL);
        oracle.setPrice(newPrice, block.timestamp);
        vm.prank(operator);
        lp.executeRound();
    }

    // 1. Full round lifecycle (bull wins)
    function test_FullRoundLifecycle_BullWins() public {
        _doGenesisStart();

        // Users bet in epoch 1
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);

        vm.prank(bob);
        lp.betBear{value: 1 ether}(1);

        _doGenesisLock(); // locks epoch 1, starts epoch 2

        // Time passes, execute round with higher price (bull wins)
        _doExecuteRoundWithPrice(1100 * 10**8); // closes 1, locks 2, starts 3

        // Alice claims
        uint256 aliceBalBefore = alice.balance;
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        lp.claim(epochs);
        uint256 aliceBalAfter = alice.balance;

        assertEq(lp.claimable(1, alice), false); // after claim
        assertGt(aliceBalAfter, aliceBalBefore);
        // Pool is 2 ether. 2% fee = 0.04 ether. Reward = 1.96 ether.
        assertEq(aliceBalAfter - aliceBalBefore, 1.96 ether);
    }

    // Full round lifecycle (bear wins)
    function test_FullRoundLifecycle_BearWins() public {
        _doGenesisStart();
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
        vm.prank(bob);
        lp.betBear{value: 1 ether}(1);
        _doGenesisLock();
        _doExecuteRoundWithPrice(900 * 10**8); // price drops

        uint256 bobBalBefore = bob.balance;
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(bob);
        lp.claim(epochs);
        assertEq(bob.balance - bobBalBefore, 1.96 ether);
    }

    // Full round lifecycle (draw/cancel)
    function test_FullRoundLifecycle_Cancel() public {
        _doGenesisStart();
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
        // Nobody bets bear
        _doGenesisLock();
        _doExecuteRoundWithPrice(1100 * 10**8); // should cancel because bearAmount = 0

        uint256 aliceBalBefore = alice.balance;
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        lp.claim(epochs);
        assertEq(alice.balance - aliceBalBefore, 1 ether); // Full refund
    }

    // 2. Oracle staleness
    function test_OracleStaleness() public {
        _doGenesisStart();
        vm.warp(block.timestamp + INTERVAL);
        // set oracle update to be too old (INTERVAL + BUFFER = 330s)
        oracle.setPrice(1000 * 10**8, block.timestamp - 331);
        
        vm.expectRevert("LP: oracle price stale");
        vm.prank(operator);
        lp.genesisLockRound();
    }

    // 3. Oracle invalid price
    function test_OracleInvalidPrice() public {
        _doGenesisStart();
        vm.warp(block.timestamp + INTERVAL);
        oracle.setPrice(0, block.timestamp);
        
        vm.expectRevert("LP: invalid oracle price");
        vm.prank(operator);
        lp.genesisLockRound();
    }

    // 4. Betting constraints
    function test_BettingConstraints() public {
        _doGenesisStart();

        // Below min bet
        vm.expectRevert("LP: below min bet");
        vm.prank(alice);
        lp.betBull{value: 0.0001 ether}(1);

        // Above max bet (default max is min * 10_000 = 10 ether)
        vm.expectRevert("LP: exceeds max bet");
        vm.prank(alice);
        lp.betBull{value: 10.1 ether}(1);

        // Close to lock timestamp
        vm.warp(block.timestamp + INTERVAL - BUFFER);
        vm.expectRevert("LP: betting closed");
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
    }

    // 5. Multi-user betting same round
    function test_MultiUserBetting() public {
        _doGenesisStart();
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
        vm.prank(bob);
        lp.betBull{value: 2 ether}(1);
        vm.prank(charlie);
        lp.betBear{value: 1 ether}(1);

        _doGenesisLock();
        _doExecuteRoundWithPrice(1100 * 10**8);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        uint256 alicePre = alice.balance;
        vm.prank(alice);
        lp.claim(epochs);
        uint256 alicePost = alice.balance;

        uint256 bobPre = bob.balance;
        vm.prank(bob);
        lp.claim(epochs);
        uint256 bobPost = bob.balance;

        // Total pool = 4 ether. Fee = 0.08 ether. Reward pool = 3.92.
        // Bull pool = 3 ether. 
        // Alice gets 1/3 * 3.92 = 1.30666...
        // Bob gets 2/3 * 3.92 = 2.61333...
        assertApproxEqAbs(alicePost - alicePre, 1.306666666666666666 ether, 1e4);
        assertApproxEqAbs(bobPost - bobPre, 2.613333333333333333 ether, 1e4);
    }

    // 6. Reentrancy
    function test_Reentrancy() public {
        _doGenesisStart();
        
        ReentrancyAttacker attacker = new ReentrancyAttacker(lp);
        vm.deal(address(attacker), 1 ether);
        attacker.betBull{value: 1 ether}(1);
        
        vm.prank(bob);
        lp.betBear{value: 1 ether}(1);

        _doGenesisLock();
        _doExecuteRoundWithPrice(1100 * 10**8);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        attacker.setEpochs(epochs);
        
        vm.expectRevert("LP: transfer failed");
        attacker.doClaim();
    }

    // 7. Emergency pause
    function test_EmergencyPause() public {
        vm.prank(admin);
        lp.pause();

        vm.expectRevert("LP: paused");
        vm.prank(operator);
        lp.genesisStartRound();

        vm.prank(admin);
        lp.unpause();

        _doGenesisStart(); // works now
    }

    // 8. Admin two-step transfer
    function test_AdminTransfer() public {
        vm.prank(admin);
        lp.transferAdmin(alice);

        assertEq(lp.pendingAdmin(), alice);

        vm.prank(alice);
        lp.acceptAdmin();

        assertEq(lp.admin(), alice);
        assertEq(lp.pendingAdmin(), address(0));
    }

    // 9. Treasury
    function test_Treasury() public {
        test_FullRoundLifecycle_BullWins();

        uint256 adminPre = admin.balance;
        vm.prank(admin);
        lp.claimTreasury();
        uint256 adminPost = admin.balance;

        assertEq(adminPost - adminPre, 0.04 ether);
    }

    // 10. getMultiplier
    function test_GetMultiplier() public {
        _doGenesisStart();
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
        vm.prank(bob);
        lp.betBear{value: 3 ether}(1);

        // pool = 4 ether. After fee (2%) = 3.92 ether.
        // Bull multiplier = 3.92 / 1 = 3.92 (39200 precision 1e4)
        // Bear multiplier = 3.92 / 3 = 1.3066... (13066 precision 1e4)

        uint256 bullM = lp.getMultiplier(1, LitePredict.Position.Bull);
        uint256 bearM = lp.getMultiplier(1, LitePredict.Position.Bear);

        assertEq(bullM, 39200);
        assertEq(bearM, 13066);
    }

    // 11. Fuzz test
    function testFuzz_BetBull(uint256 betAmount) public {
        betAmount = bound(betAmount, MIN_BET, lp.maxBetAmount());
        _doGenesisStart();
        
        vm.deal(alice, betAmount);
        vm.prank(alice);
        lp.betBull{value: betAmount}(1);

        LitePredict.Round memory r = lp.getRound(1);
        assertEq(r.bullAmount, betAmount);
        assertEq(r.totalAmount, betAmount);
    }

    // 12. claimable and refundable view functions
    function test_ViewFunctions() public {
        _doGenesisStart();
        vm.prank(alice);
        lp.betBull{value: 1 ether}(1);
        vm.prank(bob);
        lp.betBear{value: 1 ether}(1);
        
        assertEq(lp.claimable(1, alice), false);
        assertEq(lp.refundable(1, alice), false);

        _doGenesisLock();
        _doExecuteRoundWithPrice(1100 * 10**8); // bull wins

        assertEq(lp.claimable(1, alice), true);
        assertEq(lp.refundable(1, alice), false);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        lp.claim(epochs);

        assertEq(lp.claimable(1, alice), false);
        assertEq(lp.refundable(1, alice), false);
    }
}
