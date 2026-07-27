// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./interfaces/IDiaOracle.sol";

contract LitePredict {
    // Enums
    enum Position { Bull, Bear }

    // Structs
    struct Round {
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

    struct BetInfo {
        Position position;
        uint256 amount;
        bool claimed;
    }

    // State Variables
    address public admin;
    address public operator;
    address public oracleAddress;

    uint256 public currentEpoch;
    uint256 public intervalSeconds; // Duration of each round (e.g. 300 seconds for 5 mins)
    uint256 public bufferSeconds;   // Time buffer (e.g. 30 seconds)
    uint256 public minBetAmount;    // Minimum bet amount (e.g. 0.001 zkLTC)
    uint256 public treasuryFee;     // Fee rate in basis points (e.g. 200 = 2%)
    uint256 public treasuryAmount;  // Accumulated fees

    bool public genesisStartOnce;
    bool public genesisLockOnce;
    bool public paused;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => BetInfo)) public userBets;
    mapping(address => uint256[]) public userRounds; // Track epochs participated by user

    uint256 public constant MAX_TREASURY_FEE = 1000; // 10% max

    // Events
    event StartGenesisRound(uint256 indexed epoch);
    event LockGenesisRound(uint256 indexed epoch);
    event StartRound(uint256 indexed epoch);
    event LockRound(uint256 indexed epoch, int256 price);
    event EndRound(uint256 indexed epoch, int256 price);
    event CancelRound(uint256 indexed epoch);
    event BetBull(address indexed sender, uint256 indexed epoch, uint256 amount);
    event BetBear(address indexed sender, uint256 indexed epoch, uint256 amount);
    event Claim(address indexed sender, uint256 indexed epoch, uint256 amount);
    event RatesUpdated(uint256 indexed epoch, uint256 bullRate, uint256 bearRate);
    event TreasuryClaim(uint256 amount);
    event Paused(uint256 indexed epoch);
    event Unpaused(uint256 indexed epoch);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == admin, "Not operator");
        _;
    }

    modifier onlyOperatorOrPermissionless() {
        require(
            msg.sender == operator || 
            msg.sender == admin || 
            (genesisStartOnce && genesisLockOnce && block.timestamp >= rounds[currentEpoch - 1].closeTimestamp),
            "Not operator or not ready"
        );
        _;
    }

    modifier notPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(
        address _oracleAddress,
        address _operator,
        uint256 _intervalSeconds,
        uint256 _bufferSeconds,
        uint256 _minBetAmount,
        uint256 _treasuryFee
    ) {
        require(_treasuryFee <= MAX_TREASURY_FEE, "Fee too high");
        admin = msg.sender;
        operator = _operator;
        oracleAddress = _oracleAddress;
        intervalSeconds = _intervalSeconds;
        bufferSeconds = _bufferSeconds;
        minBetAmount = _minBetAmount;
        treasuryFee = _treasuryFee;
    }

    // Admin & Configuration
    function setOperator(address _operator) external onlyAdmin {
        operator = _operator;
    }

    function setOracleAddress(address _oracleAddress) external onlyAdmin {
        oracleAddress = _oracleAddress;
    }

    function setIntervalAndBuffer(uint256 _intervalSeconds, uint256 _bufferSeconds) external onlyAdmin {
        require(_intervalSeconds > _bufferSeconds, "Interval must be > buffer");
        intervalSeconds = _intervalSeconds;
        bufferSeconds = _bufferSeconds;
    }

    function setMinBetAmount(uint256 _minBetAmount) external onlyAdmin {
        minBetAmount = _minBetAmount;
    }

    function setTreasuryFee(uint256 _treasuryFee) external onlyAdmin {
        require(_treasuryFee <= MAX_TREASURY_FEE, "Fee too high");
        treasuryFee = _treasuryFee;
    }

    function pause() external onlyAdmin notPaused {
        paused = true;
        emit Paused(currentEpoch);
    }

    function unpause() external onlyAdmin {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(currentEpoch);
    }

    function claimTreasury() external onlyAdmin {
        uint256 currentTreasury = treasuryAmount;
        treasuryAmount = 0;
        payable(admin).transfer(currentTreasury);
        emit TreasuryClaim(currentTreasury);
    }

    // Genesis Initiators
    function genesisStartRound() external onlyOperator notPaused {
        require(!genesisStartOnce, "Genesis start already run");
        currentEpoch = 1;
        _startRound(currentEpoch);
        genesisStartOnce = true;
        emit StartGenesisRound(currentEpoch);
    }

    function genesisLockRound() external onlyOperator notPaused {
        require(genesisStartOnce, "Genesis start not run");
        require(!genesisLockOnce, "Genesis lock already run");

        int256 price = _getPriceFromOracle();
        
        _lockRound(currentEpoch, price);

        currentEpoch = currentEpoch + 1;
        _startRound(currentEpoch);
        genesisLockOnce = true;
        emit LockGenesisRound(currentEpoch - 1);
    }

    // Core execution function (permissionless once initialized)
    function executeRound() external onlyOperatorOrPermissionless notPaused {
        require(genesisStartOnce && genesisLockOnce, "Genesis rounds not run");

        uint256 epochToClose = currentEpoch - 1;
        uint256 epochToLock = currentEpoch;

        // Ensure current time is past the close time of the live round
        require(block.timestamp >= rounds[epochToClose].closeTimestamp, "Round not ready to execute");
        require(block.timestamp <= rounds[epochToClose].closeTimestamp + intervalSeconds, "Round execution window expired, pause needed");

        int256 price = _getPriceFromOracle();

        // 1. Close the live round
        _closeRound(epochToClose, price);

        // 2. Lock the current bidding round
        _lockRound(epochToLock, price);

        // 3. Start next bidding round
        currentEpoch = currentEpoch + 1;
        _startRound(currentEpoch);
    }

    // Placing bets
    function betBull(uint256 epoch) external payable notPaused {
        require(epoch == currentEpoch, "Betting not open for epoch");
        require(_isBettingOpen(epoch), "Betting closed");
        require(msg.value >= minBetAmount, "Amount too low");

        uint256 amount = msg.value;
        Round storage round = rounds[epoch];
        round.totalAmount += amount;
        round.bullAmount += amount;

        // Record bet
        BetInfo storage betInfo = userBets[epoch][msg.sender];
        if (betInfo.amount == 0) {
            userRounds[msg.sender].push(epoch);
        }
        betInfo.position = Position.Bull;
        betInfo.amount += amount;

        emit BetBull(msg.sender, epoch, amount);
    }

    function betBear(uint256 epoch) external payable notPaused {
        require(epoch == currentEpoch, "Betting not open for epoch");
        require(_isBettingOpen(epoch), "Betting closed");
        require(msg.value >= minBetAmount, "Amount too low");

        uint256 amount = msg.value;
        Round storage round = rounds[epoch];
        round.totalAmount += amount;
        round.bearAmount += amount;

        // Record bet
        BetInfo storage betInfo = userBets[epoch][msg.sender];
        if (betInfo.amount == 0) {
            userRounds[msg.sender].push(epoch);
        }
        betInfo.position = Position.Bear;
        betInfo.amount += amount;

        emit BetBear(msg.sender, epoch, amount);
    }

    // Claiming Rewards
    function claim(uint256[] calldata epochs) external {
        uint256 reward = 0;
        for (uint256 i = 0; i < epochs.length; i++) {
            uint256 epoch = epochs[i];
            require(rounds[epoch].oracleCalled || rounds[epoch].cancelled, "Round not finalized");
            
            BetInfo storage betInfo = userBets[epoch][msg.sender];
            require(betInfo.amount > 0, "No bet in epoch");
            require(!betInfo.claimed, "Already claimed");

            uint256 roundReward = 0;
            if (rounds[epoch].cancelled) {
                // Refund original bet amount
                roundReward = betInfo.amount;
            } else {
                if (claimable(epoch, msg.sender)) {
                    Round memory round = rounds[epoch];
                    uint256 winningPool = (round.closePrice > round.lockPrice) ? round.bullAmount : round.bearAmount;
                    roundReward = (betInfo.amount * round.rewardAmount) / winningPool;
                }
            }

            betInfo.claimed = true;
            reward += roundReward;
            emit Claim(msg.sender, epoch, roundReward);
        }

        if (reward > 0) {
            payable(msg.sender).transfer(reward);
        }
    }

    // View functions
    function claimable(uint256 epoch, address user) public view returns (bool) {
        BetInfo memory betInfo = userBets[epoch][user];
        Round memory round = rounds[epoch];
        if (betInfo.amount == 0 || betInfo.claimed || round.cancelled || !round.oracleCalled) {
            return false;
        }
        
        if (round.closePrice > round.lockPrice && betInfo.position == Position.Bull) {
            return true;
        } else if (round.closePrice < round.lockPrice && betInfo.position == Position.Bear) {
            return true;
        }
        return false;
    }

    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }

    // Internal Helpers
    function _startRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        round.epoch = epoch;
        round.startTimestamp = block.timestamp;
        round.lockTimestamp = block.timestamp + intervalSeconds;
        round.closeTimestamp = block.timestamp + (2 * intervalSeconds);
        
        emit StartRound(epoch);
    }

    function _lockRound(uint256 epoch, int256 price) internal {
        Round storage round = rounds[epoch];
        round.lockPrice = price;
        round.lockTimestamp = block.timestamp;
        
        emit LockRound(epoch, price);
    }

    function _closeRound(uint256 epoch, int256 price) internal {
        Round storage round = rounds[epoch];
        round.closePrice = price;
        round.closeTimestamp = block.timestamp;
        round.oracleCalled = true;

        if (round.closePrice == round.lockPrice || round.bullAmount == 0 || round.bearAmount == 0) {
            // Draw or no players on one of the sides, cancel round (refunding)
            round.cancelled = true;
            emit CancelRound(epoch);
        } else {
            // Calculate fees and reward pool
            uint256 fee = (round.totalAmount * treasuryFee) / 10000;
            treasuryAmount += fee;
            round.rewardAmount = round.totalAmount - fee;
            
            emit EndRound(epoch, price);
        }
    }

    function _getPriceFromOracle() internal view returns (int256) {
        (, int256 price, , uint256 updatedAt, ) = IDiaOracle(oracleAddress).latestRoundData();
        require(price > 0, "Invalid price");
        require(updatedAt > 0 && block.timestamp - updatedAt <= 14400, "Oracle price too stale"); // 4 hours limit
        return price;
    }

    function _isBettingOpen(uint256 epoch) internal view returns (bool) {
        Round memory round = rounds[epoch];
        return round.startTimestamp > 0 && block.timestamp < round.lockTimestamp;
    }

    // Allow contract to receive funds
    receive() external payable {}
}
