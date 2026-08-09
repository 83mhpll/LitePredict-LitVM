import React, { useState, useEffect, useCallback, useMemo } from "react";
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
    tag: "NFL",
    date: "Aug 7",
    home: { name: "Cardinals", abbr: "ARI", prob: 47.8 },
    away: { name: "Panthers", abbr: "CAR", prob: 52.2 },
  },
  {
    id: "pre1-detcin-2026",
    tag: "NFL",
    date: "Aug 14",
    home: { name: "Bengals", abbr: "CIN", prob: 50 },
    away: { name: "Lions", abbr: "DET", prob: 50 },
  },
];

/* Guess a sport tag + emoji from a market title, for the pill list */
function sportMeta(title = "") {
  const t = title.toUpperCase();
  if (t.includes("UFC")) return { tag: "UFC", icon: "🥊" };
  if (t.includes("ONE ")) return { tag: "ONE Championship", icon: "🥋" };
  if (t.includes("UCL") || t.includes("CHAMPIONS LEAGUE")) return { tag: "Soccer", icon: "⚽" };
  return { tag: "NFL", icon: "🏈" };
}

/* Detect installed injected wallets. Modern multi-wallet browsers expose
   window.ethereum.providers (array); single-wallet setups just have
   window.ethereum with flags like isMetaMask / isRabby on it directly. */
function detectWallets() {
  if (typeof window === "undefined" || !window.ethereum) return [];
  const raw = window.ethereum.providers?.length ? window.ethereum.providers : [window.ethereum];
  const seen = new Set();
  const wallets = [];
  for (const p of raw) {
    let name = "Browser Wallet", icon = "🦊";
    if (p.isRabby) { name = "Rabby"; icon = "🐰"; }
    else if (p.isMetaMask) { name = "MetaMask"; icon = "🦊"; }
    else if (p.isCoinbaseWallet) { name = "Coinbase Wallet"; icon = "🔵"; }
    if (seen.has(name)) continue;
    seen.add(name);
    wallets.push({ name, icon, provider: p });
  }
  return wallets;
}

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

  const placeBet = useCallback(async (marketId, side, amount) => {
    if (!window.ethereum) throw new Error("No wallet found — install MetaMask to bet on sports markets.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI, signer);
    const value = ethers.parseEther(String(amount));
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
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const { bets: sportsDemoBets, placeBet: placeSportsDemoBet } = useSportsDemoBets();
  const onChainSports = useOnChainSportsMarkets();

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
    } catch (e) {
      console.warn("fetchRound failed", e);
    }
  }, []);

  useEffect(() => {
    fetchRound();
    const id = setInterval(fetchRound, 10000);
    return () => clearInterval(id);
  }, [fetchRound]);

  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signed, setSigned] = useState(false);
  const wallets = useMemo(() => detectWallets(), [walletModalOpen]);

  const connectWithProvider = async (walletProvider) => {
    setConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(walletProvider);
      const accs = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      // sign-in step: proves the connected account actually controls this wallet
      const message = `Sign in to LitePredict\n\nThis signature doesn't cost gas and doesn't authorize any transaction — it just verifies you control this wallet.\n\nWallet: ${accs[0]}\nTime: ${new Date().toISOString()}`;
      await signer.signMessage(message);
      setAccount(accs[0]);
      setSigned(true);
      setWalletModalOpen(false);
    } catch (e) {
      setToast(e?.shortMessage || e?.message || "Wallet connection was rejected or failed.");
    } finally {
      setConnecting(false);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) { setToast("No wallet found — install MetaMask or Rabby to place real bets."); return; }
    setWalletModalOpen(true);
  };

  const secondsLeft = round ? Math.max(0, round.lockTimestamp - now) : 0;
  const bullPct = round && parseFloat(round.totalAmount) > 0
    ? (parseFloat(round.bullAmount) / parseFloat(round.totalAmount)) * 100
    : 50;
  const bearPct = 100 - bullPct;

  /* ══════════════════════════════════════════════
     BET SLIP — queues picks across markets/sports.
     Each item bets independently (no combined parlay
     payout — the contracts don't support that).
  ══════════════════════════════════════════════ */
  const [slip, setSlip] = useState({}); // key -> item

  const toggleSlip = (key, payload) => {
    setSlip(prev => {
      const existing = prev[key];
      if (existing && existing.sideKey === payload.sideKey) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: { ...payload, amount: existing?.amount ?? "0.01", status: "idle", error: "" } };
    });
  };

  const removeSlip = (key) => setSlip(prev => { const next = { ...prev }; delete next[key]; return next; });

  const setSlipAmount = (key, amount) =>
    setSlip(prev => ({ ...prev, [key]: { ...prev[key], amount } }));

  const slipItems = Object.entries(slip);
  const slipTotal = slipItems.reduce((sum, [, item]) => sum + (parseFloat(item.amount) || 0), 0);

  const placeAll = async () => {
    if (!account) { await connectWallet(); return; }
    for (const [key, item] of Object.entries(slip)) {
      setSlip(prev => ({ ...prev, [key]: { ...prev[key], status: "pending" } }));
      try {
        const amt = parseFloat(item.amount) || 0.01;
        if (item.kind === "crypto") {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const contract = new ethers.Contract(DEFAULT_CONTRACT, LITE_PREDICT_ABI, signer);
          const value = ethers.parseEther(String(amt));
          const tx = item.sideKey === "yes"
            ? await contract.betBull(currentEpoch, { value })
            : await contract.betBear(currentEpoch, { value });
          await tx.wait();
          await fetchRound();
        } else if (item.kind === "sports-onchain") {
          await onChainSports.placeBet(item.marketId, item.sideKey === "home" ? 1 : 2, amt);
        } else {
          placeSportsDemoBet(item.gameId, item.sideKey, amt);
        }
        setSlip(prev => ({ ...prev, [key]: { ...prev[key], status: "success" } }));
      } catch (e) {
        setSlip(prev => ({ ...prev, [key]: { ...prev[key], status: "error", error: e?.shortMessage || e?.message || "Bet failed" } }));
      }
    }
    // clear out anything that succeeded, leave failures visible so they can retry/remove
    setTimeout(() => {
      setSlip(prev => {
        const next = {};
        for (const [k, v] of Object.entries(prev)) if (v.status !== "success") next[k] = v;
        return next;
      });
    }, 1500);
  };

  return (
    <div data-theme={theme} className="mp-root">
      <style>{STYLES}</style>

      <div className="mp-nav">
        <div className="mp-logo"><div className="mp-logo-mark">LP</div>LitePredict</div>
        <div className="mp-nav-right">
          <button className="mp-link" onClick={onSwitchToClassic}>Classic view</button>
          <div className="mp-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
            <div className="mp-toggle-knob" />
          </div>
          {account
            ? <span className="mp-account">{signed && "✓ "}{account.slice(0,6)}…{account.slice(-4)}</span>
            : <button className="mp-wallet-btn" onClick={connectWallet}>Connect wallet</button>}
        </div>
      </div>

      <div className="mp-cats">
        <button className={`mp-cat ${category === "crypto" ? "active" : ""}`} onClick={() => setCategory("crypto")}>Crypto</button>
        <button className={`mp-cat ${category === "sports" ? "active" : ""}`} onClick={() => setCategory("sports")}>Sports</button>
      </div>

      {toast && <div className="mp-toast">{toast}</div>}

      <div className="mp-layout">
        <div className="mp-list">
          {category === "crypto" && (
            <MarketRow
              icon="Ł"
              tag="Crypto"
              title="Will the current LTC round close Bull?"
              sub={round ? `Locks in ${fmtTime(secondsLeft)} · Round #${currentEpoch}` : "Loading round data…"}
              live
              leftLabel="Bull" leftPct={bullPct}
              rightLabel="Bear" rightPct={bearPct}
              selectedSide={slip["crypto"]?.sideKey}
              onSelect={(sideKey, sideLabel, percent) => toggleSlip("crypto", {
                kind: "crypto", title: "LTC round — Bull or Bear?", sideKey, sideLabel, percent,
              })}
            />
          )}

          {category === "sports" && (
            <>
              {!SPORTS_LIVE && (
                <div className="mp-demo-banner">
                  Demo mode — sports bets are saved on this device only, not on-chain yet.
                </div>
              )}
              {SPORTS_LIVE && onChainSports.loading && <p className="mp-note">Loading on-chain markets…</p>}
              {SPORTS_LIVE && !onChainSports.loading && onChainSports.markets.length === 0 && (
                <p className="mp-note">No sports markets yet.</p>
              )}

              {SPORTS_LIVE
                ? onChainSports.markets.map(m => {
                    const meta = sportMeta(m.title);
                    const key = `sports-${m.marketId}`;
                    return (
                      <MarketRow
                        key={key}
                        icon={meta.icon}
                        tag={meta.tag}
                        title={m.title}
                        sub={m.outcome === 0 ? `Closes ${new Date(m.closeTime * 1000).toLocaleDateString()}` : "Resolved"}
                        live={m.outcome === 0}
                        leftLabel={m.awayTeam} leftPct={m.awayPct}
                        rightLabel={m.homeTeam} rightPct={m.homePct}
                        disabled={m.outcome !== 0}
                        selectedSide={slip[key]?.sideKey}
                        onSelect={(sideKey, sideLabel, percent) => toggleSlip(key, {
                          kind: "sports-onchain", marketId: m.marketId, title: m.title, sideKey, sideLabel, percent,
                        })}
                      />
                    );
                  })
                : DEMO_SPORTS_GAMES.map(g => {
                    const key = `sports-demo-${g.id}`;
                    const title = `${g.away.name} @ ${g.home.name}`;
                    return (
                      <MarketRow
                        key={key}
                        icon="🏈"
                        tag={g.tag}
                        title={title}
                        sub={g.date}
                        live
                        leftLabel={g.away.name} leftPct={g.away.prob}
                        rightLabel={g.home.name} rightPct={g.home.prob}
                        selectedSide={slip[key]?.sideKey}
                        onSelect={(sideKey, sideLabel, percent) => toggleSlip(key, {
                          kind: "sports-demo", gameId: g.id, title, sideKey, sideLabel, percent,
                        })}
                      />
                    );
                  })}
            </>
          )}
        </div>

        <aside className="mp-slip">
          <p className="mp-slip-title">Bet Slip {slipItems.length > 0 && <span className="mp-slip-count">{slipItems.length}</span>}</p>

          {slipItems.length === 0 && (
            <p className="mp-slip-empty">Tap Yes/No or a team on any market to add it here. Each pick bets independently — this isn't a combined parlay.</p>
          )}

          {slipItems.map(([key, item]) => (
            <div className={`mp-slip-item ${item.sideKey === "yes" || item.sideKey === "away" ? "side-a" : "side-b"}`} key={key}>
              <div className="mp-slip-item-head">
                <div>
                  <p className="mp-slip-item-title">{item.title}</p>
                  <p className="mp-slip-item-side">{item.sideLabel} <b>{Math.round(item.percent)}%</b></p>
                </div>
                <button className="mp-slip-remove" onClick={() => removeSlip(key)}>✕</button>
              </div>
              <input
                className="mp-slip-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={item.amount}
                disabled={item.status === "pending" || item.status === "success"}
                onChange={e => setSlipAmount(key, e.target.value)}
              />
              {item.status === "pending" && <p className="mp-slip-status pending">Sending…</p>}
              {item.status === "success" && <p className="mp-slip-status success">Confirmed ✓</p>}
              {item.status === "error" && <p className="mp-slip-status error">{item.error}</p>}
            </div>
          ))}

          {slipItems.length > 0 && (
            <>
              <div className="mp-slip-total">
                <span>Total stake</span>
                <b>{slipTotal.toFixed(4)} zkLTC</b>
              </div>
              <button className="mp-slip-submit" onClick={placeAll}>
                {account ? `Place ${slipItems.length} bet${slipItems.length > 1 ? "s" : ""}` : "Connect wallet to place bets"}
              </button>
            </>
          )}
        </aside>
      </div>

      {walletModalOpen && (
        <div className="mp-modal-overlay" onClick={() => !connecting && setWalletModalOpen(false)}>
          <div className="mp-modal" onClick={e => e.stopPropagation()}>
            <div className="mp-modal-head">
              <p className="mp-modal-title">Connect a wallet</p>
              <button className="mp-modal-close" onClick={() => setWalletModalOpen(false)} disabled={connecting}>✕</button>
            </div>

            {wallets.length === 0 && (
              <p className="mp-modal-empty">No wallet extension detected. Install <a href="https://metamask.io" target="_blank" rel="noreferrer">MetaMask</a> or <a href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a> and refresh.</p>
            )}

            {wallets.map(w => (
              <button
                key={w.name}
                className="mp-modal-wallet"
                disabled={connecting}
                onClick={() => connectWithProvider(w.provider)}
              >
                <span className="mp-modal-wallet-icon">{w.icon}</span>
                <span className="mp-modal-wallet-name">{w.name}</span>
                {connecting && <span className="mp-modal-wallet-status">Connecting…</span>}
              </button>
            ))}

            <p className="mp-modal-note">Connecting will ask you to approve access, then sign a free message to verify you own the wallet. No transaction, no gas.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* Compact Meridian-style market row: icon, tag/title, two odds pills */
function MarketRow({ icon, tag, title, sub, live, leftLabel, leftPct, rightLabel, rightPct, disabled, selectedSide, onSelect }) {
  return (
    <div className={`mp-row ${disabled ? "disabled" : ""}`}>
      <div className="mp-row-icon">{icon}</div>
      <div className="mp-row-main">
        <div className="mp-row-tagline">
          <span className="mp-row-tag">{tag}</span>
          {live && <span className="mp-row-live">● Live</span>}
        </div>
        <p className="mp-row-title">{title}</p>
        {sub && <p className="mp-row-sub">{sub}</p>}
      </div>
      <div className="mp-row-pills">
        <button
          className={`mp-pill pill-a ${selectedSide === "away" || selectedSide === "yes" ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onSelect(leftLabel === "Bull" ? "yes" : "away", leftLabel, leftPct)}
        >
          {leftLabel} <b>{Math.round(leftPct)}%</b>
        </button>
        <button
          className={`mp-pill pill-b ${selectedSide === "home" || selectedSide === "no" ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => onSelect(rightLabel === "Bear" ? "no" : "home", rightLabel, rightPct)}
        >
          {rightLabel} <b>{Math.round(rightPct)}%</b>
        </button>
      </div>
    </div>
  );
}

const STYLES = `
html, body, #root {
  overflow: auto !important;
  height: auto !important;
  min-height: 100vh !important;
}
.mp-root{
  --bg:#0b0e14; --bg-alt:#151922; --bg-alt2:#1b212c; --border:#242a36;
  --text:#f4f5f7; --text-2:#9aa1ae; --text-3:#5b6270;
  --blue:#3b6bff; --green:#22c55e; --green-dim:#10241a;
  --red:#f2495c; --red-dim:#2a1418;
  background:var(--bg); color:var(--text); min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;
}
.mp-root[data-theme="light"]{
  --bg:#ffffff; --bg-alt:#f7f8fa; --bg-alt2:#eef0f3; --border:#e5e7eb;
  --text:#0b0e14; --text-2:#6b7280; --text-3:#9ca3af;
  --blue:#1652f0; --green:#059669; --green-dim:#ecfdf5;
  --red:#dc2626; --red-dim:#fef2f2;
}
.mp-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);}
.mp-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;}
.mp-logo-mark{width:22px;height:22px;border-radius:6px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;}
.mp-nav-right{display:flex;align-items:center;gap:12px;}
.mp-link{background:none;border:none;color:var(--text-2);font-size:13px;cursor:pointer;text-decoration:underline;}
.mp-toggle{width:44px;height:24px;border-radius:20px;background:var(--bg-alt);border:1px solid var(--border);position:relative;cursor:pointer;flex-shrink:0;}
.mp-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--text);transition:transform .15s;}
.mp-root[data-theme="light"] .mp-toggle-knob{transform:translateX(20px);}
.mp-wallet-btn{background:var(--blue);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
.mp-account{font-size:12px;color:var(--text-2);font-family:monospace;}
.mp-cats{display:flex;gap:8px;padding:16px 24px 0;}
.mp-cat{border:1px solid var(--border);background:transparent;color:var(--text-2);font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;}
.mp-cat.active{background:var(--text);color:var(--bg);border-color:var(--text);}
.mp-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:600px;width:calc(100% - 40px);padding:12px 18px;background:var(--red-dim);color:var(--red);border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:1000;border:1px solid var(--red);}
.mp-demo-banner{padding:10px 16px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-2);margin-bottom:12px;}
.mp-note{font-size:12px;color:var(--text-3);}

/* layout: list + sticky slip sidebar */
.mp-layout{display:grid;grid-template-columns:1fr 320px;gap:20px;padding:20px 24px 60px;max-width:1100px;margin:0 auto;align-items:start;}
@media (max-width:820px){.mp-layout{grid-template-columns:1fr;}}
.mp-list{display:flex;flex-direction:column;gap:10px;}

/* market row, Meridian-style pill layout */
.mp-row{display:flex;align-items:center;gap:14px;background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;padding:14px 16px;}
.mp-row.disabled{opacity:.5;}
.mp-row-icon{width:36px;height:36px;border-radius:50%;background:var(--bg-alt2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;}
.mp-row-main{flex:1;min-width:0;}
.mp-row-tagline{display:flex;align-items:center;gap:8px;margin-bottom:3px;}
.mp-row-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);}
.mp-row-live{font-size:10px;font-weight:700;color:var(--green);}
.mp-row-title{font-size:14px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mp-row-sub{font-size:11px;color:var(--text-3);margin:2px 0 0;}
.mp-row-pills{display:flex;gap:8px;flex-shrink:0;}
.mp-pill{border:1px solid var(--border);background:var(--bg-alt2);border-radius:20px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-2);white-space:nowrap;}
.mp-pill b{margin-left:4px;}
.mp-pill.pill-a{color:var(--green);}
.mp-pill.pill-b{color:var(--red);}
.mp-pill.pill-a.selected{background:var(--green);color:#fff;border-color:var(--green);}
.mp-pill.pill-b.selected{background:var(--red);color:#fff;border-color:var(--red);}
.mp-pill:disabled{opacity:.4;cursor:not-allowed;}

/* bet slip */
.mp-slip{background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;padding:18px;position:sticky;top:20px;}
.mp-slip-title{font-size:14px;font-weight:700;margin:0 0 12px;display:flex;align-items:center;gap:8px;}
.mp-slip-count{background:var(--blue);color:#fff;font-size:11px;font-weight:700;border-radius:20px;padding:2px 8px;}
.mp-slip-empty{font-size:12px;color:var(--text-3);line-height:1.6;}
.mp-slip-item{border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px;}
.mp-slip-item.side-a{border-left:3px solid var(--green);}
.mp-slip-item.side-b{border-left:3px solid var(--red);}
.mp-slip-item-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;}
.mp-slip-item-title{font-size:12px;font-weight:600;margin:0;line-height:1.3;}
.mp-slip-item-side{font-size:11px;color:var(--text-2);margin:3px 0 0;}
.mp-slip-remove{background:none;border:none;color:var(--text-3);cursor:pointer;font-size:12px;padding:0;flex-shrink:0;}
.mp-slip-amount{width:100%;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;}
.mp-slip-status{font-size:11px;margin:6px 0 0;font-weight:600;}
.mp-slip-status.pending{color:var(--text-2);}
.mp-slip-status.success{color:var(--green);}
.mp-slip-status.error{color:var(--red);}
.mp-slip-total{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-2);margin:14px 0 10px;padding-top:12px;border-top:1px solid var(--border);}
.mp-slip-total b{color:var(--text);font-size:14px;}
.mp-slip-submit{width:100%;background:var(--blue);color:#fff;border:none;border-radius:10px;padding:12px 0;font-size:13px;font-weight:700;cursor:pointer;}

.mp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;}
.mp-modal{background:var(--bg-alt);border:1px solid var(--border);border-radius:16px;padding:20px;width:100%;max-width:340px;}
.mp-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.mp-modal-title{font-size:15px;font-weight:700;margin:0;}
.mp-modal-close{background:none;border:none;color:var(--text-2);cursor:pointer;font-size:14px;}
.mp-modal-close:disabled{opacity:.4;cursor:not-allowed;}
.mp-modal-empty{font-size:12px;color:var(--text-2);line-height:1.6;}
.mp-modal-empty a{color:var(--blue);}
.mp-modal-wallet{width:100%;display:flex;align-items:center;gap:12px;background:var(--bg-alt2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;font-size:14px;font-weight:600;color:var(--text);}
.mp-modal-wallet:hover{border-color:var(--blue);}
.mp-modal-wallet:disabled{opacity:.6;cursor:not-allowed;}
.mp-modal-wallet-icon{font-size:20px;}
.mp-modal-wallet-name{flex:1;text-align:left;}
.mp-modal-wallet-status{font-size:11px;color:var(--text-3);font-weight:500;}
.mp-modal-note{font-size:11px;color:var(--text-3);line-height:1.5;margin:10px 0 0;}
`;
