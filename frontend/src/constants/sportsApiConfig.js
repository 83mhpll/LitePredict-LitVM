/* ── Sports Data API Config ──
 *
 * TheSportsDB — works immediately, no signup. "3" is their public free
 * test key (permanently free tier, rate-limited but fine for this use).
 * Used for: NFL schedule.
 *
 * API-Sports (MMA) — needs a free account. Sign up at
 * https://api-sports.io (or dashboard.api-football.com, same account
 * covers all their sports APIs) → grab your key from the dashboard →
 * paste it below. Free tier: 100 requests/day. Used for: UFC schedule
 * and final results (settlement).
 *
 * Sportmonks — needs a free account at https://www.sportmonks.com →
 * Football API → free plan covers 2 leagues. Paste your token below.
 * Used for: soccer fixtures/results for whichever 2 leagues your plan covers.
 *
 * Leave a key as "" to skip that source — the app falls back to the
 * verified hardcoded data for that sport instead of showing nothing.
 *
 * IMPORTANT CAVEAT: these fetches run in each visitor's browser, not on
 * a server. API-Sports' 100/day limit is shared across every visitor
 * using this key — with real traffic you'll blow through it fast. The
 * proper fix later is moving these calls into a small server-side job
 * (e.g. the keeper bot) that fetches once and serves cached results to
 * everyone, instead of every browser hitting the API directly.
 */
export const THESPORTSDB_KEY = "3";
export const API_SPORTS_MMA_KEY = ""; // paste your api-sports.io key here
export const SPORTMONKS_KEY = "";     // paste your sportmonks.com token here

export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h — keep API-Sports calls well under 100/day
