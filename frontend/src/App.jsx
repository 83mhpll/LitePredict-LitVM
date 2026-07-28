import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries } from "lightweight-charts";

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

const DEFAULT_CONTRACT = "0x32dDD87325e9fF3D522490ddb7c79F4c23744B01";
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
const INITIAL_NEWS_ITEMS = [
  { id:1, tag:"litvm", tagLabel:"LitVM", title:"LitVM Builders Program opens Season 2 – $500K in grants available for EVM dApps on Litecoin rollup", source:"LitVM Blog", time:"2m ago" },
  { id:2, tag:"litecoin", tagLabel:"Litecoin", title:"Litecoin network processes record 1.2M daily transactions amid DeFi expansion", source:"CoinDesk", time:"15m ago" },
  { id:3, tag:"market", tagLabel:"Market", title:"LTC/USD reclaims $85 support as Bitcoin correlation holds strong heading into weekend", source:"CoinTelegraph", time:"28m ago" },
  { id:4, tag:"defi", tagLabel:"DeFi", title:"DIA oracle integration on LitVM enables first trustless price feeds for Litecoin-native DEX liquidity", source:"DeFi Pulse", time:"1h ago" },
  { id:5, tag:"litvm", tagLabel:"LitVM", title:"Arbitrum Orbit upgrade boosts LitVM throughput to 8,000 TPS in benchmarking tests", source:"LitVM Blog", time:"2h ago" },
  { id:6, tag:"litecoin", tagLabel:"Litecoin", title:"Charlie Lee: LitVM represents the most exciting development in Litecoin's 14-year history", source:"Twitter", time:"3h ago" },
  { id:7, tag:"market", tagLabel:"Market", title:"Prediction markets show 68% probability of LTC hitting $100 by Q3 2026", source:"Polymarket", time:"4h ago" },
  { id:8, tag:"defi", tagLabel:"DeFi", title:"zkLTC total value locked crosses $10M milestone in testnet environment within first week", source:"DeFiLlama", time:"5h ago" },
  { id:9, tag:"market", tagLabel:"Market", title:"Whales accumulating LTC ahead of halving narrative resurgence", source:"CryptoSlate", time:"6h ago" },
  { id:10, tag:"litvm", tagLabel:"LitVM", title:"LitVM mainnet launch scheduled for next quarter", source:"LitVM News", time:"7h ago" },
  { id:11, tag:"defi", tagLabel:"DeFi", title:"New yield farming protocol launches on LitVM with 1000% APY", source:"DappRadar", time:"8h ago" },
  { id:12, tag:"litecoin", tagLabel:"Litecoin", title:"Litecoin hash rate hits new all-time high", source:"MiningPoolStats", time:"9h ago" }
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
  const now = Math.floor(Date.now() / 10000) * 10;
  for (let i = 180; i >= 0; i--) {
    const barTime = now - i * 10;
    const open = price;
    const change = (Math.random() - 0.48) * 0.15;
    const close = +(open + change).toFixed(4);
    const high = +(Math.max(open, close) + Math.random() * 0.12).toFixed(4);
    const low = +(Math.min(open, close) - Math.random() * 0.12).toFixed(4);
    candles.push({ time: barTime, open: +open.toFixed(4), high, low, close });
    price = close;
  }
  return candles;
};

/* ── Opportunity Scoring Engine ── */
const calcRoundScore = (round) => {
  if (!round) return 0;
  const total = parseFloat(round.totalAmount);
  if (total === 0) return 0;
  const bullAmt = parseFloat(round.bullAmount);
  const bearAmt = parseFloat(round.bearAmount);
  const bullMult = bullAmt > 0 ? (total * 0.98) / bullAmt : 0;
  const bearMult = bearAmt > 0 ? (total * 0.98) / bearAmt : 0;
  const maxMult = Math.max(bullMult, bearMult);
  const imbalance = Math.abs(bullAmt - bearAmt) / (total || 1);
  const poolSize = Math.min(total / 10, 1);
  return +(maxMult * (1 + imbalance) * (1 + poolSize)).toFixed(2);
};

/* ── Hooks ── */
const useSoundAlerts = (soundEnabled) => {
  const playSound = useCallback((type) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'new') { 
        osc.frequency.value = 880; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.15); osc.stop(ctx.currentTime + 0.15); 
      } else if (type === 'lock') { 
        osc.frequency.value = 440; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.2); osc.stop(ctx.currentTime + 0.2); 
      } else if (type === 'end') { 
        osc.frequency.value = 220; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); osc.stop(ctx.currentTime + 0.3); 
      } else if (type === 'win') {
        osc.frequency.value = 660; osc.start();
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2); gain2.connect(ctx.destination);
          osc2.frequency.value = 880;
          osc2.start(); gain2.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); osc2.stop(ctx.currentTime + 0.3);
        }, 100);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1); osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {
      console.warn("Sound error", e);
    }
  }, [soundEnabled]);
  return playSound;
};

/* ══════════════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════════════ */
export default function App() {
  /* ── View Mode & Points State ── */
  const [viewMode, setViewMode] = useState('landing');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const [offChainPoints, setOffChainPoints] = useState(() => {
    try { return parseInt(localStorage.getItem('lp_offChainPoints') || '0'); } catch { return 0; }
  });
  const [points, setPoints] = useState(offChainPoints);
  const [lastCheckIn, setLastCheckIn] = useState(() => localStorage.getItem('lp_lastCheckIn') || null);
  const [completedTasks, setCompletedTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lp_completedTasks')) || []; } catch { return []; }
  });

  /* ── Local Storage Settings ── */
  const defaultSettings = {
    isDarkTheme: true,
    soundEnabled: true,
    desktopNotifEnabled: false,
    alertThreshold: 3.0,
    webhookUrl: "",
    defaultBetAmount: "0.1",
    maxBetAmount: "100",
    scanInterval: 60,
    contractAddr: DEFAULT_CONTRACT,
    paperStartBalance: 1000
  };
  const [settings, setSettings] = useState(() => {
    try { const s = localStorage.getItem('lp_settings'); return s ? {...defaultSettings, ...JSON.parse(s)} : defaultSettings; }
    catch { return defaultSettings; }
  });

  const updateSetting = (key, val) => {
    setSettings(prev => {
      const updated = {...prev, [key]: val};
      localStorage.setItem('lp_settings', JSON.stringify(updated));
      return updated;
    });
  };

  /* ── Theme Effect ── */
  useEffect(() => {
    if (settings.isDarkTheme) document.documentElement.classList.remove('light-theme');
    else document.documentElement.classList.add('light-theme');
  }, [settings.isDarkTheme]);

  const playSound = useSoundAlerts(settings.soundEnabled);

  /* ── Web3 state ── */
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(0);

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
  const [isScanning, setIsScanning] = useState(false);

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
  const [tradeQty, setTradeQty] = useState(settings.defaultBetAmount);
  const [limitPrice, setLimitPrice] = useState("");
  const [activeTab, setActiveTab] = useState("orderbook");

  /* ── Paper trading state ── */
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [paperTrades, setPaperTrades] = useState(() => {
    try { const saved = localStorage.getItem("lp_paper_trades"); return saved ? JSON.parse(saved) : []; }
    catch { return []; }
  });
  const [paperBalance, setPaperBalance] = useState(() => {
    try { const saved = localStorage.getItem("lp_paper_balance"); return saved ? parseFloat(saved) : settings.paperStartBalance; }
    catch { return settings.paperStartBalance; }
  });
  const [positionSubTab, setPositionSubTab] = useState("real");
  const [posFilter, setPosFilter] = useState("All");

  /* ── UI / Features ── */
  const [toasts, setToasts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [watchlist, setWatchlist] = useState(() => {
    try { const saved = localStorage.getItem("lp_watchlist"); return saved ? new Set(JSON.parse(saved)) : new Set(); }
    catch { return new Set(); }
  });
  const [newsCategory, setNewsCategory] = useState("all");
  const [newsItems, setNewsItems] = useState(INITIAL_NEWS_ITEMS);
  const [scanCountdown, setScanCountdown] = useState(settings.scanInterval);
  const [showSettings, setShowSettings] = useState(false);
  const [contextModalRound, setContextModalRound] = useState(null);
  const [hcAlert, setHcAlert] = useState(null);

  /* ── Chat ── */
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT);
  const [chatInput, setChatInput] = useState("");
  const chatBodyRef = useRef(null);

  const prevPriceRef = useRef(85);
  const candlesDataRef = useRef(genCandles(85));
  const scanIntervalRef = useRef(settings.scanInterval);
  useEffect(() => { scanIntervalRef.current = settings.scanInterval; }, [settings.scanInterval]);

  /* ═══ Network & Points Handlers ═══ */
  const addLitVMNetwork = async () => {
    if (!window.ethereum) { toast("MetaMask or Web3 wallet not found", "error"); return; }
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x1159",
          chainName: "LitVM Testnet",
          nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
          rpcUrls: ["https://liteforge.rpc.caldera.xyz/http"],
          blockExplorerUrls: ["https://liteforge.explorer.caldera.xyz"]
        }]
      });
      toast("LitVM Testnet added successfully!", "success");
    } catch (e) {
      toast("Failed to add network configuration", "error");
    }
  };

  const handleDailyCheckIn = () => {
    const now = new Date().getTime();
    if (lastCheckIn && (now - parseInt(lastCheckIn)) < 86400000) {
      toast("Check-in available every 24 hours", "warning");
      return;
    }
    setLastCheckIn(now.toString());
    localStorage.setItem('lp_lastCheckIn', now.toString());
    const updatedPoints = offChainPoints + 50;
    setOffChainPoints(updatedPoints);
    localStorage.setItem('lp_offChainPoints', updatedPoints.toString());
    setPoints(prev => prev + 50);
    playSound('win');
    toast("Daily Check-In successful! +50 LPs", "success");
  };

  const handleSocialTask = (taskId, pointsReward) => {
    if (completedTasks.includes(taskId)) return;
    const newTasks = [...completedTasks, taskId];
    setCompletedTasks(newTasks);
    localStorage.setItem('lp_completedTasks', JSON.stringify(newTasks));
    const updatedPoints = offChainPoints + pointsReward;
    setOffChainPoints(updatedPoints);
    localStorage.setItem('lp_offChainPoints', updatedPoints.toString());
    setPoints(prev => prev + pointsReward);
    toast(`Task completed! +${pointsReward} LPs`, "success");
    if (taskId === 'twitter') window.open('https://twitter.com/litepredict', '_blank');
    if (taskId === 'telegram') window.open('https://t.me/litepredict', '_blank');
  };

  const getTier = (pts) => {
    if (pts >= 5000) return { name: 'Diamond', color: '#06b6d4', shadow: '0 0 10px #06b6d4', next: null, min: 5000 };
    if (pts >= 1500) return { name: 'Gold', color: '#eab308', shadow: '0 0 10px #eab308', next: 5000, min: 1500 };
    if (pts >= 500) return { name: 'Silver', color: '#94a3b8', shadow: '0 0 10px #94a3b8', next: 1500, min: 500 };
    return { name: 'Bronze', color: '#b45309', shadow: '0 0 10px #b45309', next: 500, min: 0 };
  };
  const currentTier = getTier(points);

  /* ═══ Desktop Notification Helper ═══ */
  const sendDesktopNotif = useCallback((title, body) => {
    if (settings.desktopNotifEnabled && Notification.permission === "granted") {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, [settings.desktopNotifEnabled]);

  const requestNotifPermission = async () => {
    if (Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p === "granted") updateSetting('desktopNotifEnabled', true);
    } else {
      updateSetting('desktopNotifEnabled', !settings.desktopNotifEnabled);
    }
  };

  /* ═══ Discord Webhook ═══ */
  const sendDiscordAlert = async (webhookUrl, message) => {
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message,
          embeds: [{ title: '🚨 LitePredict High-Conviction Alert', description: message, color: 0xf59e0b }]
        })
      });
    } catch (_) {}
  };

  /* ═══ Notification System ═══ */
  const addNotification = useCallback((title, body, type = 'info') => {
    const id = Date.now();
    setNotifications(p => [{ id, title, body, type, time: new Date().toLocaleTimeString(), read: false }, ...p].slice(0, 20));
    sendDesktopNotif(title, body);
  }, [sendDesktopNotif]);

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const markAllRead = () => setNotifications(p => p.map(n => ({...n, read: true})));

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
      layout: { background: { type: ColorType.Solid, color: settings.isDarkTheme ? "#0a0a0a" : "#ffffff" }, textColor: settings.isDarkTheme ? "#555" : "#888" },
      grid: { vertLines: { color: settings.isDarkTheme ? "#111" : "#eee" }, horzLines: { color: settings.isDarkTheme ? "#111" : "#eee" } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#333" }, horzLine: { color: "#333" } },
      rightPriceScale: { borderColor: settings.isDarkTheme ? "#1a1a1a" : "#ddd", textColor: settings.isDarkTheme ? "#555" : "#888" },
      timeScale: { borderColor: settings.isDarkTheme ? "#1a1a1a" : "#ddd", textColor: settings.isDarkTheme ? "#555" : "#888", timeVisible: true },
      width: chartContainerRef.current.offsetWidth,
      height: chartContainerRef.current.offsetHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
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
  }, [settings.isDarkTheme]);

  const fetchBinanceKlines = async () => {
    try {
      const res = await fetch("https://api.binance.com/api/v3/klines?symbol=LTCUSDT&interval=1m&limit=180");
      if (!res.ok) throw new Error("Binance API error");
      const data = await res.json();
      const mapped = data.map(item => ({
        time: Math.floor(item[0] / 1000),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4])
      }));
      candlesDataRef.current = mapped;
      if (mapped.length > 0) {
        const lastPrice = mapped[mapped.length - 1].close;
        setLtcPrice(lastPrice);
        prevPriceRef.current = lastPrice;
      }
      return mapped;
    } catch (err) { return null; }
  };

  /* ═══ Real-time Binance Price Feed ═══ */
  useEffect(() => {
    let ws;
    let fallbackInterval;

    const initKlinesAndSocket = async () => {
      const initialData = await fetchBinanceKlines();
      if (initialData && candleSeriesRef.current) {
        candleSeriesRef.current.setData(initialData);
        try { chartRef.current.timeScale().fitContent(); } catch(_) {}
      }

      const connectSocket = () => {
        try {
          ws = new WebSocket("wss://stream.binance.com:9443/ws/ltcusdt@kline_1m");
          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg && msg.k) {
              const k = msg.k;
              const newP = parseFloat(k.c);
              
              setLtcPrice(prev => {
                if (newP > prev) setPriceDir("up");
                else if (newP < prev) setPriceDir("down");
                else setPriceDir("same");
                return newP;
              });
              prevPriceRef.current = newP;

              if (candleSeriesRef.current) {
                const candle = {
                  time: Math.floor(k.t / 1000), open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: newP
                };
                try {
                  candleSeriesRef.current.update(candle);
                  const last = candlesDataRef.current[candlesDataRef.current.length - 1];
                  if (last && last.time === candle.time) candlesDataRef.current[candlesDataRef.current.length - 1] = candle;
                  else candlesDataRef.current = [...candlesDataRef.current, candle];
                } catch (_) {}
              }
              setOrderbook(generateOrderbook(newP));
            }
          };
          ws.onerror = () => startPollingFallback();
          ws.onclose = () => startPollingFallback();
        } catch (e) { startPollingFallback(); }
      };

      const startPollingFallback = () => {
        if (fallbackInterval) return;
        fallbackInterval = setInterval(async () => {
          try {
            const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT");
            const data = await res.json();
            const newP = parseFloat(data.price);
            setLtcPrice(prev => {
              if (newP > prev) setPriceDir("up"); else if (newP < prev) setPriceDir("down"); else setPriceDir("same");
              return newP;
            });
            prevPriceRef.current = newP;

            if (candleSeriesRef.current) {
              const barTime = Math.floor(Date.now() / 60000) * 60;
              const last = candlesDataRef.current[candlesDataRef.current.length - 1];
              if (last && last.time === barTime) {
                const updated = { time: barTime, open: last.open, high: Math.max(last.high, newP), low: Math.min(last.low, newP), close: newP };
                candlesDataRef.current[candlesDataRef.current.length - 1] = updated;
                try { candleSeriesRef.current.update(updated); } catch (_) {}
              } else {
                const open = last ? last.close : newP;
                const newBar = { time: barTime, open, high: Math.max(open, newP), low: Math.min(open, newP), close: newP };
                candlesDataRef.current = [...candlesDataRef.current, newBar];
                try { candleSeriesRef.current.update(newBar); } catch (_) {}
              }
            }
            setOrderbook(generateOrderbook(newP));
          } catch (e) {}
        }, 2000);
      };
      connectSocket();
    };
    initKlinesAndSocket();
    return () => { if (ws) ws.close(); if (fallbackInterval) clearInterval(fallbackInterval); };
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
  const prevEpochRef = useRef(0);
  
  const loadData = useCallback(async () => {
    if (!ethers.isAddress(settings.contractAddr)) return;
    setIsScanning(true);
    try {
      const p = provider || new ethers.JsonRpcProvider(LITVM_RPC);
      const c = new ethers.Contract(settings.contractAddr, LITE_PREDICT_ABI, p);
      const epoch = Number(await c.currentEpoch());
      setCurrentEpoch(epoch);
      
      if (epoch > prevEpochRef.current && prevEpochRef.current !== 0) {
        playSound('new');
        addNotification(`Round #${epoch} Started`, `New prediction round is now open for bidding.`);
      }
      prevEpochRef.current = epoch;

      const fetched = {};
      for (let ep = Math.max(1, epoch - 3); ep <= epoch; ep++) {
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

      // HC Alert Check
      const curRound = fetched[epoch];
      if (curRound) {
        const score = calcRoundScore(curRound);
        if (score >= settings.alertThreshold) {
          const imbalance = parseFloat(curRound.bullAmount) > parseFloat(curRound.bearAmount) ? 'Bear' : 'Bull';
          const msg = `High conviction opportunity on Round #${epoch} (${imbalance} edge)! Score: ${score}`;
          setHcAlert({ epoch, score, edge: imbalance });
          playSound('new');
          addNotification('High Conviction Alert', msg, 'warning');
          sendDiscordAlert(settings.webhookUrl, msg);
        } else {
          setHcAlert(null);
        }
      }

      if (fetched[epoch]) {
        const diff = fetched[epoch].lockTimestamp - Math.floor(Date.now()/1000);
        setTimeLeft(Math.max(0, diff));
      }

      if (account) {
        let newOnChainPoints = 0;
        const userRounds = await c.getUserRounds(account).catch(() => []);
        newOnChainPoints += userRounds.length * 20;

        const bets = {}, cl = [];
        for (const epVal of userRounds) {
          const ep = Number(epVal);
          const b = await c.userBets(ep, account);
          if (b[1] > 0n) {
            bets[ep] = { position: Number(b[0])===0?"Bull":"Bear", amount: ethers.formatEther(b[1]), claimed: b[2] };
            newOnChainPoints += Math.floor(parseFloat(ethers.formatEther(b[1])) * 10);
            
            try {
              const r = await c.rounds(ep);
              const winner = r[5] > r[4] ? "Bull" : (r[5] < r[4] ? "Bear" : null);
              if (winner && ((Number(b[0])===0 && winner==="Bull") || (Number(b[0])===1 && winner==="Bear"))) {
                  newOnChainPoints += 50;
              }
            } catch (err) {}

            if (!b[2]) {
              const ok = await c.claimable(ep, account).catch(() => false);
              if (ok) cl.push(ep);
            }
          }
        }
        setUserBets(bets);
        setClaimableEpochs(cl);
        setPoints(offChainPoints + newOnChainPoints);
      }
    } catch(e) { console.error(e); }
    setIsScanning(false);
    toast("Scan complete", "success");
  }, [account, settings.contractAddr, provider, settings.alertThreshold, settings.webhookUrl, playSound, addNotification]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ═══ Countdown timer & Auto-refresh ═══ */
  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft(p => p <= 1 ? 0 : p-1), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  useEffect(() => {
    const id = setInterval(() => {
      setScanCountdown(prev => {
        if (prev <= 1) { loadData(); return scanIntervalRef.current; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [loadData]);

  /* ═══ Live News Refresh (CryptoCompare REST API) ═══ */
  // NOTE: CryptoCompare News uses REST polling (not WebSocket).
  // WebSocket on CryptoCompare is only for price tick streaming.
  const CRYPTOCOMPARE_API_KEY = "df472cdcddd2e27d59a30da1d91c6c0b0290f2252adf52da99ad9cdcf3702369";

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const url = `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=LTC,DeFi,Blockchain&extraParams=LitePredict&api_key=${CRYPTOCOMPARE_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.Data && data.Data.length > 0) {
          const mapped = data.Data.slice(0, 15).map((n, i) => {
            const cats = (n.categories || "").toLowerCase();
            let tag = "market";
            let tagLabel = "Market";
            if (cats.includes("ltc") || cats.includes("litecoin")) { tag = "litecoin"; tagLabel = "Litecoin"; }
            else if (cats.includes("defi")) { tag = "defi"; tagLabel = "DeFi"; }
            else if (cats.includes("blockchain") || cats.includes("mining")) { tag = "market"; tagLabel = "Market"; }
            // Map some to litvm if they mention LitVM or Layer2
            if ((n.title || "").toLowerCase().includes("litvm") || (n.body || "").toLowerCase().includes("litvm")) {
              tag = "litvm"; tagLabel = "LitVM";
            }
            const pubDate = new Date(n.published_on * 1000);
            const now = new Date();
            const diffMs = now - pubDate;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const timeAgo = diffMins < 60 ? `${diffMins}m ago` : `${diffHours}h ago`;
            return {
              id: 100 + i,
              tag,
              tagLabel,
              title: n.title,
              source: n.source_info?.name || n.source || "CryptoCompare",
              time: timeAgo,
              url: n.url
            };
          });
          setNewsItems(mapped);
        }
      } catch (e) {
        console.warn("CryptoCompare news fetch failed, using static fallback:", e);
        setNewsItems(INITIAL_NEWS_ITEMS);
      }
    };
    fetchNews();
    // Refresh every 5 minutes
    const nid = setInterval(fetchNews, 300000);
    return () => clearInterval(nid);
  }, []);

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
    if (isPaperMode) { logPaperTrade(tradeSide, tradeQty); return; }
    if (!signer) { toast("Connect wallet first", "error"); return; }
    if (chainId !== LITVM_CHAIN_ID) { toast("Switch to LitVM network", "error"); return; }
    if (!tradeQty || parseFloat(tradeQty) <= 0) { toast("Enter valid amount", "error"); return; }
    if (parseFloat(tradeQty) > parseFloat(settings.maxBetAmount)) { toast("Exceeds max bet amount", "error"); return; }
    setLoading(true);
    try {
      const c = new ethers.Contract(settings.contractAddr, LITE_PREDICT_ABI, signer);
      const val = ethers.parseEther(tradeQty);
      const tx = tradeSide === "Bull" ? await c.betBull(currentEpoch, { value: val }) : await c.betBear(currentEpoch, { value: val });
      toast(`${tradeSide} order submitted…`, "info");
      await tx.wait();
      toast(`${tradeSide} position entered! Round #${currentEpoch}`, "success");
      setTradeQty(settings.defaultBetAmount);
      await loadData();
    } catch(e) { toast(e.reason || "Transaction failed", "error"); }
    setLoading(false);
  };

  /* ═══ Claim ═══ */
  const claimAll = async () => {
    if (!signer || claimableEpochs.length === 0) return;
    setLoading(true);
    try {
      const c = new ethers.Contract(settings.contractAddr, LITE_PREDICT_ABI, signer);
      const tx = await c.claim(claimableEpochs);
      await tx.wait();
      toast(`Claimed ${claimableEpochs.length} round(s)!`, "success");
      await loadData();
    } catch(e) { toast("Claim failed", "error"); }
    setLoading(false);
  };
  const handleClaim = claimAll;

  /* ═══ Paper Trading Helpers ═══ */
  const logPaperTrade = (side, amount) => {
    if (!amount || parseFloat(amount) <= 0) { toast("Enter a valid amount", "error"); return; }
    if (parseFloat(amount) > paperBalance) { toast("Insufficient paper balance", "error"); return; }
    
    setPaperBalance(p => {
      const nb = p - parseFloat(amount);
      localStorage.setItem("lp_paper_balance", nb);
      return nb;
    });

    const biddingRound = rounds[currentEpoch] || null;
    const newTrade = {
      id: Date.now(),
      epoch: currentEpoch, side, amount: parseFloat(amount), entryPrice: ltcPrice, status: "Open",
      lockTimestamp: biddingRound ? biddingRound.lockTimestamp : Math.floor(Date.now() / 1000) + 300,
      closeTimestamp: biddingRound ? biddingRound.closeTimestamp : Math.floor(Date.now() / 1000) + 600,
      result: null, pnl: 0, payout: 0, closePrice: 0, lockPrice: 0
    };
    const updated = [...paperTrades, newTrade];
    setPaperTrades(updated);
    localStorage.setItem("lp_paper_trades", JSON.stringify(updated));
    toast(`Paper bet placed: ${side} ${amount} zkLTC`, "success");
  };

  const clearPaperHistory = () => {
    if (confirm("Are you sure you want to clear your Paper Trading history?")) {
      setPaperTrades([]);
      localStorage.removeItem("lp_paper_trades");
      setPaperBalance(settings.paperStartBalance);
      localStorage.setItem("lp_paper_balance", settings.paperStartBalance);
      toast("Paper history cleared", "info");
    }
  };

  useEffect(() => {
    if (paperTrades.length === 0) return;
    let changed = false;
    let newBal = paperBalance;
    const updated = paperTrades.map(trade => {
      if (trade.status !== "Open") return trade;
      const r = rounds[trade.epoch];
      if (r && r.oracleCalled) {
        changed = true;
        if (r.cancelled) {
          newBal += trade.amount;
          return { ...trade, status: "Closed", result: "Cancel", payout: trade.amount, pnl: 0, closePrice: r.closePrice, lockPrice: r.lockPrice };
        }
        const winner = r.closePrice > r.lockPrice ? "Bull" : "Bear";
        if (trade.side === winner) {
          const winPool = winner === "Bull" ? parseFloat(r.bullAmount) : parseFloat(r.bearAmount);
          const rewardAmount = parseFloat(r.rewardAmount);
          const payout = winPool > 0 ? (trade.amount * rewardAmount) / winPool : trade.amount;
          const pnl = ((payout - trade.amount) / trade.amount) * 100;
          newBal += payout;
          playSound('win');
          toast(`🏆 Paper Trade Win! Round #${trade.epoch} paid +${pnl.toFixed(1)}%`, "success");
          addNotification(`Paper Trade Win`, `Round #${trade.epoch} paid +${pnl.toFixed(1)}%`, 'success');
          return { ...trade, status: "Closed", result: "Win", payout, pnl, closePrice: r.closePrice, lockPrice: r.lockPrice };
        } else {
          toast(`💀 Paper Trade Loss. Round #${trade.epoch} closed against you.`, "error");
          return { ...trade, status: "Closed", result: "Loss", payout: 0, pnl: -100, closePrice: r.closePrice, lockPrice: r.lockPrice };
        }
      }
      return trade;
    });

    if (changed) {
      setPaperTrades(updated);
      localStorage.setItem("lp_paper_trades", JSON.stringify(updated));
      setPaperBalance(newBal);
      localStorage.setItem("lp_paper_balance", newBal);
    }
  }, [rounds, paperTrades, toast, paperBalance, playSound, addNotification]);

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

  /* ═══ Watchlist & Filter Helpers ═══ */
  const toggleWatchlist = (epoch, e) => {
    e.stopPropagation();
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(epoch)) next.delete(epoch); else next.add(epoch);
      localStorage.setItem("lp_watchlist", JSON.stringify([...next]));
      return next;
    });
  };

  /* ═══ Export CSV ═══ */
  const exportCSV = () => {
    let csv = "ID,Epoch,Side,Amount,EntryPrice,Status,Result,PnL,Payout,ClosePrice,LockPrice\n";
    paperTrades.forEach(t => {
      csv += `${t.id},${t.epoch},${t.side},${t.amount},${t.entryPrice},${t.status},${t.result||''},${t.pnl},${t.payout},${t.closePrice},${t.lockPrice}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', 'paper_trades.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* ═══ Backtest Engine ═══ */
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestResults, setBacktestResults] = useState(null);
  const backtestChartRef = useRef(null);
  const backtestChartContainerRef = useRef(null);
  const backtestLineSeriesRef = useRef(null);

  const runBacktest = async (strategy) => {
    setIsBacktesting(true);
    setBacktestResults(null);
    try {
      const rpcProvider = new ethers.JsonRpcProvider(LITVM_RPC);
      const contract = new ethers.Contract(settings.contractAddr, LITE_PREDICT_ABI, rpcProvider);
      const epoch = currentEpoch;
      const results = [];
      let balance = settings.paperStartBalance;
      let peak = balance;
      let maxDrawdown = 0;
      
      for (let ep = Math.max(1, epoch - 50); ep < epoch - 1; ep++) {
        try {
          const r = await contract.rounds(ep);
          const round = {
            epoch: ep, lockPrice: Number(r[4]) / 1e18, closePrice: Number(r[5]) / 1e18,
            bullAmount: ethers.formatEther(r[7]), bearAmount: ethers.formatEther(r[8]),
            totalAmount: ethers.formatEther(r[6]), oracleCalled: r[11], cancelled: r[12]
          };
          if (!round.oracleCalled || round.cancelled) continue;
          
          let side;
          if (strategy === 'always_bull') side = 'Bull';
          else if (strategy === 'always_bear') side = 'Bear';
          else if (strategy === 'momentum') {
            side = round.lockPrice > (results.length > 0 ? results[results.length-1].closePrice : round.lockPrice) ? 'Bull' : 'Bear';
          } else { 
            const bullAmt = parseFloat(round.bullAmount);
            const bearAmt = parseFloat(round.bearAmount);
            side = bullAmt > bearAmt ? 'Bear' : 'Bull';
          }
          
          const betAmt = balance * 0.05; 
          const winPool = side === 'Bull' ? parseFloat(round.bullAmount) : parseFloat(round.bearAmount);
          const totalPool = parseFloat(round.totalAmount);
          const winner = round.closePrice > round.lockPrice ? 'Bull' : 'Bear';
          
          let pnl = -betAmt;
          let result = 'Loss';
          if (winner === side && winPool > 0) {
            const payout = betAmt * (totalPool * 0.98) / winPool;
            pnl = payout - betAmt;
            result = 'Win';
          }
          
          balance += pnl;
          peak = Math.max(peak, balance);
          const drawdown = (peak - balance) / peak * 100;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
          
          results.push({ epoch: ep, side, result, pnl, balance, closePrice: round.closePrice, lockPrice: round.lockPrice, time: ep });
        } catch (_) {}
      }
      setBacktestResults({ results, finalBalance: balance, maxDrawdown, strategy });
    } catch(e) { toast("Backtest failed", "error"); }
    setIsBacktesting(false);
  };

  useEffect(() => {
    if (activeTab === 'backtest' && backtestResults && backtestChartContainerRef.current) {
      if (!backtestChartRef.current) {
        const chart = createChart(backtestChartContainerRef.current, {
          layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#888" },
          grid: { vertLines: { visible: false }, horzLines: { color: "#222" } },
          width: backtestChartContainerRef.current.offsetWidth,
          height: 250,
        });
        const lineSeries = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
        backtestChartRef.current = chart;
        backtestLineSeriesRef.current = lineSeries;
      }
      const data = backtestResults.results.map((r, i) => ({ time: i, value: r.balance }));
      backtestLineSeriesRef.current.setData(data);
      backtestChartRef.current.timeScale().fitContent();
    }
  }, [activeTab, backtestResults]);

  /* ═══ Slippage / Est Payout ═══ */
  const biddingRound = rounds[currentEpoch] || null;
  const liveRound = rounds[currentEpoch - 1] || null;
  const endedRound = rounds[currentEpoch - 2] || null;

  const estTradeCalc = () => {
    if (!tradeQty || !biddingRound) return { payout: "0.00", mult: "0.00", impact: "0.0" };
    const qty = parseFloat(tradeQty);
    const total = parseFloat(biddingRound.totalAmount) + qty;
    const pool = (tradeSide==="Bull" ? parseFloat(biddingRound.bullAmount) : parseFloat(biddingRound.bearAmount)) + qty;
    if (pool === 0) return { payout: "0.00", mult: "0.00", impact: "0.0" };
    const mult = (total * 0.98) / pool;
    const origPool = tradeSide==="Bull" ? parseFloat(biddingRound.bullAmount) : parseFloat(biddingRound.bearAmount);
    const origTotal = parseFloat(biddingRound.totalAmount);
    const origMult = origPool > 0 ? (origTotal * 0.98) / origPool : mult;
    const impact = origMult > 0 ? ((origMult - mult) / origMult * 100).toFixed(1) : "0.0";
    return { payout: (qty * mult).toFixed(4), mult: mult.toFixed(2), impact };
  };
  const tradeEst = estTradeCalc();

  const getMult = (round, side) => {
    if (!round) return "—";
    const total = parseFloat(round.totalAmount);
    const pool = side==="Bull" ? parseFloat(round.bullAmount) : parseFloat(round.bearAmount);
    if (!pool || !total) return "—";
    return `${(total * 0.98 / pool).toFixed(2)}x`;
  };

  /* ═══ Sub-components ═══ */
  const RoundCard = ({ r, type }) => {
    if (!r) return (
      <div className="round-card skeleton">
        <div className="skeleton-line" style={{width: '60%'}}></div>
        <div className="skeleton-line"></div>
        <div className="skeleton-line"></div>
      </div>
    );
    const score = calcRoundScore(r);
    const scoreColor = score >= 3 ? "#22c55e" : score >= 1.8 ? "#f59e0b" : "#ef4444";
    const isWatch = watchlist.has(r.epoch);

    return (
      <div className={`round-card ${type}`} onClick={() => setContextModalRound(r)}>
        <div className="rc-header">
          <span className="rc-epoch">#{r.epoch}</span>
          <span className={`rc-badge ${type}`}>{type.toUpperCase()}</span>
          <span className="rc-star" onClick={(e) => toggleWatchlist(r.epoch, e)}>{isWatch ? '⭐' : '☆'}</span>
        </div>
        <div className="rc-pools">
          <div className="rc-pool bull">Bull: {getMult(r, 'Bull')}</div>
          <div className="rc-pool bear">Bear: {getMult(r, 'Bear')}</div>
        </div>
        <div className="rc-footer">
          <span className="rc-total">Pool: {fmt4(r.totalAmount)}</span>
          <span className="rc-score" style={{color: scoreColor, borderColor: scoreColor}}>★ {score}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`app ${settings.isDarkTheme ? '' : 'light-theme'}`}>

      {viewMode === 'landing' ? (
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', padding:40, textAlign:'center', background: 'linear-gradient(135deg, var(--bg-main) 0%, var(--bg-panel) 100%)'}}>
          <div style={{fontSize: 72, marginBottom: 20}}>🔮</div>
          <h1 style={{fontSize: 48, marginBottom: 16, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>LitePredict on LitVM</h1>
          <p style={{fontSize: 20, color: 'var(--text-secondary)', maxWidth: 600, marginBottom: 40}}>
            The premier prediction market for the Litecoin ecosystem. Predict LTC price movements, earn LPs, and climb the leaderboard on the high-speed LitVM Testnet.
          </p>
          <div style={{display:'flex', gap: 16, marginBottom: 60}}>
            <button className="btn btn-primary" style={{fontSize: 18, padding: '16px 32px'}} onClick={() => setViewMode('app')}>Launch App</button>
            <button className="btn btn-ghost" style={{fontSize: 18, padding: '16px 32px', border: '2px solid #f59e0b', color: '#f59e0b'}} onClick={addLitVMNetwork}>🦊 Add LitVM Testnet</button>
            <button className="btn btn-secondary" style={{fontSize: 18, padding: '16px 32px'}} onClick={() => { setViewMode('app'); setShowOnboarding(true); }}>📖 How to Play</button>
          </div>
          
          <div style={{display:'flex', gap:40, opacity: 0.8}}>
            <div>
              <div style={{fontSize: 24, fontWeight: 'bold'}}>{currentEpoch}</div>
              <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>Rounds Played</div>
            </div>
            <div>
              <div style={{fontSize: 24, fontWeight: 'bold'}}>8,000 TPS</div>
              <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>LitVM Speed</div>
            </div>
            <div>
              <div style={{fontSize: 24, fontWeight: 'bold'}}>DIA</div>
              <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>Trustless Oracle</div>
            </div>
          </div>
        </div>
      ) : (
        <>
      <style>{`
        .light-theme {
          --bg-main: #f8fafc;
          --bg-panel: #ffffff;
          --bg-input: #f1f5f9;
          --border: #e2e8f0;
          --text-primary: #0f172a;
          --text-secondary: #64748b;
        }
        :root {
          --bg-main: #0a0a0a;
          --bg-panel: #111111;
          --bg-input: #1a1a1a;
          --border: #222222;
          --text-primary: #ffffff;
          --text-secondary: #888888;
        }
        .app { display: flex; flex-direction: column; height: 100vh; background: var(--bg-main); color: var(--text-primary); font-family: -apple-system, system-ui, sans-serif; }
        .topbar { display: flex; align-items: center; padding: 0 16px; height: 50px; background: var(--bg-panel); border-bottom: 1px solid var(--border); }
        .topbar-brand { display: flex; align-items: center; gap: 8px; font-weight: bold; }
        .topbar-divider { width: 1px; height: 24px; background: var(--border); margin: 0 12px; }
        .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
        .main-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; padding: 8px; gap: 8px; }
        .chart-section { flex: 1; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; display: flex; flex-direction: column; position: relative; }
        .chart-toolbar { display: flex; padding: 4px 8px; border-bottom: 1px solid var(--border); }
        .chart-canvas-area { flex: 1; position: relative; }
        .rounds-row { display: flex; gap: 8px; height: 100px; flex-shrink: 0; }
        .round-card { flex: 1; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; padding: 8px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; justify-content: space-between; }
        .round-card:hover { border-color: #3b82f6; }
        .round-card.skeleton { animation: pulse 1.5s infinite; }
        .rc-header { display: flex; justify-content: space-between; align-items: center; }
        .rc-badge { font-size: 10px; padding: 2px 4px; border-radius: 2px; }
        .rc-badge.bidding { background: #3b82f622; color: #3b82f6; }
        .rc-badge.live { background: #f59e0b22; color: #f59e0b; }
        .rc-badge.ended { background: #64748b22; color: #64748b; }
        .rc-pools { display: flex; justify-content: space-between; font-size: 13px; margin: 8px 0; }
        .rc-pool.bull { color: #22c55e; } .rc-pool.bear { color: #ef4444; }
        .rc-footer { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-secondary); }
        .rc-score { border: 1px solid; padding: 1px 4px; border-radius: 4px; font-weight: bold; }
        .bottom-panels { display: flex; gap: 8px; height: 35%; flex-shrink: 0; }
        .panel { flex: 1; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; display: flex; flex-direction: column; overflow: hidden; }
        .panel-header { display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--border); background: var(--bg-main); font-weight: bold; }
        .panel-body { flex: 1; overflow-y: auto; padding: 8px; }
        .news-item { padding: 8px 0; border-bottom: 1px solid var(--border); }
        .news-item:last-child { border-bottom: none; }
        .news-tag { font-size: 10px; padding: 2px 4px; border-radius: 2px; margin-right: 6px; }
        .news-tag.litvm { background: #3b82f622; color: #3b82f6; }
        .news-tag.litecoin { background: #8b5cf622; color: #8b5cf6; }
        .news-title { font-size: 13px; margin: 4px 0; }
        .news-meta { font-size: 11px; color: var(--text-secondary); display: flex; gap: 4px; }
        .btn { padding: 6px 12px; border-radius: 4px; cursor: pointer; border: none; font-size: 13px; font-weight: bold; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-secondary { background: var(--bg-input); color: var(--text-primary); }
        .btn-ghost { background: transparent; color: var(--text-primary); }
        .tabs { display: flex; border-bottom: 1px solid var(--border); }
        .tab { flex: 1; padding: 8px; text-align: center; cursor: pointer; font-size: 13px; }
        .tab.active { border-bottom: 2px solid #3b82f6; font-weight: bold; }
        .toast-container { position: fixed; bottom: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
        .toast { padding: 12px 16px; border-radius: 4px; background: var(--bg-panel); border: 1px solid var(--border); display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .toast.success { border-left: 4px solid #22c55e; }
        .toast.error { border-left: 4px solid #ef4444; }
        .toast.warning { border-left: 4px solid #f59e0b; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; }
        .modal { background: var(--bg-panel); border-radius: 8px; width: 400px; max-width: 90%; padding: 20px; border: 1px solid var(--border); box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .modal-header { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-bottom: 16px; }
        .modal-close { cursor: pointer; color: var(--text-secondary); }
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary); }
        .form-control { width: 100%; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary); }
        .trade-panel { display: flex; flex-direction: column; gap: 12px; }
        .trade-btn { flex: 1; padding: 12px; font-size: 16px; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; color: white; }
        .trade-btn.bull { background: #22c55e; } .trade-btn.bear { background: #ef4444; }
        .table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .table th, .table td { padding: 6px; text-align: right; border-bottom: 1px solid var(--border); }
        .table th:first-child, .table td:first-child { text-align: left; }
        .icon-btn { cursor: pointer; padding: 4px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }
        .icon-btn:hover { background: var(--bg-input); }
        .notif-dropdown { position: absolute; top: 40px; right: 0; width: 300px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; max-height: 400px; overflow-y: auto; }
        .notif-item { padding: 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
        .notif-item.unread { background: var(--bg-input); font-weight: bold; }
        .skeleton-line { height: 12px; background: var(--bg-input); border-radius: 4px; margin-bottom: 6px; }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>

      {/* ═══ TOASTS ═══ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type==="success"?"✓":t.type==="error"?"✕":"·"}</span>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ═══ SETTINGS MODAL ═══ */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span>Settings</span><span className="modal-close" onClick={() => setShowSettings(false)}>✕</span></div>
            <div className="form-group">
              <label>Theme</label>
              <button className="btn btn-secondary" onClick={() => updateSetting('isDarkTheme', !settings.isDarkTheme)}>
                {settings.isDarkTheme ? '🌙 Dark Mode' : '☀️ Light Mode'}
              </button>
            </div>
            <div className="form-group">
              <label>Alerts & Notifications</label>
              <label style={{display:'flex', alignItems:'center', gap:8}}><input type="checkbox" checked={settings.soundEnabled} onChange={e => updateSetting('soundEnabled', e.target.checked)}/> Sound Alerts</label>
              <label style={{display:'flex', alignItems:'center', gap:8}}><input type="checkbox" checked={settings.desktopNotifEnabled} onChange={requestNotifPermission}/> Desktop Notifications</label>
            </div>
            <div className="form-group">
              <label>High-Conviction Alert Threshold (Score)</label>
              <input type="number" step="0.1" className="form-control" value={settings.alertThreshold} onChange={e => updateSetting('alertThreshold', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Discord Webhook URL (for alerts)</label>
              <input type="text" className="form-control" placeholder="https://discord.com/api/webhooks/..." value={settings.webhookUrl} onChange={e => updateSetting('webhookUrl', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Auto-Scan Interval</label>
              <select className="form-control" value={settings.scanInterval} onChange={e => updateSetting('scanInterval', Number(e.target.value))}>
                <option value={30}>30 Seconds</option><option value={60}>1 Minute</option><option value={120}>2 Minutes</option><option value={300}>5 Minutes</option>
              </select>
            </div>
            <div className="form-group">
              <label>Contract Address</label>
              <input type="text" className="form-control" value={settings.contractAddr} onChange={e => updateSetting('contractAddr', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ ROUND CONTEXT MODAL ═══ */}
      {contextModalRound && (
        <div className="modal-overlay" onClick={() => setContextModalRound(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span>Round #{contextModalRound.epoch} Details</span><span className="modal-close" onClick={() => setContextModalRound(null)}>✕</span></div>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 12}}>
              <span>Pool Size: {fmt4(contextModalRound.totalAmount)}</span>
              <span style={{fontWeight:'bold', color: '#f59e0b'}}>Score: {calcRoundScore(contextModalRound)}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 12}}>
              <span className="rc-pool bull">Bull: {getMult(contextModalRound, 'Bull')} ({fmt4(contextModalRound.bullAmount)})</span>
              <span className="rc-pool bear">Bear: {getMult(contextModalRound, 'Bear')} ({fmt4(contextModalRound.bearAmount)})</span>
            </div>
            <div className="form-group">
              <div style={{display:'flex', gap:8}}>
                <button className="btn btn-secondary" style={{flex:1}} onClick={() => window.open(`https://www.google.com/search?q=LTC+USD+prediction`, '_blank')}>🔍 News</button>
                <button className="btn btn-secondary" style={{flex:1}} onClick={() => window.open(`https://twitter.com/search?q=LTC+USD`, '_blank')}>🐦 Twitter</button>
              </div>
            </div>
            {contextModalRound.epoch === currentEpoch && (
              <div style={{display:'flex', gap:8, marginTop: 16}}>
                <button className="trade-btn bull" onClick={() => { setTradeSide('Bull'); setActiveTab('trade'); setContextModalRound(null); }}>Trade Bull</button>
                <button className="trade-btn bear" onClick={() => { setTradeSide('Bear'); setActiveTab('trade'); setContextModalRound(null); }}>Trade Bear</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ HIGH CONVICTION ALERT MODAL ═══ */}
      {hcAlert && (
        <div className="modal-overlay" onClick={() => setHcAlert(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{border: '2px solid #f59e0b', boxShadow: '0 0 20px rgba(245,158,11,0.4)'}}>
            <div className="modal-header" style={{color: '#f59e0b'}}>🚨 HIGH CONVICTION ALERT</div>
            <p style={{fontSize: 16, marginBottom: 16}}>
              Round #{hcAlert.epoch} is showing a massive <b>{hcAlert.edge}</b> edge! <br/><br/>
              Opportunity Score: <b>{hcAlert.score}</b> (Threshold: {settings.alertThreshold})
            </p>
            <div style={{display:'flex', gap:8}}>
              <button className={`trade-btn ${hcAlert.edge.toLowerCase()}`} onClick={() => { setTradeSide(hcAlert.edge); setActiveTab('trade'); setHcAlert(null); }}>
                Trade {hcAlert.edge} Now
              </button>
              <button className="btn btn-secondary" onClick={() => setHcAlert(null)}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TOPBAR ═══ */}
      <header className="topbar">
        <div className="topbar-brand"><div className="brand-logo" style={{background: '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: 4}}>LP</div><span className="brand-name">LitePredict v2.0</span></div>
        <div className="topbar-divider" />

        <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12}}>
          <div style={{width: 8, height: 8, borderRadius: '50%', background: isScanning ? '#f59e0b' : '#22c55e', animation: isScanning ? 'pulse 1s infinite' : 'none'}} />
          <span style={{color: 'var(--text-secondary)'}}>{isScanning ? 'SCANNING...' : 'LIVE'}</span>
        </div>
        <div className="topbar-divider" />

        <span className={`market-price ${priceDir === "up" ? "bull" : priceDir === "down" ? "bear" : ""}`} style={{fontWeight: 'bold', fontSize: 16, color: priceDir==='up'?'#22c55e':priceDir==='down'?'#ef4444':''}}>
          ${fmt4(ltcPrice)}
        </span>
        
        <div className="topbar-stats" style={{display:'flex', gap: 16, marginLeft: 16, fontSize: 12}}>
          <div><span style={{color:'var(--text-secondary)'}}>Round</span> <b>#{currentEpoch || "—"}</b></div>
          <div><span style={{color:'var(--text-secondary)'}}>Next Scan:</span> <b>{scanCountdown}s</b></div>
          <button className="btn btn-ghost" style={{padding: '2px 6px', fontSize: 11, border: '1px solid var(--border)'}} onClick={loadData}>🔄 Scan Now</button>
        </div>

        <div className="topbar-right" style={{position: 'relative'}}>
          <button className="btn btn-ghost" style={{display:"flex",alignItems:"center",gap:5,color:"#10b981",border:"1px solid #10b981",fontSize:12}} onClick={() => setShowOnboarding(true)}>
            📖 How to Play
          </button>
          <button className="btn btn-ghost" style={{display:"flex",alignItems:"center",gap:5,color:"#f59e0b",border:"1px solid #f59e0b",fontSize:12}} onClick={addLitVMNetwork}>
            🦊 Add LitVM
          </button>
          <a href="https://liteforge.hub.caldera.xyz" target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{display:"flex",alignItems:"center",gap:5,color:"#3b82f6",border:"1px solid #3b82f6",textDecoration:"none",fontSize:12}}>
            🚰 Get zkLTC
          </a>
          
          <div className="icon-btn" onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)} title="Toggle Sound">
            {settings.soundEnabled ? '🔔' : '🔕'}
          </div>

          <div className="icon-btn" style={{position: 'relative'}} onClick={() => setShowNotifications(!showNotifications)}>
            📫 {unreadNotifs > 0 && <div style={{position:'absolute', top:0, right:0, background:'#ef4444', color:'white', fontSize:9, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center'}}>{unreadNotifs}</div>}
          </div>
          {showNotifications && (
            <div className="notif-dropdown">
              <div style={{display:'flex', justifyContent:'space-between', padding: 8, borderBottom: '1px solid var(--border)', background: 'var(--bg-main)'}}>
                <b>Notifications</b>
                <span style={{fontSize: 11, color: '#3b82f6', cursor: 'pointer'}} onClick={markAllRead}>Mark all read</span>
              </div>
              {notifications.length === 0 ? <div style={{padding: 16, textAlign: 'center', color: 'var(--text-secondary)'}}>No notifications</div> :
                notifications.map(n => (
                  <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
                    <div style={{fontWeight: 'bold'}}>{n.title}</div>
                    <div style={{color: 'var(--text-secondary)', margin: '4px 0'}}>{n.body}</div>
                    <div style={{fontSize: 10, color: '#888'}}>{n.time}</div>
                  </div>
                ))}
            </div>
          )}

          <div className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">⚙️</div>

          <div className="topbar-divider" />

          {account ? (
            chainId !== LITVM_CHAIN_ID ? (
              <button className="btn btn-secondary" onClick={switchNetwork}>Switch to LitVM</button>
            ) : (
              <div style={{display:'flex', alignItems:'center', gap: 6, background: 'var(--bg-input)', padding: '4px 8px', borderRadius: 4, fontSize: 13, border: '1px solid var(--border)'}}>
                <div style={{width:8, height:8, borderRadius:'50%', background:'#22c55e'}} />
                {shortAddr(account)}
              </div>
            )
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </header>

      {/* ═══ MAIN ═══ */}
      <div className="main-content">

        {/* ── CHART SECTION ── */}
        <div className="chart-section" style={{flex: 1.5}}>
          <div className="chart-toolbar">
            <div style={{display:'flex', gap:4}}>
              {["Candles","Line","Area"].map(t => (
                <button key={t} className="btn btn-ghost" style={{background: chartType===t ? 'var(--bg-input)' : 'transparent'}} onClick={() => setChartType(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="chart-canvas-area">
            <div id="tv-chart" ref={chartContainerRef} style={{width:"100%",height:"100%"}} />
            <div style={{position:'absolute', top: 16, left: 16, display:'flex', gap: 8, flexDirection:'column'}}>
               <div style={{background: 'var(--bg-panel)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6}}>
                 <div style={{width:6, height:6, borderRadius:'50%', background:'#ef4444', animation: 'pulse 1s infinite'}} />
                 Closes in: <b style={{color: timeLeft < 30 ? '#ef4444' : 'inherit'}}>{fmtTime(timeLeft)}</b>
               </div>
            </div>
          </div>
        </div>

        {/* ── ROUND CARDS PANEL ── */}
        <div className="rounds-row">
          <RoundCard r={biddingRound} type="bidding" />
          <RoundCard r={liveRound} type="live" />
          <RoundCard r={endedRound} type="ended" />
        </div>

        {/* ── BOTTOM 3 PANELS ── */}
        <div className="bottom-panels" style={{flex: 1.2}}>

          {/* ── LEFT: NEWS ── */}
          <div className="panel" style={{flex: 1}}>
            <div className="panel-header" style={{padding:0}}>
              <div className="tabs">
                {['all','litvm','litecoin','market','defi'].map(c => (
                  <div key={c} className={`tab ${newsCategory===c ? 'active' : ''}`} style={{padding: '8px 4px', fontSize: 11}} onClick={() => setNewsCategory(c)}>
                    {c.toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
            <div className="panel-body">
              {newsItems.filter(n => newsCategory === 'all' || n.tag === newsCategory).map(n => (
                <div className="news-item" key={n.id}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <span className={`news-tag ${n.tag}`}>{n.tagLabel}</span>
                    <div style={{display:'flex', gap:4}}>
                      <span className="icon-btn" onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(n.title)}`, '_blank')} title="Search on Google">🔍</span>
                      <span className="icon-btn" onClick={() => window.open(`https://twitter.com/search?q=${encodeURIComponent(n.title)}&src=typed_query`, '_blank')} title="Search on Twitter/X">🐦</span>
                    </div>
                  </div>
                  <div
                    className="news-title"
                    style={{cursor: n.url ? 'pointer' : 'default'}}
                    onClick={() => n.url && window.open(n.url, '_blank')}
                    title={n.url ? "Read full article" : ""}
                  >{n.title}</div>
                  <div className="news-meta"><span>{n.source}</span>·<span>{n.time}</span></div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CENTER: CHAT ── */}
          <div className="panel" style={{flex: 1}}>
            <div className="panel-header"><span className="panel-title">Community Chat</span></div>
            <div className="panel-body" ref={chatBodyRef} style={{display:'flex', flexDirection:'column', gap:8}}>
              {chatMessages.map(m => (
                <div key={m.id} style={{fontSize: 12, lineHeight: 1.4}}>
                  <div style={{display:'flex', alignItems:'center', gap:4, marginBottom: 2}}>
                    <span>{m.avatar}</span>
                    <span style={{fontWeight:'bold', color: m.color}}>{m.user}</span>
                    {m.badge && <span style={{fontSize:9, background:'var(--bg-input)', padding:'1px 4px', borderRadius:2}}>{m.badge}</span>}
                    <span style={{fontSize:10, color:'var(--text-secondary)', marginLeft:'auto'}}>{m.time}</span>
                  </div>
                  <div style={{color:'var(--text-primary)'}}>{m.text}</div>
                </div>
              ))}
            </div>
            <div style={{padding: 8, borderTop: '1px solid var(--border)', display:'flex', gap:4}}>
              <input type="text" className="form-control" placeholder="Type a message..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} />
              <button className="btn btn-primary" onClick={sendChat}>Send</button>
            </div>
          </div>

          {/* ── RIGHT: TRADING & TABS ── */}
          <div className="panel" style={{flex: 1.5}}>
            <div className="tabs" style={{padding: 0, margin: 0, borderBottom: '1px solid var(--border)'}}>
              <div className={`tab ${activeTab==='orderbook'?'active':''}`} onClick={()=>setActiveTab('orderbook')}>Book</div>
              <div className={`tab ${activeTab==='trade'?'active':''}`} onClick={()=>setActiveTab('trade')}>Trade</div>
              <div className={`tab ${activeTab==='positions'?'active':''}`} onClick={()=>setActiveTab('positions')}>Portfolio</div>
              <div className={`tab ${activeTab==='watchlist'?'active':''}`} onClick={()=>setActiveTab('watchlist')}>Watchlist</div>
              <div className={`tab ${activeTab==='backtest'?'active':''}`} onClick={()=>setActiveTab('backtest')}>Backtest</div>
              <div className={`tab ${activeTab==='points'?'active':''}`} onClick={()=>setActiveTab('points')}>Points</div>
            </div>
            <div className="panel-body" style={{padding: activeTab==='trade'?16:0}}>
              
              {/* ORDERBOOK TAB */}
              {activeTab === 'orderbook' && (
                <div style={{display:'flex', width:'100%', height:'100%'}}>
                  <div style={{flex:1, borderRight:'1px solid var(--border)'}}>
                    <div style={{display:'flex', justifyContent:'space-between', padding:'4px 8px', fontSize:11, color:'var(--text-secondary)', borderBottom:'1px solid var(--border)'}}><span>Size</span><span>Price</span></div>
                    {orderbook.asks.slice(-10).map((a, i) => (
                      <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'2px 8px', fontSize:12, position:'relative', cursor:'pointer'}} onClick={() => { setLimitPrice(a.price.toFixed(4)); setActiveTab('trade'); }}>
                        <div style={{position:'absolute', right:0, top:0, bottom:0, width:`${(a.total/orderbook.asks[orderbook.asks.length-1].total)*100}%`, background:'#ef444422', zIndex:1}} />
                        <span style={{zIndex:2}}>{a.size}</span><span style={{color:'#ef4444', zIndex:2}}>{a.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex', justifyContent:'space-between', padding:'4px 8px', fontSize:11, color:'var(--text-secondary)', borderBottom:'1px solid var(--border)'}}><span>Price</span><span>Size</span></div>
                    {orderbook.bids.slice(0,10).map((b, i) => (
                      <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'2px 8px', fontSize:12, position:'relative', cursor:'pointer'}} onClick={() => { setLimitPrice(b.price.toFixed(4)); setActiveTab('trade'); }}>
                        <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${(b.total/orderbook.bids[orderbook.bids.length-1].total)*100}%`, background:'#22c55e22', zIndex:1}} />
                        <span style={{color:'#22c55e', zIndex:2}}>{b.price.toFixed(2)}</span><span style={{zIndex:2}}>{b.size}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TRADE TAB */}
              {activeTab === 'trade' && (
                <div className="trade-panel">
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div className="tabs" style={{border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden'}}>
                      <div className={`tab ${tradeSide==='Bull'?'active':''}`} style={{padding:'4px 12px', background: tradeSide==='Bull'?'#22c55e22':'', color: tradeSide==='Bull'?'#22c55e':''}} onClick={()=>setTradeSide('Bull')}>BULL</div>
                      <div className={`tab ${tradeSide==='Bear'?'active':''}`} style={{padding:'4px 12px', background: tradeSide==='Bear'?'#ef444422':'', color: tradeSide==='Bear'?'#ef4444':''}} onClick={()=>setTradeSide('Bear')}>BEAR</div>
                    </div>
                    <label style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}><input type="checkbox" checked={isPaperMode} onChange={e=>setIsPaperMode(e.target.checked)}/> Paper Mode</label>
                  </div>
                  <div className="form-group">
                    <label>Amount (zkLTC)</label>
                    <input type="number" className="form-control" placeholder="0.0" value={tradeQty} onChange={e => setTradeQty(e.target.value)} />
                    {isPaperMode && <div style={{fontSize:11, color:'var(--text-secondary)', marginTop:4, textAlign:'right'}}>Paper Balance: {paperBalance.toFixed(2)}</div>}
                  </div>
                  
                  <div style={{background: 'var(--bg-input)', padding: 12, borderRadius: 4, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}><span>Est. Multiplier:</span> <b>{tradeEst.mult}x</b></div>
                    <div style={{display:'flex', justifyContent:'space-between'}}><span>Price Impact:</span> <b style={{color: parseFloat(tradeEst.impact) > 5 ? '#ef4444' : ''}}>{tradeEst.impact}%</b></div>
                    <div style={{display:'flex', justifyContent:'space-between'}}><span>Est. Payout:</span> <b style={{color: '#22c55e'}}>{tradeEst.payout} zkLTC</b></div>
                  </div>

                  <button className={`trade-btn ${tradeSide.toLowerCase()}`} onClick={placeBet} disabled={loading}>
                    {loading ? "Processing..." : `Place ${tradeSide} Bet`}
                  </button>
                </div>
              )}

              {/* POSITIONS TAB */}
              {activeTab === 'positions' && (
                <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                  <div style={{display:'flex', borderBottom:'1px solid var(--border)'}}>
                    <div className={`tab ${positionSubTab==='real'?'active':''}`} onClick={()=>setPositionSubTab('real')}>Real Trades</div>
                    <div className={`tab ${positionSubTab==='paper'?'active':''}`} onClick={()=>setPositionSubTab('paper')}>Paper Trades</div>
                  </div>
                  
                  {positionSubTab === 'real' && (
                    <div style={{padding: 8, overflowY:'auto', flex: 1}}>
                      {/* Summary Cards */}
                      <div style={{display:'flex', gap:8, marginBottom:12}}>
                        <div style={{flex:1, background:'var(--bg-input)', padding:8, borderRadius:4, textAlign:'center'}}>
                          <div style={{fontSize:11, color:'var(--text-secondary)'}}>Claimable</div>
                          <div style={{fontWeight:'bold', color:'#22c55e'}}>{claimableEpochs.length} Rounds</div>
                        </div>
                        <div style={{flex:1, background:'var(--bg-input)', padding:8, borderRadius:4, textAlign:'center'}}>
                          <div style={{fontSize:11, color:'var(--text-secondary)'}}>Active</div>
                          <div style={{fontWeight:'bold'}}>{Object.keys(userBets).filter(ep => Number(ep) >= currentEpoch - 1).length} Positions</div>
                        </div>
                      </div>
                      
                      <table className="table">
                        <thead><tr><th>Epoch</th><th>Side</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>
                          {Object.entries(userBets).reverse().map(([ep, b]) => (
                            <tr key={ep}>
                              <td>#{ep}</td>
                              <td style={{color: b.position==='Bull'?'#22c55e':'#ef4444'}}>{b.position}</td>
                              <td>{b.amount}</td>
                              <td>{b.claimed ? 'Claimed' : claimableEpochs.includes(Number(ep)) ? <button className="btn btn-primary" style={{padding:'2px 6px', fontSize:10}} onClick={claimAll}>Claim</button> : 'Pending'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {positionSubTab === 'paper' && (
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                      <div style={{padding: 8, borderBottom: '1px solid var(--border)', display:'flex', gap: 8, alignItems:'center', flexWrap: 'wrap'}}>
                        {['All','Open','Win','Loss','Cancel'].map(f => (
                          <span key={f} style={{fontSize: 11, padding: '2px 8px', borderRadius: 12, background: posFilter===f ? '#3b82f6' : 'var(--bg-input)', color: posFilter===f ? 'white' : 'var(--text-primary)', cursor: 'pointer'}} onClick={() => setPosFilter(f)}>{f}</span>
                        ))}
                        <div style={{marginLeft: 'auto', display: 'flex', gap: 4}}>
                           <button className="btn btn-ghost" style={{fontSize: 10, border: '1px solid var(--border)'}} onClick={exportCSV}>📥 CSV</button>
                           <button className="btn btn-ghost" style={{fontSize: 10, color: '#ef4444', border: '1px solid #ef4444'}} onClick={clearPaperHistory}>Clear</button>
                        </div>
                      </div>
                      <div style={{overflowY:'auto', flex: 1, padding: 8}}>
                        <table className="table">
                          <thead><tr><th>Round</th><th>Side</th><th>Amount</th><th>Result</th><th>PnL</th></tr></thead>
                          <tbody>
                            {paperTrades.filter(t => posFilter === 'All' || (posFilter === 'Open' && t.status === 'Open') || t.result === posFilter).slice().reverse().map(t => (
                              <tr key={t.id}>
                                <td>#{t.epoch}</td>
                                <td style={{color: t.side==='Bull'?'#22c55e':'#ef4444'}}>{t.side}</td>
                                <td>{t.amount}</td>
                                <td>{t.status==='Open' ? '⏳' : t.result==='Win' ? '🏆' : t.result==='Loss' ? '💀' : '➖'}</td>
                                <td style={{color: t.pnl > 0 ? '#22c55e' : t.pnl < 0 ? '#ef4444' : ''}}>{t.pnl ? `${t.pnl.toFixed(1)}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* WATCHLIST TAB */}
              {activeTab === 'watchlist' && (
                <div style={{padding: 8, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', height: '100%'}}>
                  {watchlist.size === 0 ? (
                    <div style={{textAlign: 'center', color: 'var(--text-secondary)', marginTop: 20}}>Star rounds to track them here</div>
                  ) : (
                    Array.from(watchlist).sort((a,b)=>b-a).map(ep => <RoundCard key={ep} r={rounds[ep]} type={ep === currentEpoch ? "bidding" : ep === currentEpoch - 1 ? "live" : "ended"} />)
                  )}
                </div>
              )}

              {/* POINTS TAB */}
              {activeTab === 'points' && (
                <div style={{padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', height: '100%'}}>
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-input)', padding:16, borderRadius:8}}>
                    <div>
                      <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>Your LitePoints (LPs)</div>
                      <div style={{fontSize: 24, fontWeight: 'bold'}}>{points}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize: 12, color: 'var(--text-secondary)'}}>Tier</div>
                      <div style={{fontSize: 16, fontWeight: 'bold', color: currentTier.color, textShadow: currentTier.shadow}}>{currentTier.name}</div>
                    </div>
                  </div>
                  {currentTier.next && (
                    <div>
                      <div style={{display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4}}>
                        <span>Progress to {getTier(currentTier.next).name}</span>
                        <span>{points} / {currentTier.next}</span>
                      </div>
                      <div style={{width:'100%', height:6, background:'var(--bg-input)', borderRadius:3, overflow:'hidden'}}>
                        <div style={{height:'100%', width:`${Math.min(100, ((points - currentTier.min) / (currentTier.next - currentTier.min)) * 100)}%`, background: getTier(currentTier.next).color}} />
                      </div>
                    </div>
                  )}

                  <button className="btn btn-primary" onClick={handleDailyCheckIn} disabled={lastCheckIn && (new Date().getTime() - parseInt(lastCheckIn)) < 86400000} style={{padding: 12, width: '100%'}}>
                    {lastCheckIn && (new Date().getTime() - parseInt(lastCheckIn)) < 86400000 ? 'Check back tomorrow' : '🎁 Daily Check-In (+50 LPs)'}
                  </button>

                  <div>
                    <div style={{fontSize: 12, fontWeight: 'bold', marginBottom: 8}}>Social Tasks</div>
                    <div style={{display:'flex', flexDirection:'column', gap:8}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg-input)', padding:'8px 12px', borderRadius:4}}>
                        <span style={{fontSize:12}}>Follow us on X</span>
                        <button className="btn btn-secondary" style={{fontSize:10}} disabled={completedTasks.includes('twitter')} onClick={() => handleSocialTask('twitter', 100)}>{completedTasks.includes('twitter') ? 'Done' : '+100 LPs'}</button>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--bg-input)', padding:'8px 12px', borderRadius:4}}>
                        <span style={{fontSize:12}}>Join Telegram</span>
                        <button className="btn btn-secondary" style={{fontSize:10}} disabled={completedTasks.includes('telegram')} onClick={() => handleSocialTask('telegram', 100)}>{completedTasks.includes('telegram') ? 'Done' : '+100 LPs'}</button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{fontSize: 12, fontWeight: 'bold', marginBottom: 8}}>Leaderboard</div>
                    <div style={{display:'flex', flexDirection:'column', gap:4}}>
                      {[
                        {rank:1, addr:'0xTrader...a8f4', pts:8540, tier:'Diamond', color:'#06b6d4'},
                        {rank:2, addr:'0xWhale...b1c9', pts:6200, tier:'Diamond', color:'#06b6d4'},
                        {rank:3, addr:'0xAlpha...d3e2', pts:4850, tier:'Gold', color:'#eab308'},
                        {rank:4, addr:'0xSniper...f7a1', pts:3920, tier:'Gold', color:'#eab308'},
                        {rank:5, addr:'0xChad...9c4b', pts:2150, tier:'Gold', color:'#eab308'}
                      ].map(l => (
                        <div key={l.rank} style={{display:'flex', justifyContent:'space-between', padding:'4px 8px', fontSize:12, borderBottom:'1px solid var(--border)'}}>
                          <span style={{width: 20}}>{l.rank}.</span>
                          <span style={{flex:1}}>{l.addr}</span>
                          <span style={{color:l.color, marginRight: 8, fontSize:10}}>{l.tier}</span>
                          <span style={{fontWeight:'bold'}}>{l.pts} LPs</span>
                        </div>
                      ))}
                      {points > 0 && (
                        <div style={{display:'flex', justifyContent:'space-between', padding:'4px 8px', fontSize:12, marginTop: 4, background:'var(--bg-input)', borderRadius:4, fontWeight:'bold'}}>
                          <span style={{width: 20}}>...</span>
                          <span style={{flex:1}}>You ({account ? shortAddr(account) : 'Connected'})</span>
                          <span style={{color:currentTier.color, marginRight: 8, fontSize:10}}>{currentTier.name}</span>
                          <span>{points} LPs</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* BACKTEST TAB */}
              {activeTab === 'backtest' && (
                <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                  <div style={{padding: 8, borderBottom: '1px solid var(--border)'}}>
                    <div style={{fontSize: 12, marginBottom: 8}}>Select Strategy:</div>
                    <div style={{display:'flex', gap:4, flexWrap:'wrap'}}>
                      <button className="btn btn-secondary" style={{fontSize:11}} onClick={() => runBacktest('always_bull')}>Always Bull</button>
                      <button className="btn btn-secondary" style={{fontSize:11}} onClick={() => runBacktest('always_bear')}>Always Bear</button>
                      <button className="btn btn-secondary" style={{fontSize:11}} onClick={() => runBacktest('momentum')}>Momentum</button>
                      <button className="btn btn-secondary" style={{fontSize:11}} onClick={() => runBacktest('contrarian')}>Contrarian</button>
                    </div>
                  </div>
                  {isBacktesting ? <div style={{padding: 20, textAlign: 'center'}}>Running backtest over last 50 rounds...</div> :
                   !backtestResults ? <div style={{padding: 20, textAlign: 'center', color: 'var(--text-secondary)'}}>Run a backtest to see equity curve</div> : (
                    <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                      <div style={{display: 'flex', padding: 8, gap: 8}}>
                        <div style={{flex:1, background:'var(--bg-input)', padding:8, borderRadius:4, textAlign:'center'}}>
                           <div style={{fontSize:11, color:'var(--text-secondary)'}}>Final Balance</div>
                           <div style={{fontWeight:'bold', color: backtestResults.finalBalance > settings.paperStartBalance ? '#22c55e' : '#ef4444'}}>${backtestResults.finalBalance.toFixed(2)}</div>
                        </div>
                        <div style={{flex:1, background:'var(--bg-input)', padding:8, borderRadius:4, textAlign:'center'}}>
                           <div style={{fontSize:11, color:'var(--text-secondary)'}}>Max Drawdown</div>
                           <div style={{fontWeight:'bold', color: '#ef4444'}}>{backtestResults.maxDrawdown.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div style={{flex: 1, minHeight: 250, padding: 8, position: 'relative'}} ref={backtestChartContainerRef}></div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
      
      {/* ═══ ONBOARDING MODAL ═══ */}
      {showOnboarding && (
        <div className="modal-overlay" onClick={() => setShowOnboarding(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span>Interactive Tutorial</span><span className="modal-close" onClick={() => setShowOnboarding(false)}>✕</span></div>
            <div style={{marginBottom: 20}}>
              <div style={{display:'flex', justifyContent:'center', gap: 8, marginBottom: 16}}>
                {[0,1,2,3].map(s => <div key={s} style={{height: 4, flex: 1, background: s <= onboardingStep ? '#3b82f6' : 'var(--bg-input)', borderRadius: 2}} />)}
              </div>
              
              {onboardingStep === 0 && (
                <div>
                  <h3 style={{marginBottom: 8}}>1. Get a Web3 Wallet</h3>
                  <p style={{fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16}}>To play on LitePredict, you need a Web3 wallet like MetaMask or Rabby installed in your browser.</p>
                  <button className="btn btn-primary" style={{width: '100%'}} onClick={() => setOnboardingStep(1)}>Next</button>
                </div>
              )}
              {onboardingStep === 1 && (
                <div>
                  <h3 style={{marginBottom: 8}}>2. Add LitVM Testnet</h3>
                  <p style={{fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16}}>We need to configure your wallet to talk to the LitVM Testnet.</p>
                  <button className="btn btn-secondary" style={{width: '100%', marginBottom: 8, border: '1px solid #f59e0b', color: '#f59e0b'}} onClick={addLitVMNetwork}>🦊 Add Network to Wallet</button>
                  <button className="btn btn-primary" style={{width: '100%'}} onClick={() => setOnboardingStep(2)}>Next</button>
                </div>
              )}
              {onboardingStep === 2 && (
                <div>
                  <h3 style={{marginBottom: 8}}>3. Get Testnet zkLTC</h3>
                  <p style={{fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16}}>You need zkLTC to pay for gas and make predictions. Get some for free from the faucet.</p>
                  <a href="https://liteforge.hub.caldera.xyz" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{display: 'block', textAlign: 'center', width: '100%', marginBottom: 8, textDecoration: 'none'}}>🚰 Open Faucet in New Tab</a>
                  <button className="btn btn-primary" style={{width: '100%'}} onClick={() => setOnboardingStep(3)}>Next</button>
                </div>
              )}
              {onboardingStep === 3 && (
                <div>
                  <h3 style={{marginBottom: 8}}>4. Make Predictions & Earn LPs</h3>
                  <p style={{fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16}}>Predict if LTC will go up (Bull) or down (Bear) every 5 minutes. Earn LitePoints (LPs) for your activity and climb the leaderboard!</p>
                  <button className="btn btn-primary" style={{width: '100%'}} onClick={() => { setOnboardingStep(0); setShowOnboarding(false); setActiveTab('points'); }}>Start Playing</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
