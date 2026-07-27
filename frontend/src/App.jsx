import React, { useState, useEffect, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";

/* ── Contract Config ── */
const LITE_PREDICT_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function rounds(uint256) view returns (uint256 epoch, uint256 startTimestamp, uint256 lockTimestamp, uint256 closeTimestamp, int256 lockPrice, int256 closePrice, uint256 totalAmount, uint256 bullAmount, uint256 bearAmount, uint256 rewardBaseCalData, uint256 rewardAmount, bool oracleCalled, bool cancelled)",
  "function userBets(uint256, address) view returns (uint8 position, uint256 amount, bool claimed)",
  "function betBull(uint256 epoch) payable",
  "function betBear(uint256 epoch) payable",
  "function claim(uint256[] epochs)",
  "function claimable(uint256 epoch, address user) view returns (bool)",
  "function executeRound()",
  "function intervalSeconds() view returns (uint256)",
  "function minBetAmount() view returns (uint256)",
  "function getUserRounds(address user) view returns (uint256[])",
  "function genesisStartOnce() view returns (bool)",
  "function genesisLockOnce() view returns (bool)",
  "function genesisLockRound()"
];
const DIA_ORACLE_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

const DEFAULT_CONTRACT = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const DIA_LTC_USD = "0x45dDa5d881BD2C917976CCfde74fFd6f6412da29";
const LITVM_RPC = "https://liteforge.rpc.caldera.xyz/http";
const LITVM_CHAIN_ID = 4441;

/* ── Helpers ── */
const fmt4 = (n) => Number(n).toFixed(4);
const fmtTime = (s) => {
  if (s <= 0) return "00:00";
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};
const shortAddr = (a) => a ? `${a.slice(0,5)}…${a.slice(-4)}` : "";
const randomBetween = (a, b) => a + Math.random() * (b - a);

/* ── Static News Data ── */
const NEWS_ITEMS = [
  { id:1, tag:"litvm", tagLabel:"LitVM", title:"LitVM Builders Program opens Season 2 – $500K in grants available for EVM dApps on Litecoin rollup", source:"LitVM Blog", time:"2m ago" },
  { id:2, tag:"litecoin", tagLabel:"Litecoin", title:"Litecoin network processes record 1.2M daily transactions amid DeFi expansion", source:"CoinDesk", time:"15m ago" },
  { id:3, tag:"market", tagLabel:"Market", title:"LTC/USD reclaims $85 support as Bitcoin correlation holds strong heading into weekend", source:"CoinTelegraph", time:"28m ago" },
  { id:4, tag:"defi", tagLabel:"DeFi", title:"DIA oracle integration on LitVM enables first trustless price feeds for Litecoin-native DEX liquidity", source:"DeFi Pulse", time:"1h ago" },
  { id:5, tag:"litvm", tagLabel:"LitVM", title:"Arbitrum Orbit upgrade boosts LitVM throughput to 8,000 TPS in benchmarking tests", source:"LitVM Blog", time:"2h ago" },
  { id:6, tag:"litecoin", tagLabel:"Litecoin", title:"Charlie Lee: LitVM represents the most exciting development in Litecoin's 14-year history", source:"Twitter", time:"3h ago" },
  { id:7, tag:"market", tagLabel:"Market", title:"Prediction markets show 68% probability of LTC hitting $100 by Q3 2026", source:"Polymarket", time:"4h ago" },
  { id:8, tag:"defi", tagLabel:"DeFi", title:"zkLTC total value locked crosses $10M milestone in testnet environment within first week", source:"DeFiLlama", time:"5h ago" },
];

/* ── Static Chat Messages ── */
const INITIAL_CHAT = [
  { id:1, user:"whale_ltc", avatar:"🐋", color:"#8b5cf6", badge:"whale", badgeType:"whale", text:"LTC looking strong above $85. Bull position locked in.", time:"12:45" },
  { id:2, user:"trader_88", avatar:"🎯", color:"#3b82f6", badge:"Bull", badgeType:"bull-badge", text:"Round 42 closed $87.12 → $89.44. Paid out 2.3x multiplier 🔥", time:"12:47" },
  { id:3, user:"cryptomike", avatar:"😎", color:"#10b981", badge:null, text:"Anyone else watching the DIA oracle? Price update was spot on.", time:"12:49" },
  { id:4, user:"bear_lord", avatar:"🐻", color:"#ef4444", badge:"Bear", badgeType:"bear-badge", text:"I'm fading this pump. zkLTC gas too cheap makes manipulation easy imo", time:"12:51" },
  { id:5, user:"satoshi_jr", avatar:"⚡", color:"#f59e0b", badge:null, text:"@bear_lord nah oracle is DIA – fully verifiable on-chain. No manipulation possible", time:"12:52" },
  { id:6, user:"whale_ltc", avatar:"🐋", color:"#8b5cf6", badge:"whale", badgeType:"whale", text:"Bull pool at 65% vs Bear 35%. Payout looking juicy for bears if it reverses", time:"12:54" },
  { id:7, user:"newbie_nft", avatar:"🌱", color:"#6366f1", badge:null, text:"How do I get testnet zkLTC? First time on LitVM", time:"12:55" },
  { id:8, user:"trader_88", avatar:"🎯", color:"#3b82f6", badge:"Bull", badgeType:"bull-badge", text:"@newbie_nft https://testnet.litvm.com — faucet is there. Get 1 zkLTC free!", time:"12:56" },
];

/* ── Orderbook Generator ── */
const generateOrderbook = (midPrice) => {
  const asks = [], bids = [];
  let runningAsk = 0, runningBid = 0;
  for (let i = 1; i <= 12; i++) {
    const askP = midPrice + i * 0.08 * (1 + Math.random() * 0.5);
    const askS = +(randomBetween(0.5, 8).toFixed(3));
    runningAsk += askP * askS;
    asks.push({ price: askP, size: askS, total: runningAsk });

    const bidP = midPrice - i * 0.08 * (1 + Math.random() * 0.5);
    const bidS = +(randomBetween(0.5, 8).toFixed(3));
    runningBid += bidP * bidS;
    bids.push({ price: bidP, size: bidS, total: runningBid });
  }
  return { asks: asks.reverse(), bids };
};

/* ── Candlestick seed data ── */
const genCandles = (basePrice = 85) => {
  const candles = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  for (let i = 60; i >= 0; i--) {
    const open = price;
    const change = (Math.random() - 0.48) * 0.5;
    const close = +(open + change).toFixed(4);
    const high = +(Math.max(open, close) + Math.random() * 0.2).toFixed(4);
    const low = +(Math.min(open, close) - Math.random() * 0.2).toFixed(4);
    candles.push({ time: now - i * 60, open: +open.toFixed(4), high, low, close });
    price = close;
  }
  return candles;
};

/* ══════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════ */
export default function App() {
  /* ── Web3 state ── */
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(0);
  const [contractAddr, setContractAddr] = useState(() => localStorage.getItem("lp_contract") || DEFAULT_CONTRACT);

  /* ── Market state ── */
  const [ltcPrice, setLtcPrice] = useState(85.0);
  const [priceDir, setPriceDir] = useState("same");
  const [priceChange24h, setPriceChange24h] = useState(+1.24);
  const [vol24h, setVol24h] = useState("4.2M");
  const [high24h, setHigh24h] = useState(87.45);
  const [low24h, setLow24h] = useState(83.10);

  /* ── Contract state ── */
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [rounds, setRounds] = useState({});
  const [userBets, setUserBets] = useState({});
  const [claimableEpochs, setClaimableEpochs] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);

  /* ── Chart ── */
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const [interval, setInterval2] = useState("1m");
  const [chartType, setChartType] = useState("Candles");

  /* ── Orderbook ── */
  const [orderbook, setOrderbook] = useState(() => generateOrderbook(85));

  /* ── Trade form ── */
  const [tradeSide, setTradeSide] = useState("Bull");
  const [tradeType, setTradeType] = useState("Market");
  const [tradeQty, setTradeQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [activeTab, setActiveTab] = useState("orderbook"); // orderbook | trade | positions

  /* ── Chat ── */
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState("");
  const chatBodyRef = useRef(null);

  /* ── UI ── */
  const [toasts, setToasts] = useState([]);
  const prevPriceRef = useRef(85);
  const candlesDataRef = useRef(genCandles(85));

  /* ═══ Toast helper ═══ */
  const toast = useCallback((msg, type = "info") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  /* ═══ Chart setup ═══ */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#0a0a0a" }, textColor: "#555" },
      grid: { vertLines: { color: "#111" }, horzLines: { color: "#111" } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#333" }, horzLine: { color: "#333" } },
      rightPriceScale: { borderColor: "#1a1a1a", textColor: "#555" },
      timeScale: { borderColor: "#1a1a1a", textColor: "#555", timeVisible: true },
      width: chartContainerRef.current.offsetWidth,
      height: chartContainerRef.current.offsetHeight,
    });

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });

    series.setData(candlesDataRef.current);
    chart.timeScale().fitContent();
    chartRef.current = chart;
    candleSeriesRef.current = series;

    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(chartContainerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  /* ═══ Price simulation + chart update ═══ */
  useEffect(() => {
    const tick = setInterval(() => {
      setLtcPrice(prev => {
        const drift = (Math.random() - 0.49) * 0.08;
        const newP = +(prev + drift).toFixed(4);
        if (newP > prev) setPriceDir("up");
        else if (newP < prev) setPriceDir("down");
        else setPriceDir("same");
        prevPriceRef.current = prev;

        // Push new candle tick
        if (candleSeriesRef.current) {
          const now = Math.floor(Date.now() / 1000);
          const last = candlesDataRef.current[candlesDataRef.current.length - 1];
          const open = last?.close || newP;
          const newCandle = {
            time: now,
            open: open,
            high: Math.max(open, newP) + Math.random() * 0.05,
            low: Math.min(open, newP) - Math.random() * 0.05,
            close: newP
          };
          try { candleSeriesRef.current.update(newCandle); } catch (_) {}
        }
        return newP;
      });

      // Update orderbook
      setOrderbook(generateOrderbook(prevPriceRef.current));
    }, 2000);
    return () => clearInterval(tick);
  }, []);

  /* ═══ Web3 Init ═══ */
  useEffect(() => {
    if (!window.ethereum) return;
    const p = new ethers.BrowserProvider(window.ethereum);
    setProvider(p);
    p.getSigner().then(s => { setSigner(s); s.getAddress().then(setAccount).catch(() => {}); }).catch(() => {});
    p.getNetwork().then(n => setChainId(Number(n.chainId))).catch(() => {});
    window.ethereum.on("accountsChanged", ([a]) => { if(a) setAccount(a); else { setAccount(""); setSigner(null); } });
    window.ethereum.on("chainChanged", hex => setChainId(parseInt(hex,16)));
  }, []);

  /* ═══ Load on-chain data ═══ */
  const loadData = useCallback(async () => {
    if (!ethers.isAddress(contractAddr)) return;
    try {
      const p = provider || new ethers.JsonRpcProvider(LITVM_RPC);
      const c = new ethers.Contract(contractAddr, LITE_PREDICT_ABI, p);
      const epoch = Number(await c.currentEpoch());
      setCurrentEpoch(epoch);
      const fetched = {};
      for (let ep = Math.max(1, epoch - 2); ep <= epoch; ep++) {
        const r = await c.rounds(ep);
        fetched[ep] = {
          epoch: Number(r[0]), startTimestamp: Number(r[1]), lockTimestamp: Number(r[2]),
          closeTimestamp: Number(r[3]), lockPrice: Number(r[4])/1e18, closePrice: Number(r[5])/1e18,
          totalAmount: ethers.formatEther(r[6]), bullAmount: ethers.formatEther(r[7]),
          bearAmount: ethers.formatEther(r[8]), rewardAmount: ethers.formatEther(r[10]),
          oracleCalled: r[11], cancelled: r[12]
        };
      }
      setRounds(fetched);
      if (fetched[epoch]) {
        const diff = fetched[epoch].lockTimestamp - Math.floor(Date.now()/1000);
        setTimeLeft(Math.max(0, diff));
      }
      if (account) {
        const userRounds = await c.getUserRounds(account).catch(() => []);
        const bets = {}, cl = [];
        for (const epVal of userRounds) {
          const ep = Number(epVal);
          const b = await c.userBets(ep, account);
          if (b[1] > 0n) {
            bets[ep] = { position: Number(b[0])===0?"Bull":"Bear", amount: ethers.formatEther(b[1]), claimed: b[2] };
            if (!b[2]) {
              const ok = await c.claimable(ep, account).catch(() => false);
              if (ok) cl.push(ep);
            }
          }
        }
        setUserBets(bets);
        setClaimableEpochs(cl);
      }
    } catch(e) { console.error(e); }
  }, [account, contractAddr, provider]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ═══ Countdown timer ═══ */
  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft(p => p <= 1 ? 0 : p-1), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  /* ═══ Chat auto-scroll ═══ */
  useEffect(() => {
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
  }, [chatMessages]);

  /* ═══ Connect Wallet ═══ */
  const connectWallet = async () => {
    if (!window.ethereum) { toast("MetaMask not found. Please install it.", "error"); return; }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const p = new ethers.BrowserProvider(window.ethereum);
      const s = await p.getSigner();
      setSigner(s); setProvider(p);
      setAccount(await s.getAddress());
      setChainId(Number((await p.getNetwork()).chainId));
    } catch(e) { toast("Wallet connect failed", "error"); }
  };

  /* ═══ Switch Network ═══ */
  const switchNetwork = async () => {
    try {
      await window.ethereum.request({ method:"wallet_switchEthereumChain", params:[{ chainId:"0x1159" }] });
    } catch(e) {
      if (e.code === 4902) {
        await window.ethereum.request({ method:"wallet_addEthereumChain", params:[{
          chainId:"0x1159", chainName:"LitVM LiteForge",
          nativeCurrency:{ name:"zkLTC", symbol:"zkLTC", decimals:18 },
          rpcUrls:[LITVM_RPC], blockExplorerUrls:["https://liteforge.explorer.caldera.xyz"]
        }]});
      }
    }
  };

  /* ═══ Place Bet ═══ */
  const placeBet = async () => {
    if (!signer) { toast("Connect wallet first", "error"); return; }
    if (chainId !== LITVM_CHAIN_ID) { toast("Switch to LitVM network", "error"); return; }
    if (!tradeQty || parseFloat(tradeQty) <= 0) { toast("Enter valid amount", "error"); return; }
    setLoading(true);
    try {
      const c = new ethers.Contract(contractAddr, LITE_PREDICT_ABI, signer);
      const val = ethers.parseEther(tradeQty);
      const tx = tradeSide === "Bull" ? await c.betBull(currentEpoch, { value: val }) : await c.betBear(currentEpoch, { value: val });
      toast(`${tradeSide} order submitted…`, "info");
      await tx.wait();
      toast(`${tradeSide} position entered! Round #${currentEpoch}`, "success");
      setTradeQty("");
      await loadData();
    } catch(e) { toast(e.reason || "Transaction failed", "error"); }
    setLoading(false);
  };

  /* ═══ Claim ═══ */
  const claimAll = async () => {
    if (!signer || claimableEpochs.length === 0) return;
    setLoading(true);
    try {
      const c = new ethers.Contract(contractAddr, LITE_PREDICT_ABI, signer);
      const tx = await c.claim(claimableEpochs);
      await tx.wait();
      toast(`Claimed ${claimableEpochs.length} round(s)!`, "success");
      await loadData();
    } catch(e) { toast("Claim failed", "error"); }
    setLoading(false);
  };

  /* ═══ Send Chat ═══ */
  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = {
      id: Date.now(), user: account ? shortAddr(account) : "anon",
      avatar: "👤", color: "#3b82f6", badge: null, text: chatInput.trim(),
      time: new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"})
    };
    setChatMessages(p => [...p, msg]);
    setChatInput("");
  };

  /* ═══ Orderbook click fills price ═══ */
  const fillPrice = (price) => {
    setLimitPrice(price.toFixed(4));
    setTradeType("Limit");
    setActiveTab("trade");
  };

  /* ═══ Derived values ═══ */
  const liveRound = rounds[currentEpoch - 1] || null;
  const biddingRound = rounds[currentEpoch] || null;
  const endedRound = rounds[currentEpoch - 2] || null;

  const bullPct = biddingRound ? (parseFloat(biddingRound.bullAmount) / (parseFloat(biddingRound.totalAmount) || 1) * 100) : 50;
  const bearPct = 100 - bullPct;

  const getMult = (round, side) => {
    if (!round) return "—";
    const total = parseFloat(round.totalAmount);
    const pool = side==="Bull" ? parseFloat(round.bullAmount) : parseFloat(round.bearAmount);
    if (!pool || !total) return "—";
    return `${(total * 0.98 / pool).toFixed(2)}x`;
  };

  const estPayout = () => {
    if (!tradeQty || !biddingRound) return "0.0000";
    const qty = parseFloat(tradeQty);
    const total = parseFloat(biddingRound.totalAmount) + qty;
    const pool = (tradeSide==="Bull" ? parseFloat(biddingRound.bullAmount) : parseFloat(biddingRound.bearAmount)) + qty;
    const mult = (total * 0.98) / pool;
    return (qty * mult).toFixed(4);
  };

  const maxAskTotal = Math.max(...orderbook.asks.map(a => a.total), 1);
  const maxBidTotal = Math.max(...orderbook.bids.map(b => b.total), 1);

  return (
    <div className="app">
      {/* ═══ TOASTS ═══ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type==="success"?"✓":t.type==="error"?"✕":"·"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ═══ TOPBAR ═══ */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-logo">LP</div>
          <span className="brand-name">LitePredict</span>
        </div>
        <div className="topbar-divider" />

        <div className="market-selector">
          <span className="market-pair">LTC/USD</span>
          <span className="market-tag">LitVM</span>
        </div>

        <span className={`market-price ${priceDir === "up" ? "bull" : priceDir === "down" ? "bear" : ""}`}>
          ${fmt4(ltcPrice)}
        </span>
        <span className={`market-change ${priceChange24h >= 0 ? "bull" : "bear"}`} style={{marginLeft:8}}>
          {priceChange24h >= 0 ? "+" : ""}{priceChange24h.toFixed(2)}%
        </span>

        <div className="topbar-stats">
          <div className="stat-cell">
            <span className="stat-label">24h High</span>
            <span className="stat-value" style={{color:"var(--bull)"}}>${high24h.toFixed(2)}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">24h Low</span>
            <span className="stat-value" style={{color:"var(--bear)"}}>${low24h.toFixed(2)}</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">24h Volume</span>
            <span className="stat-value">{vol24h} LTC</span>
          </div>
          <div className="stat-cell">
            <span className="stat-label">Round</span>
            <span className="stat-value">#{currentEpoch || "—"}</span>
          </div>
          {claimableEpochs.length > 0 && (
            <button className="btn btn-primary" style={{fontSize:11,padding:"5px 10px"}} onClick={claimAll}>
              🎉 Claim {claimableEpochs.length} Reward{claimableEpochs.length > 1 ? "s" : ""}
            </button>
          )}
        </div>

        <div className="topbar-right">
          {account ? (
            chainId !== LITVM_CHAIN_ID ? (
              <button className="btn btn-secondary" onClick={switchNetwork}>Switch to LitVM</button>
            ) : (
              <div className="wallet-badge">
                <div className="wallet-dot" />
                {shortAddr(account)}
              </div>
            )
          ) : (
            <>
              <button className="btn btn-secondary" onClick={connectWallet}>Log in</button>
              <button className="btn btn-primary" onClick={connectWallet}>Connect Wallet</button>
            </>
          )}
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <div className="main-content">

        {/* ── CHART SECTION ── */}
        <div className="chart-section">
          <div className="chart-toolbar">
            {["Candles","Line","Area"].map(t => (
              <button key={t} className={`chart-type-btn ${chartType===t?"active":""}`} onClick={() => setChartType(t)}>{t}</button>
            ))}
            <div className="topbar-divider" style={{margin:"0 6px"}} />
            <div className="interval-group">
              {["1m","5m","15m","1h","4h","1d"].map(iv => (
                <button key={iv} className={`interval-btn ${interval===iv?"active":""}`} onClick={() => setInterval2(iv)}>{iv}</button>
              ))}
            </div>
          </div>

          <div className="chart-canvas-area">
            <div id="tv-chart" ref={chartContainerRef} style={{width:"100%",height:"100%"}} />

            {/* Live price indicator */}
            <div className="price-indicator">
              <div className="live-dot" />
              <span style={{fontSize:11,color:"var(--text-secondary)"}}>LIVE</span>
              <span style={{fontFamily:"monospace",fontWeight:600,fontSize:13}}>${fmt4(ltcPrice)}</span>
            </div>

            {/* Round countdown */}
            <div className="round-overlay">
              <span className="round-overlay-label">Round closes in</span>
              <span className="round-overlay-time" style={{color: timeLeft < 30 ? "var(--bear)" : "var(--text-primary)"}}>
                {fmtTime(timeLeft)}
              </span>
              <span className="round-overlay-epoch">Epoch #{currentEpoch || "—"}</span>
            </div>
          </div>
        </div>

        {/* ── BOTTOM 3 PANELS ── */}
        <div className="bottom-panels">

          {/* ── LEFT: NEWS ── */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title">News Feed</span>
              <span className="panel-badge" style={{marginLeft:"auto"}}>Live</span>
            </div>
            <div className="panel-body">
              {NEWS_ITEMS.map(n => (
                <div className="news-item" key={n.id}>
                  <span className={`news-tag ${n.tag}`}>{n.tagLabel}</span>
                  <div className="news-title">{n.title}</div>
                  <div className="news-meta">
                    <span className="news-source">{n.source}</span>
                    <span>·</span>
                    <span>{n.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CENTER: CHAT ── */}
          <div className="panel" style={{borderRight:"1px solid var(--border)"}}>
            <div className="panel-header">
              <span className="panel-title">Community Chat</span>
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--text-muted)"}}>{chatMessages.length} messages</span>
            </div>

            {/* Round info bar */}
            {biddingRound && (
              <div style={{padding:"8px 14px", borderBottom:"1px solid var(--border-subtle)", display:"flex", gap:12, alignItems:"center", flexShrink:0}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--text-muted)",marginBottom:4}}>
                    <span>🟢 Bull {bullPct.toFixed(0)}%</span>
                    <span>Pool: {parseFloat(biddingRound.totalAmount).toFixed(3)} zkLTC</span>
                    <span>🔴 Bear {bearPct.toFixed(0)}%</span>
                  </div>
                  <div style={{height:4,background:"var(--bear)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${bullPct}%`,background:"var(--bull)",transition:"width 0.5s"}} />
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)"}}>Payout</div>
                  <div style={{fontSize:11,fontWeight:600,color:"var(--bull)"}}>
                    {getMult(biddingRound, tradeSide)} {tradeSide}
                  </div>
                </div>
              </div>
            )}

            {/* End round result */}
            {endedRound && endedRound.oracleCalled && !endedRound.cancelled && (
              <div className={`pred-result-banner ${endedRound.closePrice > endedRound.lockPrice ? "bull" : "bear"}`}>
                <div>
                  <div style={{fontSize:11,fontWeight:600}}>
                    Round #{endedRound.epoch} Ended — {endedRound.closePrice > endedRound.lockPrice ? "🟢 BULL WINS" : "🔴 BEAR WINS"}
                  </div>
                  <div style={{fontSize:10,color:"var(--text-muted)"}}>
                    ${endedRound.lockPrice.toFixed(4)} → ${endedRound.closePrice.toFixed(4)}
                  </div>
                </div>
                {claimableEpochs.includes(endedRound.epoch) && (
                  <button className="btn btn-primary" style={{fontSize:11,padding:"5px 10px"}} onClick={claimAll}>Claim</button>
                )}
              </div>
            )}

            <div className="panel-body" ref={chatBodyRef}>
              <div className="chat-messages">
                {chatMessages.map(m => (
                  <div className="chat-msg" key={m.id}>
                    <div className="chat-avatar" style={{background:`${m.color}22`, color:m.color}}>{m.avatar}</div>
                    <div className="chat-content">
                      <div className="chat-meta">
                        <span className="chat-username" style={{color:m.color}}>{m.user}</span>
                        {m.badge && <span className={`chat-badge ${m.badgeType}`}>{m.badge}</span>}
                        <span className="chat-time">{m.time}</span>
                      </div>
                      <div className="chat-text" dangerouslySetInnerHTML={{__html: m.text.replace(/@(\w+)/g,'<em>@$1</em>').replace(/(https?:\/\/\S+)/g,'<em>$1</em>')}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="chat-input-area">
              <div className="chat-avatar" style={{background:"var(--bg-3)",color:"var(--text-muted)",width:28,height:28,flexShrink:0}}>
                {account ? account[2].toUpperCase() : "?"}
              </div>
              <input
                className="chat-input"
                placeholder={account ? "Message the traders…" : "Connect wallet to chat"}
                value={chatInput}
                disabled={!account}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat()}
              />
              <button className="btn-icon" onClick={sendChat} disabled={!account}>↑</button>
            </div>
          </div>

          {/* ── RIGHT: ORDERBOOK + TRADE ── */}
          <div className="panel" style={{overflow:"hidden"}}>
            {/* Tabs */}
            <div className="order-tabs">
              {["orderbook","trade","positions"].map(t => (
                <button key={t} className={`order-tab ${activeTab===t?"active":""}`} onClick={() => setActiveTab(t)}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            {/* ── ORDERBOOK TAB ── */}
            {activeTab === "orderbook" && (
              <div style={{display:"flex",flexDirection:"column",flex:1,overflow:"hidden"}}>
                <div className="ob-header">
                  <span className="ob-col-label">Price (USD)</span>
                  <span className="ob-col-label">Size (LTC)</span>
                  <span className="ob-col-label">Total</span>
                </div>
                <div className="panel-body">
                  {/* ASKS */}
                  {orderbook.asks.map((row, i) => (
                    <div key={i} className="ob-row ask" onClick={() => fillPrice(row.price)}>
                      <div className="ob-bar" style={{width:`${(row.total/maxAskTotal*100)}%`, right:0}} />
                      <span className="ob-price ask">{row.price.toFixed(4)}</span>
                      <span className="ob-size">{row.size.toFixed(3)}</span>
                      <span className="ob-total">{row.total.toFixed(0)}</span>
                    </div>
                  ))}

                  {/* Spread */}
                  <div className="ob-spread">
                    <span className="ob-spread-label">Spread</span>
                    <span className="ob-spread-val">${fmt4(ltcPrice)}</span>
                    <span className="ob-spread-label">{((orderbook.asks[orderbook.asks.length-1]?.price - orderbook.bids[0]?.price) || 0).toFixed(4)}</span>
                  </div>

                  {/* BIDS */}
                  {orderbook.bids.map((row, i) => (
                    <div key={i} className="ob-row bid" onClick={() => fillPrice(row.price)}>
                      <div className="ob-bar" style={{width:`${(row.total/maxBidTotal*100)}%`, right:0}} />
                      <span className="ob-price bid">{row.price.toFixed(4)}</span>
                      <span className="ob-size">{row.size.toFixed(3)}</span>
                      <span className="ob-total">{row.total.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TRADE TAB ── */}
            {activeTab === "trade" && (
              <div className="trade-panel">
                {/* Bull / Bear */}
                <div className="trade-side-tabs">
                  <button
                    className={`trade-side-btn ${tradeSide==="Bull"?"bull-active":""}`}
                    onClick={() => setTradeSide("Bull")}
                  >Bull ↑</button>
                  <button
                    className={`trade-side-btn ${tradeSide==="Bear"?"bear-active":""}`}
                    onClick={() => setTradeSide("Bear")}
                  >Bear ↓</button>
                </div>

                {/* Order type */}
                <div className="trade-type-tabs">
                  {["Market","Limit","Stop"].map(t => (
                    <button key={t} className={`trade-type-btn ${tradeType===t?"active":""}`} onClick={() => setTradeType(t)}>{t}</button>
                  ))}
                </div>

                <div className="trade-fields">
                  {tradeType === "Limit" && (
                    <div className="field-group">
                      <span className="field-label">Limit Price</span>
                      <div className="field-input-wrap">
                        <input className="field-input" type="number" placeholder="0.0000" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} />
                        <span className="field-suffix">USD</span>
                      </div>
                    </div>
                  )}

                  <div className="field-group">
                    <span className="field-label">Amount</span>
                    <div className="field-input-wrap">
                      <input className="field-input" type="number" placeholder="0.000" value={tradeQty} onChange={e => setTradeQty(e.target.value)} />
                      <span className="field-suffix">zkLTC</span>
                    </div>
                  </div>

                  <div className="pct-buttons">
                    {["25%","50%","75%","Max"].map(p => (
                      <button key={p} className="pct-btn" onClick={() => setTradeQty(p === "Max" ? "1.0" : String(parseFloat(p)/100))}>{p}</button>
                    ))}
                  </div>

                  <div style={{display:"flex",flexDirection:"column",gap:4,padding:"4px 0"}}>
                    <div className="trade-info-row">
                      <span className="trade-info-label">Est. Payout</span>
                      <span className="trade-info-value" style={{color:tradeSide==="Bull"?"var(--bull)":"var(--bear)"}}>
                        ~{estPayout()} zkLTC
                      </span>
                    </div>
                    <div className="trade-info-row">
                      <span className="trade-info-label">Multiplier</span>
                      <span className="trade-info-value">{getMult(biddingRound, tradeSide)}</span>
                    </div>
                    <div className="trade-info-row">
                      <span className="trade-info-label">Pool</span>
                      <span className="trade-info-value">{biddingRound ? parseFloat(biddingRound.totalAmount).toFixed(3) : "0"} zkLTC</span>
                    </div>
                    <div className="trade-info-row">
                      <span className="trade-info-label">Protocol Fee</span>
                      <span className="trade-info-value">2%</span>
                    </div>
                  </div>
                </div>

                <button
                  className={`btn-trade ${tradeSide==="Bull"?"bull-trade":"bear-trade"}`}
                  onClick={placeBet}
                  disabled={loading || !account}
                >
                  {loading ? "Processing…" : !account ? "Connect Wallet" : `Enter ${tradeSide} — Round #${currentEpoch}`}
                </button>

                {/* Current position */}
                {userBets[currentEpoch] && (
                  <div style={{margin:"0 12px 10px",padding:"10px 12px",background:"var(--bg-3)",borderRadius:"var(--radius-md)",border:"1px solid var(--border)"}}>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:4}}>Current Position</div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span className={`chat-badge ${userBets[currentEpoch].position==="Bull"?"bull-badge":"bear-badge"}`} style={{fontSize:12,padding:"3px 8px"}}>
                        {userBets[currentEpoch].position}
                      </span>
                      <span style={{fontFamily:"monospace",fontSize:12}}>{userBets[currentEpoch].amount} zkLTC</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── POSITIONS TAB ── */}
            {activeTab === "positions" && (
              <div className="panel-body">
                {Object.keys(userBets).length === 0 ? (
                  <div className="empty-state" style={{height:"100%"}}>
                    <span className="empty-icon">📋</span>
                    <span className="empty-text">No open positions</span>
                    <span style={{fontSize:11,color:"var(--text-muted)"}}>Place a Bull or Bear bet to start</span>
                  </div>
                ) : (
                  <div>
                    {Object.entries(userBets).map(([ep, bet]) => {
                      const r = rounds[Number(ep)];
                      const isClaim = claimableEpochs.includes(Number(ep));
                      return (
                        <div className="position-row" key={ep}>
                          <span className="epoch-badge" style={{fontFamily:"monospace",fontSize:11,color:"var(--text-muted)"}}>#{ ep}</span>
                          <div>
                            <div style={{fontSize:11,fontWeight:600}}>{bet.amount} zkLTC</div>
                            {r && r.oracleCalled && (
                              <div style={{fontSize:10,color:"var(--text-muted)"}}>
                                {r.lockPrice.toFixed(4)} → {r.closePrice.toFixed(4)}
                              </div>
                            )}
                          </div>
                          <span className={`chat-badge ${bet.position==="Bull"?"bull-badge":"bear-badge"}`}>{bet.position}</span>
                          {isClaim ? (
                            <button className="btn btn-primary" style={{fontSize:10,padding:"4px 8px"}} onClick={() => handleClaim([Number(ep)])}>Claim</button>
                          ) : bet.claimed ? (
                            <span style={{fontSize:10,color:"var(--text-muted)"}}>Claimed</span>
                          ) : (
                            <span style={{fontSize:10,color:"var(--text-muted)"}}>Pending</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
