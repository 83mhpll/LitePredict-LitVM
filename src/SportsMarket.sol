// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * SportsMarket
 * ------------
 * Binary outcome market for real-world events (NFL/NBA/World Cup games, etc)
 * that CANNOT be resolved by a price oracle like LitePredict.sol's DIA feed.
 *
 * Key difference from LitePredict.sol:
 *  - LitePredict: fixed-length rounds, resolved automatically by a price feed.
 *  - SportsMarket: one market per real-world event, resolved manually by a
 *    trusted "resolver" address once the event's real outcome is known.
 *
 * This is intentionally simple (MVP / testnet). Trust assumption: the
 * `resolver` role is centralized. That's normal for an early-stage sports
 * prediction product (see notes at the bottom) but should be clearly
 * disclosed to users, and ideally moved to a multisig before real funds
 * are involved.
 */
contract SportsMarket {
    address public owner;
    address public resolver; // can be the same as owner, or a separate ops account

    enum Outcome { Unresolved, HomeWins, AwayWins, Cancelled }

    struct Market {
        string title;          // e.g. "ARI @ CAR - Hall of Fame Game"
        string homeTeam;       // e.g. "Arizona Cardinals"
        string awayTeam;       // e.g. "Carolina Panthers"
        uint256 closeTime;     // betting closes at kickoff
        uint256 homePool;
        uint256 awayPool;
        Outcome outcome;
        bool exists;
    }

    // marketId => Market
    mapping(uint256 => Market) public markets;
    uint256 public nextMarketId;

    // marketId => user => side (1 = home, 2 = away) => amount
    mapping(uint256 => mapping(address => mapping(uint8 => uint256))) public bets;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event MarketCreated(uint256 indexed marketId, string title, uint256 closeTime);
    event BetPlaced(uint256 indexed marketId, address indexed user, uint8 side, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event Claimed(uint256 indexed marketId, address indexed user, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver, "not resolver");
        _;
    }

    constructor(address _resolver) {
        owner = msg.sender;
        resolver = _resolver;
    }

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
    }

    /// @notice Create a new sports market. Called by owner/ops when a new game is scheduled.
    function createMarket(
        string calldata title,
        string calldata homeTeam,
        string calldata awayTeam,
        uint256 closeTime
    ) external onlyOwner returns (uint256 marketId) {
        require(closeTime > block.timestamp, "closeTime in past");
        marketId = nextMarketId++;
        markets[marketId] = Market({
            title: title,
            homeTeam: homeTeam,
            awayTeam: awayTeam,
            closeTime: closeTime,
            homePool: 0,
            awayPool: 0,
            outcome: Outcome.Unresolved,
            exists: true
        });
        emit MarketCreated(marketId, title, closeTime);
    }

    /// @notice Bet on the home team (side = 1) or away team (side = 2).
    function bet(uint256 marketId, uint8 side) external payable {
        Market storage m = markets[marketId];
        require(m.exists, "no such market");
        require(block.timestamp < m.closeTime, "betting closed");
        require(side == 1 || side == 2, "invalid side");
        require(msg.value > 0, "zero bet");

        bets[marketId][msg.sender][side] += msg.value;
        if (side == 1) {
            m.homePool += msg.value;
        } else {
            m.awayPool += msg.value;
        }
        emit BetPlaced(marketId, msg.sender, side, msg.value);
    }

    /// @notice Resolver marks the real-world outcome once the game has ended.
    function resolveMarket(uint256 marketId, Outcome outcome) external onlyResolver {
        Market storage m = markets[marketId];
        require(m.exists, "no such market");
        require(m.outcome == Outcome.Unresolved, "already resolved");
        require(
            outcome == Outcome.HomeWins || outcome == Outcome.AwayWins || outcome == Outcome.Cancelled,
            "invalid outcome"
        );
        m.outcome = outcome;
        emit MarketResolved(marketId, outcome);
    }

    /// @notice Claim winnings (or a refund if the market was cancelled).
    function claim(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.exists, "no such market");
        require(m.outcome != Outcome.Unresolved, "not resolved yet");
        require(!claimed[marketId][msg.sender], "already claimed");

        uint256 payout;

        if (m.outcome == Outcome.Cancelled) {
            payout = bets[marketId][msg.sender][1] + bets[marketId][msg.sender][2];
        } else {
            uint8 winningSide = m.outcome == Outcome.HomeWins ? 1 : 2;
            uint256 userBet = bets[marketId][msg.sender][winningSide];
            require(userBet > 0, "no winning bet");

            uint256 totalPool = m.homePool + m.awayPool;
            uint256 winningPool = winningSide == 1 ? m.homePool : m.awayPool;

            // 2% protocol fee, same as LitePredict's convention
            uint256 distributable = (totalPool * 98) / 100;
            payout = (userBet * distributable) / winningPool;
        }

        require(payout > 0, "nothing to claim");
        claimed[marketId][msg.sender] = true;
        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "transfer failed");
        emit Claimed(marketId, msg.sender, payout);
    }
}

/**
 * NOTES / open questions for whoever picks this up next:
 *
 * 1. Resolution trust: right now a single `resolver` address decides outcomes.
 *    For a real product this should become a 2-of-3 multisig at minimum, or
 *    ideally pull from a sports-data oracle if/when one exists on LitVM.
 *
 * 2. Populating markets: someone (a keeper bot, similar to the existing
 *    `/keeper` folder) needs to call `createMarket` for upcoming games and
 *    `resolveMarket` after they end. That data can come from a sports data
 *    API - matching what's shown in the mockup below.
 *
 * 3. Dispute window: consider adding a delay between `resolveMarket` and
 *    when `claim` becomes callable, so an obviously wrong resolution can be
 *    caught and corrected before money moves.
 *
 * 4. This has NOT been tested with forge test or audited. Treat as a
 *    starting sketch, not something to deploy with real funds.
 */
