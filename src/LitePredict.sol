// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./interfaces/IDiaOracle.sol";

/**
 * @title  LitePredict
 * @notice Decentralized Bull/Bear prediction market for LTC/USD on LitVM.
 *         Built for the LitVM Builders Program — https://builders.litvm.com
 *
 * Revenue:
 *   - treasuryFee (default 2%) is taken from every settled round's total pool.
 *   - Treasury can be claimed by admin at any time.
 *
 * Security features:
 *   - ReentrancyGuard on all ETH-transferring functions
 *   - Oracle staleness check (max oracleUpdateAllowance seconds)
 *   - Per-user bet cap (maxBetAmount)
 *   - Emergency pause
 *   - Events for all state changes (indexable)
 *   - Two-step admin transfer
 *
 * Round lifecycle:
 *   genesisStartRound() → genesisLockRound() → [executeRound() every interval]
 */
contract LitePredict {

    /* ══════════════════════════════════════════════
       TYPES
    ══════════════════════════════════════════════ */

    enum Position { Bull, Bear }

    struct Round {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp;
        uint256 closeTimestamp;
        int256  lockPrice;
        int256  closePrice;
        uint256 totalAmount;
        uint256 bullAmount;
        uint256 bearAmount;
        uint256 rewardBaseCalData; // winning pool
        uint256 rewardAmount;      // after fee
        bool    oracleCalled;
        bool    cancelled;
    }

    struct BetInfo {
        Position position;
        uint256  amount;
        bool     claimed;
    }

    /* ══════════════════════════════════════════════
       STATE
    ══════════════════════════════════════════════ */

    address public admin;
    address public pendingAdmin;   // two-step admin transfer
    address public operator;
    address public oracleAddress;

    uint256 public currentEpoch;
    uint256 public intervalSeconds;         // round duration (default 300s = 5min)
    uint256 public bufferSeconds;           // grace buffer for oracle (default 30s)
    uint256 public minBetAmount;            // wei, default 0.001 zkLTC
    uint256 public maxBetAmount;            // wei, default 10 zkLTC (whale cap)
    uint256 public treasuryFee;             // basis points, default 200 = 2%
    uint256 public treasuryAmount;          // accumulated fees (claimable by admin)
    uint256 public oracleUpdateAllowance;   // max oracle staleness in seconds (default 300)

    bool public genesisStartOnce;
    bool public genesisLockOnce;
    bool public paused;

    // Reentrancy guard
    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    mapping(uint256 => Round)                           public rounds;
    mapping(uint256 => mapping(address => BetInfo))     public userBets;
    mapping(address => uint256[])                       public userRounds;

    /* ══════════════════════════════════════════════
       CONSTANTS
    ══════════════════════════════════════════════ */

    uint256 public constant MAX_TREASURY_FEE     = 1000;  // 10%
    uint256 public constant MIN_INTERVAL_SECONDS = 60;    // 1 minute minimum
    uint256 public constant VERSION              = 2;     // contract version

    /* ══════════════════════════════════════════════
       EVENTS
    ══════════════════════════════════════════════ */

    event StartGenesisRound(uint256 indexed epoch);
    event LockGenesisRound(uint256 indexed epoch);
    event StartRound(uint256 indexed epoch);
    event LockRound(uint256 indexed epoch, uint256 indexed roundId, int256 price);
    event EndRound(uint256 indexed epoch, uint256 indexed roundId, int256 price);
    event CancelRound(uint256 indexed epoch);

    event BetBull(address indexed sender, uint256 indexed epoch, uint256 amount);
    event BetBear(address indexed sender, uint256 indexed epoch, uint256 amount);
    event Claim(address indexed sender, uint256 indexed epoch, uint256 amount);

    event TreasuryClaim(address indexed admin, uint256 amount);
    event OracleUpdate(address indexed oracle);
    event Paused(address indexed admin, uint256 epoch);
    event Unpaused(address indexed admin, uint256 epoch);
    event AdminTransferInitiated(address indexed pendingAdmin);
    event AdminTransferCompleted(address indexed newAdmin);
    event OperatorUpdated(address indexed operator);
    event ParametersUpdated(uint256 interval, uint256 buffer, uint256 minBet, uint256 maxBet, uint256 fee);

    /* ══════════════════════════════════════════════
       MODIFIERS
    ══════════════════════════════════════════════ */

    modifier onlyAdmin() {
        require(msg.sender == admin, "LP: not admin");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator || msg.sender == admin, "LP: not operator");
        _;
    }

    /**
     * @dev executeRound is permissionless once both genesis phases are done
     *      AND the round's close timestamp has passed.
     */
    modifier onlyOperatorOrPermissionless() {
        bool isOp = (msg.sender == operator || msg.sender == admin);
        bool isPermissionless = (
            genesisStartOnce &&
            genesisLockOnce &&
            block.timestamp >= rounds[currentEpoch - 1].closeTimestamp
        );
        require(isOp || isPermissionless, "LP: not authorized");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "LP: paused");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "LP: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    /* ══════════════════════════════════════════════
       CONSTRUCTOR
    ══════════════════════════════════════════════ */

    constructor(
        address _oracleAddress,
        address _operator,
        uint256 _intervalSeconds,
        uint256 _bufferSeconds,
        uint256 _minBetAmount,
        uint256 _treasuryFee
    ) {
        require(_oracleAddress != address(0), "LP: zero oracle");
        require(_operator != address(0), "LP: zero operator");
        require(_intervalSeconds >= MIN_INTERVAL_SECONDS, "LP: interval too short");
        require(_intervalSeconds > _bufferSeconds, "LP: interval <= buffer");
        require(_treasuryFee <= MAX_TREASURY_FEE, "LP: fee too high");
        require(_minBetAmount > 0, "LP: zero min bet");

        admin              = msg.sender;
        operator           = _operator;
        oracleAddress      = _oracleAddress;
        intervalSeconds    = _intervalSeconds;
        bufferSeconds      = _bufferSeconds;
        minBetAmount       = _minBetAmount;
        maxBetAmount       = _minBetAmount * 10_000; // default 10,000x minBet cap
        treasuryFee        = _treasuryFee;
        oracleUpdateAllowance = _intervalSeconds + _bufferSeconds; // staleness = 1 round + buffer
        _reentrancyStatus  = _NOT_ENTERED;
    }

    /* ══════════════════════════════════════════════
       ADMIN — CONFIGURATION
    ══════════════════════════════════════════════ */

    /// @notice Initiate two-step admin transfer. New admin must call acceptAdmin().
    function transferAdmin(address _pendingAdmin) external onlyAdmin {
        require(_pendingAdmin != address(0), "LP: zero address");
        pendingAdmin = _pendingAdmin;
        emit AdminTransferInitiated(_pendingAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "LP: not pending admin");
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferCompleted(admin);
    }

    function setOperator(address _operator) external onlyAdmin {
        require(_operator != address(0), "LP: zero address");
        operator = _operator;
        emit OperatorUpdated(_operator);
    }

    function setOracleAddress(address _oracleAddress) external onlyAdmin {
        require(_oracleAddress != address(0), "LP: zero address");
        oracleAddress = _oracleAddress;
        emit OracleUpdate(_oracleAddress);
    }

    function setOracleUpdateAllowance(uint256 _seconds) external onlyAdmin {
        oracleUpdateAllowance = _seconds;
    }

    /// @notice Update all economic parameters in one tx (admin)
    function setParameters(
        uint256 _intervalSeconds,
        uint256 _bufferSeconds,
        uint256 _minBetAmount,
        uint256 _maxBetAmount,
        uint256 _treasuryFee
    ) external onlyAdmin {
        require(_intervalSeconds >= MIN_INTERVAL_SECONDS, "LP: interval too short");
        require(_intervalSeconds > _bufferSeconds, "LP: interval <= buffer");
        require(_minBetAmount > 0, "LP: zero min bet");
        require(_maxBetAmount >= _minBetAmount, "LP: max < min");
        require(_treasuryFee <= MAX_TREASURY_FEE, "LP: fee too high");

        intervalSeconds = _intervalSeconds;
        bufferSeconds   = _bufferSeconds;
        minBetAmount    = _minBetAmount;
        maxBetAmount    = _maxBetAmount;
        treasuryFee     = _treasuryFee;

        emit ParametersUpdated(_intervalSeconds, _bufferSeconds, _minBetAmount, _maxBetAmount, _treasuryFee);
    }

    function pause() external onlyAdmin {
        require(!paused, "LP: already paused");
        paused = true;
        emit Paused(msg.sender, currentEpoch);
    }

    function unpause() external onlyAdmin {
        require(paused, "LP: not paused");
        paused = false;
        genesisStartOnce = false;
        genesisLockOnce  = false;
        emit Unpaused(msg.sender, currentEpoch);
    }

    /// @notice Withdraw accumulated protocol fees. Protected by nonReentrant.
    function claimTreasury() external onlyAdmin nonReentrant {
        uint256 amount = treasuryAmount;
        require(amount > 0, "LP: nothing to claim");
        treasuryAmount = 0;
        _safeTransfer(admin, amount);
        emit TreasuryClaim(admin, amount);
    }

    /* ══════════════════════════════════════════════
       GENESIS FLOW
    ══════════════════════════════════════════════ */

    function genesisStartRound() external onlyOperator whenNotPaused {
        require(!genesisStartOnce, "LP: genesis start done");
        currentEpoch = 1;
        _startRound(currentEpoch);
        genesisStartOnce = true;
        emit StartGenesisRound(currentEpoch);
    }

    function genesisLockRound() external onlyOperator whenNotPaused {
        require(genesisStartOnce, "LP: genesis not started");
        require(!genesisLockOnce, "LP: genesis lock done");
        require(
            block.timestamp >= rounds[currentEpoch].lockTimestamp,
            "LP: too early to lock"
        );
        require(
            block.timestamp <= rounds[currentEpoch].lockTimestamp + bufferSeconds,
            "LP: lock window expired"
        );

        (int256 price, uint80 roundId) = _getPriceFromOracle();
        _lockRound(currentEpoch, roundId, price);

        currentEpoch += 1;
        _startRound(currentEpoch);
        genesisLockOnce = true;
        emit LockGenesisRound(currentEpoch - 1);
    }

    /* ══════════════════════════════════════════════
       CORE: EXECUTE ROUND (permissionless)
    ══════════════════════════════════════════════ */

    function executeRound() external onlyOperatorOrPermissionless whenNotPaused {
        require(genesisStartOnce && genesisLockOnce, "LP: genesis not done");

        uint256 epochToClose = currentEpoch - 1;
        uint256 epochToLock  = currentEpoch;

        require(
            block.timestamp >= rounds[epochToClose].closeTimestamp,
            "LP: too early to execute"
        );
        require(
            block.timestamp <= rounds[epochToClose].closeTimestamp + bufferSeconds,
            "LP: execution window expired"
        );

        (int256 price, uint80 roundId) = _getPriceFromOracle();

        _closeRound(epochToClose, roundId, price);
        _lockRound(epochToLock, roundId, price);

        currentEpoch += 1;
        _startRound(currentEpoch);
    }

    /* ══════════════════════════════════════════════
       BETTING
    ══════════════════════════════════════════════ */

    function betBull(uint256 epoch) external payable whenNotPaused nonReentrant {
        _validateBet(epoch, msg.value);

        Round storage round = rounds[epoch];
        round.totalAmount += msg.value;
        round.bullAmount  += msg.value;

        BetInfo storage info = userBets[epoch][msg.sender];
        if (info.amount == 0) {
            userRounds[msg.sender].push(epoch);
        }
        require(info.amount + msg.value <= maxBetAmount, "LP: exceeds max bet");
        info.position  = Position.Bull;
        info.amount   += msg.value;

        emit BetBull(msg.sender, epoch, msg.value);
    }

    function betBear(uint256 epoch) external payable whenNotPaused nonReentrant {
        _validateBet(epoch, msg.value);

        Round storage round = rounds[epoch];
        round.totalAmount += msg.value;
        round.bearAmount  += msg.value;

        BetInfo storage info = userBets[epoch][msg.sender];
        if (info.amount == 0) {
            userRounds[msg.sender].push(epoch);
        }
        require(info.amount + msg.value <= maxBetAmount, "LP: exceeds max bet");
        info.position  = Position.Bear;
        info.amount   += msg.value;

        emit BetBear(msg.sender, epoch, msg.value);
    }

    /* ══════════════════════════════════════════════
       CLAIMING
    ══════════════════════════════════════════════ */

    function claim(uint256[] calldata epochs) external nonReentrant {
        uint256 reward;

        for (uint256 i; i < epochs.length; ++i) {
            uint256 epoch = epochs[i];
            Round memory round = rounds[epoch];

            require(round.oracleCalled || round.cancelled, "LP: round not settled");

            BetInfo storage info = userBets[epoch][msg.sender];
            require(info.amount > 0,  "LP: no bet");
            require(!info.claimed,    "LP: already claimed");

            uint256 roundReward;
            if (round.cancelled) {
                roundReward = info.amount; // full refund
            } else if (claimable(epoch, msg.sender)) {
                uint256 winPool = (round.closePrice > round.lockPrice)
                    ? round.bullAmount
                    : round.bearAmount;
                roundReward = (info.amount * round.rewardAmount) / winPool;
            }

            info.claimed = true; // CEI: mark claimed BEFORE external transfer

            reward += roundReward;
            emit Claim(msg.sender, epoch, roundReward);
        }

        if (reward > 0) {
            _safeTransfer(msg.sender, reward);
        }
    }

    /* ══════════════════════════════════════════════
       VIEW FUNCTIONS
    ══════════════════════════════════════════════ */

    function claimable(uint256 epoch, address user) public view returns (bool) {
        BetInfo memory info = userBets[epoch][user];
        Round memory round  = rounds[epoch];

        if (info.amount == 0 || info.claimed || round.cancelled || !round.oracleCalled) {
            return false;
        }
        if (round.closePrice > round.lockPrice && info.position == Position.Bull) return true;
        if (round.closePrice < round.lockPrice && info.position == Position.Bear) return true;
        return false;
    }

    function refundable(uint256 epoch, address user) public view returns (bool) {
        BetInfo memory info = userBets[epoch][user];
        Round memory round  = rounds[epoch];
        return round.cancelled && info.amount > 0 && !info.claimed;
    }

    function getUserRounds(address user) external view returns (uint256[] memory) {
        return userRounds[user];
    }

    function getRound(uint256 epoch) external view returns (Round memory) {
        return rounds[epoch];
    }

    /// @notice Estimated payout multiplier for a side (1e4 precision, e.g. 21000 = 2.1x)
    function getMultiplier(uint256 epoch, Position side) external view returns (uint256) {
        Round memory r = rounds[epoch];
        if (r.totalAmount == 0) return 0;
        uint256 pool = (side == Position.Bull) ? r.bullAmount : r.bearAmount;
        if (pool == 0) return 0;
        uint256 afterFee = (r.totalAmount * (10000 - treasuryFee)) / 10000;
        return (afterFee * 1e4) / pool; // e.g. 21000 = 2.1x
    }

    /* ══════════════════════════════════════════════
       INTERNAL
    ══════════════════════════════════════════════ */

    function _validateBet(uint256 epoch, uint256 amount) internal view {
        require(epoch == currentEpoch, "LP: wrong epoch");
        require(_isBettingOpen(epoch), "LP: betting closed");
        require(amount >= minBetAmount, "LP: below min bet");
    }

    function _startRound(uint256 epoch) internal {
        Round storage r = rounds[epoch];
        r.epoch          = epoch;
        r.startTimestamp = block.timestamp;
        r.lockTimestamp  = block.timestamp + intervalSeconds;
        r.closeTimestamp = block.timestamp + (2 * intervalSeconds);
        emit StartRound(epoch);
    }

    function _lockRound(uint256 epoch, uint80 roundId, int256 price) internal {
        Round storage r = rounds[epoch];
        r.lockPrice     = price;
        r.lockTimestamp = block.timestamp;
        emit LockRound(epoch, roundId, price);
    }

    function _closeRound(uint256 epoch, uint80 roundId, int256 price) internal {
        Round storage r = rounds[epoch];
        r.closePrice     = price;
        r.closeTimestamp = block.timestamp;
        r.oracleCalled   = true;

        // No bets on one side OR price unchanged → cancel (full refund)
        if (r.bullAmount == 0 || r.bearAmount == 0 || r.closePrice == r.lockPrice) {
            r.cancelled = true;
            emit CancelRound(epoch);
            return;
        }

        // Calculate protocol fee and reward pool
        uint256 fee = (r.totalAmount * treasuryFee) / 10000;
        treasuryAmount    += fee;
        r.rewardBaseCalData = (r.closePrice > r.lockPrice) ? r.bullAmount : r.bearAmount;
        r.rewardAmount      = r.totalAmount - fee;

        emit EndRound(epoch, roundId, price);
    }

    /// @dev Fetch price + staleness check. Reverts if oracle data is too old.
    function _getPriceFromOracle() internal view returns (int256 price, uint80 roundId) {
        uint256 leastAllowedTimestamp = block.timestamp > oracleUpdateAllowance
            ? block.timestamp - oracleUpdateAllowance
            : 0;
        (uint80 _roundId, int256 _price, , uint256 updatedAt, ) =
            IDiaOracle(oracleAddress).latestRoundData();

        require(_price > 0,                    "LP: invalid oracle price");
        require(updatedAt >= leastAllowedTimestamp, "LP: oracle price stale");
        require(updatedAt <= block.timestamp,  "LP: oracle future timestamp");

        return (_price, _roundId);
    }

    function _isBettingOpen(uint256 epoch) internal view returns (bool) {
        Round memory r = rounds[epoch];
        return r.startTimestamp > 0 && block.timestamp < r.lockTimestamp - bufferSeconds;
    }

    /// @dev Safe ETH transfer — reverts on failure instead of silent fail
    function _safeTransfer(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "LP: transfer failed");
    }

    receive() external payable {}
}
