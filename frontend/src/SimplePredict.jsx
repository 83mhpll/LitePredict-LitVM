import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { LITE_PREDICT_ABI, DEFAULT_CONTRACT, LITVM_RPC } from "./constants/contract";
import { SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI } from "./constants/sportsContract";
import { fmtTime, fmt4 } from "./utils/format";

const SPORTS_LIVE = Boolean(SPORTS_MARKET_ADDRESS);

/* ──────────────────────────────────────────────────────────
   Fallback game list, used only in demo mode (before SportsMarket
   is deployed). Once SPORTS_MARKET_ADDRESS is set, real markets
   are read directly from the contract instead of this list.
────────────────────────────────────────────────────────── */
const DEMO_SPORTS_GAMES = [
  {
    id: "hof-2026",
    tag: "Hall of Fame Game",
    date: "Aug 7",
    home: { name: "Cardinals", abbr: "ARI", prob: 47.8 },
    away: { name: "Panthers", abbr: "CAR", prob: 52.2 },
  },
  {
    id: "pre1-detcin-2026",
    tag: "Preseason Wk 1",
    date: "Aug 14",
    home: { name: "Bengals", abbr: "CIN", prob: 50 },
    away: { name: "Lions", abbr: "DET", prob: 50 },
  },
  {
    id: "pre1-neind-2026",
    tag: "Preseason Wk 1",
    date: "Aug 14",
    home: { name: "Patriots", abbr: "NE", prob: 50 },
    away: { name: "Colts", abbr: "IND", prob: 50 },
  },
];

/* ── Local demo bet ledger for sports (only used pre-deploy) ── */
const SPORTS_BETS_KEY = "lp_sports_demo_bets";
function useSportsDemoBets() {
  const [bets, setBets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(SPORTS_BETS_KEY)) || []; }
    catch { return []; }
  });
  const placeBet = useCallback((gameId, side, amount) => {
    setBets(prev => {
      const next = [...prev, { gameId, side, amount, id: Date.now() }];
      localStorage.setItem(SPORTS_BETS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return { bets, placeBet };
}

/* ── Real on-chain sports markets (used once SPORTS_MARKET_ADDRESS is set) ── */
function useOnChainSportsMarkets() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(SPORTS_LIVE);

  const fetchMarkets = useCallback(async () => {
    if (!SPORTS_LIVE) return;
    try {
      const provider = new ethers.JsonRpcProvider(LITVM_RPC);
      const contract = new ethers.Contract(SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI, provider);
      const count = Number(await contract.nextMarketId());
      const results = [];
      for (let i = 0; i < count; i++) {
        const m = await contract.markets(i);
        if (!m.exists) continue;
        const homePool = parseFloat(ethers.formatEther(m.homePool));
        const awayPool = parseFloat(ethers.formatEther(m.awayPool));
        const total = homePool + awayPool;
        results.push({
          marketId: i,
          title: m.title,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          closeTime: Number(m.closeTime),
          homePct: total > 0 ? (homePool / total) * 100 : 50,
          awayPct: total > 0 ? (awayPool / total) * 100 : 50,
          outcome: Number(m.outcome), // 0 = unresolved, 1 = home won, 2 = away won, 3 = cancelled
        });
      }
      setMarkets(results);
    } catch (e) {
      console.warn("Failed to load sports markets", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    const id = setInterval(fetchMarkets, 15000);
    return () => clearInterval(id);
  }, [fetchMarkets]);

  const placeBet = useCallback(async (marketId, side) => {
    if (!window.ethereum) throw new Error("No wallet found — install MetaMask to bet on sports markets.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI, signer);
    const value = ethers.parseEther("0.01"); // fixed demo amount, same as crypto side for now
    const tx = await contract.bet(marketId, side, { value }); // side: 1 = home, 2 = away
    await tx.wait();
    await fetchMarkets();
  }, [fetchMarkets]);

  return { markets, loading, placeBet, refetch: fetchMarkets };
}

export default function SimplePredict({ onSwitchToClassic }) {
  const [theme, setTheme] = useState("dark");
  const [category, setCategory] = useState("crypto");

  // ── Read-only on-chain data (no wallet needed to view) ──
  const [account, setAccount] = useState("");
  const [currentEpoch, setCurrentEpoch] = useState(null);
  const [round, setRound] = useState(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { bets: sportsBets, placeBet: placeSportsDemoBet } = useSportsDemoBets();
  const onChainSports = useOnChainSportsMarkets();
  const [sportsBusy, setSportsBusy] = useState(false);
  const [sportsError, setSportsError] = useState("");

  const handleSportsBet = async (identifier, side) => {
    if (!SPORTS_LIVE) {
      placeSportsDemoBet(identifier, side, 10);
      return;
    }
    setSportsBusy(true);
    setSportsError("");
    try {
      await onChainSports.placeBet(identifier, side === "home" ? 1 : 2);
    } catch (e) {
      setSportsError(e?.shortMessage || e?.message || "Sports bet failed.");
    } finally {
      setSportsBusy(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchRound = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider(LITVM_RPC);
      const contract = new ethers.Contract(DEFAULT_CONTRACT, LITE_PREDICT_ABI, provider);
      const epoch = await contract.currentEpoch();
      const r = await contract.rounds(epoch);
      setCurrentEpoch(epoch);
      setRound({
        lockTimestamp: Number(r.lockTimestamp),
        closeTimestamp: Number(r.closeTimestamp),
        bullAmount: ethers.formatEther(r.bullAmount),
        bearAmount: ethers.formatEther(r.bearAmount),
        totalAmount: ethers.formatEther(r.totalAmount),
      });
      setError("");
    } catch (e) {
      setError("Couldn't reach LitVM testnet — showing last known data.");
      console.warn("fetchRound failed", e);
    }
  }, []);

  useEffect(() => {
    fetchRound();
    const id = setInterval(fetchRound, 10000);
    return () => clearInterval(id);
  }, [fetchRound]);

  const connectWallet = async () => {
    if (!window.ethereum) { setError("No wallet found — install MetaMask to place real bets."); return; }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accs = await provider.send("eth_requestAccounts", []);
      setAccount(accs[0]);
    } catch (e) {
      setError("Wallet connection was rejected or failed.");
    }
  };

  const placeCryptoBet = async (side) => {
    if (!account) { await connectWallet(); return; }
    if (currentEpoch === null) return;
    setBusy(true);
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(DEFAULT_CONTRACT, LITE_PREDICT_ABI, signer);
      const value = ethers.parseEther("0.01"); // fixed demo amount, wire to a real input before shipping
      const tx = side === "yes"
        ? await contract.betBull(currentEpoch, { value })
        : await contract.betBear(currentEpoch, { value });
      await tx.wait();
      await fetchRound();
    } catch (e) {
      setError(e?.shortMessage || "Bet failed — check your wallet has testnet zkLTC.");
    } finally {
      setBusy(false);
    }
  };

  const secondsLeft = round ? Math.max(0, round.lockTimestamp - now) : 0;
  const bullPct = round && parseFloat(round.totalAmount) > 0
    ? (parseFloat(round.bullAmount) / parseFloat(round.totalAmount)) * 100
    : 50;
  const bearPct = 100 - bullPct;

  return (
    <div data-theme={theme} className="sp-root">
      <style>{SIMPLE_STYLES}</style>

      <div className="sp-nav">
        <div className="sp-logo"><div className="sp-logo-mark">LP</div>LitePredict</div>
        <div className="sp-nav-right">
          <button className="sp-link" onClick={onSwitchToClassic}>Classic view</button>
          <div className="sp-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
            <div className="sp-toggle-knob" />
          </div>
          {account
            ? <span className="sp-account">{account.slice(0,6)}…{account.slice(-4)}</span>
            : <button className="sp-wallet-btn" onClick={connectWallet}>Connect wallet</button>}
        </div>
      </div>

      <div className="sp-cats">
        <button className={`sp-cat ${category === "crypto" ? "active" : ""}`} onClick={() => setCategory("crypto")}>Crypto</button>
        <button className={`sp-cat ${category === "sports" ? "active" : ""}`} onClick={() => setCategory("sports")}>Sports</button>
      </div>

      {error && <div className="sp-error">{error}</div>}

      <div className="sp-layout">
        {category === "crypto" && (
          <div className="sp-card">
            <div className="sp-card-head">
              <div className="sp-icon">Ł</div>
              <div>
                <p className="sp-title">Will the current LTC round close Bull?</p>
                <p className="sp-sub">
                  {round ? `Locks in ${fmtTime(secondsLeft)}` : "Loading round data…"}
                  {currentEpoch !== null && ` · Round #${currentEpoch}`}
                </p>
              </div>
              <div className="sp-live-pill">Live · on-chain</div>
            </div>

            <div className="sp-prob-bar">
              <div className="sp-prob-a" style={{ width: `${bullPct}%` }} />
              <div className="sp-prob-b" style={{ width: `${bearPct}%` }} />
            </div>
            <div className="sp-prob-labels">
              <span><b>{bullPct.toFixed(0)}%</b> Bull</span>
              <span><b>{bearPct.toFixed(0)}%</b> Bear</span>
            </div>

            <div className="sp-bet-row">
              <button className="sp-bet sp-bet-a" disabled={busy} onClick={() => placeCryptoBet("yes")}>
                {account ? "Bet Bull (0.01)" : "Connect to bet Bull"}
              </button>
              <button className="sp-bet sp-bet-b" disabled={busy} onClick={() => placeCryptoBet("no")}>
                {account ? "Bet Bear (0.01)" : "Connect to bet Bear"}
              </button>
            </div>
            <p className="sp-note">Pool: {round ? fmt4(round.totalAmount) : "—"} zkLTC · fixed 0.01 zkLTC per click for now, swap for a real amount input before shipping.</p>
          </div>
        )}

        {category === "sports" && (
          <>
            {!SPORTS_LIVE && (
              <div className="sp-demo-banner">
                Demo mode — sports bets are saved on this device only, not on-chain yet. Set <code>SPORTS_MARKET_ADDRESS</code> in <code>constants/sportsContract.js</code> after running <code>deploy_sports_litvm.sh</code> to go live.
              </div>
            )}
            {SPORTS_LIVE && sportsError && <div className="sp-error">{sportsError}</div>}

            {SPORTS_LIVE && onChainSports.loading && (
              <p className="sp-note">Loading on-chain markets…</p>
            )}

            {SPORTS_LIVE && !onChainSports.loading && onChainSports.markets.length === 0 && (
              <p className="sp-note">No sports markets created yet. Run <code>deploy_sports_litvm.sh</code> to seed some.</p>
            )}

            {SPORTS_LIVE
              ? onChainSports.markets.map(m => (
                  <div className="sp-card" key={m.marketId}>
                    <div className="sp-card-head">
                      <div className="sp-icon">🏈</div>
                      <div>
                        <p className="sp-title">{m.title}</p>
                        <p className="sp-sub">
                          {m.outcome === 0 ? `Closes ${new Date(m.closeTime * 1000).toLocaleString()}` : "Resolved"}
                        </p>
                      </div>
                      <div className="sp-live-pill">Live · on-chain</div>
                    </div>
                    <div className="sp-prob-bar">
                      <div className="sp-prob-a" style={{ width: `${m.awayPct}%` }} />
                      <div className="sp-prob-b" style={{ width: `${m.homePct}%` }} />
                    </div>
                    <div className="sp-prob-labels">
                      <span><b>{m.awayPct.toFixed(0)}%</b> {m.awayTeam}</span>
                      <span><b>{m.homePct.toFixed(0)}%</b> {m.homeTeam}</span>
                    </div>
                    <div className="sp-bet-row">
                      <button className="sp-bet sp-bet-a" disabled={sportsBusy || m.outcome !== 0} onClick={() => handleSportsBet(m.marketId, "away")}>{m.awayTeam}</button>
                      <button className="sp-bet sp-bet-b" disabled={sportsBusy || m.outcome !== 0} onClick={() => handleSportsBet(m.marketId, "home")}>{m.homeTeam}</button>
                    </div>
                  </div>
                ))
              : DEMO_SPORTS_GAMES.map(g => {
                  const myBets = sportsBets.filter(b => b.gameId === g.id);
                  return (
                    <div className="sp-card" key={g.id}>
                      <div className="sp-card-head">
                        <div className="sp-icon">🏈</div>
                        <div>
                          <p className="sp-title">{g.away.name} @ {g.home.name}</p>
                          <p className="sp-sub">{g.tag} · {g.date}</p>
                        </div>
                      </div>
                      <div className="sp-prob-bar">
                        <div className="sp-prob-a" style={{ width: `${g.away.prob}%` }} />
                        <div className="sp-prob-b" style={{ width: `${g.home.prob}%` }} />
                      </div>
                      <div className="sp-prob-labels">
                        <span><b>{g.away.prob}%</b> {g.away.name}</span>
                        <span><b>{g.home.prob}%</b> {g.home.name}</span>
                      </div>
                      <div className="sp-bet-row">
                        <button className="sp-bet sp-bet-a" onClick={() => handleSportsBet(g.id, "away")}>{g.away.name}</button>
                        <button className="sp-bet sp-bet-b" onClick={() => handleSportsBet(g.id, "home")}>{g.home.name}</button>
                      </div>
                      {myBets.length > 0 && (
                        <p className="sp-note">Your demo bets: {myBets.map(b => b.side).join(", ")}</p>
                      )}
                    </div>
                  );
                })}
          </>
        )}
      </div>
    </div>
  );
}

const SIMPLE_STYLES = `
.sp-root{
  --bg:#0b0e14; --bg-alt:#151922; --border:#242a36;
  --text:#f4f5f7; --text-2:#9aa1ae; --text-3:#5b6270;
  --blue:#3b6bff; --green:#22c55e; --green-dim:#10241a;
  --red:#f2495c; --red-dim:#2a1418;
  background:var(--bg); color:var(--text); min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;
}
.sp-root[data-theme="light"]{
  --bg:#ffffff; --bg-alt:#f7f8fa; --border:#e5e7eb;
  --text:#0b0e14; --text-2:#6b7280; --text-3:#9ca3af;
  --blue:#1652f0; --green:#059669; --green-dim:#ecfdf5;
  --red:#dc2626; --red-dim:#fef2f2;
}
.sp-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);max-width:720px;margin:0 auto;}
.sp-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;}
.sp-logo-mark{width:22px;height:22px;border-radius:6px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;}
.sp-nav-right{display:flex;align-items:center;gap:12px;}
.sp-link{background:none;border:none;color:var(--text-2);font-size:13px;cursor:pointer;text-decoration:underline;}
.sp-toggle{width:44px;height:24px;border-radius:20px;background:var(--bg-alt);border:1px solid var(--border);position:relative;cursor:pointer;flex-shrink:0;}
.sp-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--text);transition:transform .15s;}
.sp-root[data-theme="light"] .sp-toggle-knob{transform:translateX(20px);}
.sp-wallet-btn{background:var(--blue);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
.sp-account{font-size:12px;color:var(--text-2);font-family:monospace;}
.sp-cats{display:flex;gap:8px;padding:14px 24px 0;max-width:720px;margin:0 auto;}
.sp-cat{border:1px solid var(--border);background:transparent;color:var(--text-2);font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;}
.sp-cat.active{background:var(--text);color:var(--bg);border-color:var(--text);}
.sp-error{max-width:720px;margin:14px auto 0;padding:10px 16px;background:var(--red-dim);color:var(--red);border-radius:8px;font-size:12px;}
.sp-demo-banner{max-width:720px;margin:0 auto 12px;padding:10px 16px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-2);}
.sp-demo-banner code{color:var(--text);}
.sp-layout{max-width:720px;margin:0 auto;padding:16px 24px 40px;}
.sp-card{background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:14px;}
.sp-card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.sp-icon{width:30px;height:30px;border-radius:50%;background:var(--bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text-2);}
.sp-title{font-size:15px;font-weight:600;margin:0;}
.sp-sub{font-size:12px;color:var(--text-3);margin:2px 0 0;}
.sp-live-pill{margin-left:auto;font-size:11px;font-weight:600;color:var(--green);background:var(--green-dim);padding:4px 10px;border-radius:20px;white-space:nowrap;}
.sp-prob-bar{display:flex;height:8px;border-radius:20px;overflow:hidden;background:var(--border);margin-bottom:8px;}
.sp-prob-a{background:var(--green);}
.sp-prob-b{background:var(--red);}
.sp-prob-labels{display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:16px;}
.sp-prob-labels b{color:var(--text);}
.sp-bet-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.sp-bet{border:none;border-radius:10px;padding:14px 0;font-size:14px;font-weight:700;cursor:pointer;}
.sp-bet:disabled{opacity:.5;cursor:not-allowed;}
.sp-bet-a{background:var(--green-dim);color:var(--green);}
.sp-bet-b{background:var(--red-dim);color:var(--red);}
.sp-note{font-size:11px;color:var(--text-3);margin-top:10px;}
`;
