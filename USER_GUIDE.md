# LitePredict — User Guide

LitePredict lets you bet on whether the price of LTC will be **higher or lower** at the end of a short round. This guide explains how it works in plain English.

## How a round works

1. **A round opens.** You'll see a countdown ("Next Scan") — this is how long you have to place a bet.
2. **Pick a side.**
   - **YES** — you think the price will be *higher* when the round ends.
   - **NO** — you think the price will be *lower* when the round ends.
3. **The round locks.** No more bets. The current price becomes the "lock price."
4. **The round closes.** The oracle reports the final price. Whichever side was correct splits the losing side's pool, minus a small protocol fee.
5. **Claim your winnings.** If you won, claim from the Portfolio tab. Winnings don't pay out automatically — you have to claim them.

## Key terms

| Term | Meaning |
|---|---|
| **Round / Epoch** | One betting cycle, from open to close (currently 5 minutes). |
| **Lock price** | The price recorded the moment betting closes. |
| **Close price** | The final price used to decide the winning side. |
| **zkLTC** | Testnet LTC used on LitVM — bridged 1:1 with real LTC, but on testnet it's free from the faucet and has no real value. |
| **Pool** | The total amount bet on a round, split into a YES pool and a NO pool. |
| **LitePoints** | Non-monetary points earned for activity (betting, providing liquidity, streaks). Used for leaderboards and possible future rewards — not a token, not guaranteed. |
| **Keeper bot** | The automated service that closes each round and requests the next price from the oracle. If it's ever late, rounds pause until it catches up. |

## Testnet & risk notice

- LitePredict currently runs on the **LitVM testnet only**. zkLTC used here has **no real-world value** — do not send real funds to testnet contracts.
- The smart contracts are **unaudited**. Don't treat testnet balances, points, or leaderboard standing as a guarantee of anything at mainnet launch.
- Prices come from a DIA oracle feed. Oracle delays or outages can pause or cancel a round — cancelled rounds refund your bet, they don't count as a loss.

## FAQ

**Why is my pool showing 0.0000 zkLTC?**
The round just opened and no one has bet yet — it fills as people place YES/NO bets.

**I don't see my bet — where did it go?**
Check the Portfolio tab. Bets are grouped by round, and winnings need to be claimed manually.

**Can I bet on both YES and NO in the same round?**
Yes, technically nothing stops you, but you'd just be paying fees on both sides — not recommended.

**What happens if I don't claim my winnings?**
They stay claimable — there's currently no expiry — but you won't see them reflected in your live balance until you claim.
