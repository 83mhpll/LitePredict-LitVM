/**
 * sports-oracle-keeper.js
 * ------------------------
 * Off-chain "oracle" for SportsMarket.sol.
 *
 * HONEST NOTE ON TRUST: this is a centralized keeper, not a decentralized
 * oracle. It's trusted to (a) create markets for real upcoming games and
 * (b) report the real outcome after the game ends. That's the same trust
 * model as most early prediction-market products. If/when a real sports
 * data oracle exists on LitVM, this keeper's resolve step could be replaced
 * by reading from that oracle instead of a centralized API call.
 *
 * What this script does, every poll interval:
 *  1. Fetch scheduled + completed games from a sports data API
 *  2. For newly scheduled games not yet on-chain -> call createMarket()
 *  3. For games that finished but aren't resolved on-chain -> call resolveMarket()
 *
 * This has NOT been run end-to-end in this environment (no network access
 * to sports data APIs here) - test it yourself before trusting it with
 * anything beyond testnet play money.
 */

const { ethers } = require("ethers");

// ── Config ──
const RPC_URL = process.env.LITVM_RPC || "https://liteforge.rpc.caldera.xyz/http";
const SPORTS_MARKET_ADDRESS = process.env.SPORTS_MARKET_ADDRESS; // deploy SportsMarket.sol, put address here
const RESOLVER_PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY;   // the keeper's wallet - keep this secret, never commit it
const POLL_INTERVAL_MS = 60_000; // check every 60s

// Pick your sports data source. ESPN's public scoreboard endpoints require no API key
// and cover NFL/NBA/soccer. Swap this for SportRadar or another provider if you have a key.
const SPORTS_ENDPOINTS = {
  nfl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  nba: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
  worldcup: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
};

const SPORTS_MARKET_ABI = [
  "function nextMarketId() view returns (uint256)",
  "function markets(uint256) view returns (string title, string homeTeam, string awayTeam, uint256 closeTime, uint256 homePool, uint256 awayPool, uint8 outcome, bool exists)",
  "function createMarket(string title, string homeTeam, string awayTeam, uint256 closeTime) returns (uint256)",
  "function resolveMarket(uint256 marketId, uint8 outcome)",
];

// Local memory of which real-world game ID maps to which on-chain marketId,
// so we don't create duplicate markets. In production, persist this to a
// small database/file instead of memory.
const gameIdToMarketId = new Map();

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI, wallet);

async function fetchGames(league) {
  const res = await fetch(SPORTS_ENDPOINTS[league]);
  if (!res.ok) throw new Error(`${league} fetch failed: ${res.status}`);
  const data = await res.json();

  return (data.events || []).map((event) => {
    const competition = event.competitions[0];
    const home = competition.competitors.find((c) => c.homeAway === "home");
    const away = competition.competitors.find((c) => c.homeAway === "away");
    const completed = competition.status.type.completed;

    return {
      gameId: event.id,
      title: event.shortName,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      startTime: new Date(event.date),
      completed,
      homeWon: completed ? Number(home.score) > Number(away.score) : null,
      awayWon: completed ? Number(away.score) > Number(home.score) : null,
    };
  });
}

async function ensureMarketCreated(game) {
  if (gameIdToMarketId.has(game.gameId)) return gameIdToMarketId.get(game.gameId);

  const closeTimeUnix = Math.floor(game.startTime.getTime() / 1000);
  console.log(`Creating market: ${game.title}`);
  const tx = await contract.createMarket(game.title, game.homeTeam, game.awayTeam, closeTimeUnix);
  const receipt = await tx.wait();

  const marketId = (await contract.nextMarketId()) - 1n;
  gameIdToMarketId.set(game.gameId, marketId);
  console.log(`  -> on-chain marketId ${marketId}, tx ${receipt.hash}`);
  return marketId;
}

async function resolveIfFinished(game, marketId) {
  const onChain = await contract.markets(marketId);
  const alreadyResolved = Number(onChain.outcome) !== 0; // 0 = Unresolved
  if (!game.completed || alreadyResolved) return;

  const outcome = game.homeWon ? 1 : 2; // 1 = HomeWins, 2 = AwayWins
  console.log(`Resolving market ${marketId} (${game.title}) -> ${game.homeWon ? "home" : "away"} wins`);
  const tx = await contract.resolveMarket(marketId, outcome);
  await tx.wait();
  console.log(`  -> resolved, tx ${tx.hash}`);
}

async function pollLeague(league) {
  try {
    const games = await fetchGames(league);
    for (const game of games) {
      // Only track games starting within the next 14 days, to avoid creating
      // markets for far-future games with unstable data.
      const daysAway = (game.startTime - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysAway > 14 || daysAway < -3) continue;

      const marketId = await ensureMarketCreated(game);
      await resolveIfFinished(game, marketId);
    }
  } catch (err) {
    console.error(`[${league}] poll error:`, err.message);
  }
}

async function main() {
  if (!SPORTS_MARKET_ADDRESS || !RESOLVER_PRIVATE_KEY) {
    console.error("Set SPORTS_MARKET_ADDRESS and RESOLVER_PRIVATE_KEY env vars first.");
    process.exit(1);
  }

  console.log("Sports oracle keeper started. Polling every", POLL_INTERVAL_MS / 1000, "s");
  const leagues = Object.keys(SPORTS_ENDPOINTS);

  const tick = async () => {
    for (const league of leagues) await pollLeague(league);
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main();
