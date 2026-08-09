import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ethers } from "ethers";
import { LITE_PREDICT_ABI, DEFAULT_CONTRACT, LITVM_RPC } from "./constants/contract";
import { SPORTS_MARKET_ADDRESS, SPORTS_MARKET_ABI } from "./constants/sportsContract";
import { fmtTime, fmt4 } from "./utils/format";

const SPORTS_LIVE = Boolean(SPORTS_MARKET_ADDRESS);

/* ─────────────── REAL SPORT LOGOS (inline SVG) ─────────────── */
const NFLLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#013369"/>
    <path d="M8 10h16v12H8z" fill="none" stroke="#fff" strokeWidth="1.5"/>
    <path d="M10 13h12M10 16h12M10 19h12" stroke="#fff" strokeWidth="1"/>
    <path d="M16 10v12" stroke="#fff" strokeWidth="1.5"/>
    <path d="M8 16h16" stroke="#D50A0A" strokeWidth="1.5"/>
    <text x="16" y="24" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="bold" fontFamily="Arial">NFL</text>
  </svg>
);

const UFCLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#000"/>
    <text x="16" y="21" textAnchor="middle" fill="#D20A0A" fontSize="10" fontWeight="900" fontFamily="Arial, sans-serif" letterSpacing="1">UFC</text>
  </svg>
);

const ONELogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#1a1a2e"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#00d4ff" strokeWidth="2"/>
    <text x="16" y="20" textAnchor="middle" fill="#00d4ff" fontSize="8" fontWeight="bold" fontFamily="Arial">ONE</text>
  </svg>
);

const SoccerLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#065f46"/>
    <circle cx="16" cy="16" r="9" fill="#fff"/>
    <path d="M16 7l2.5 5 5.5 1-4 4 1 5.5-5-2.5-5 2.5 1-5.5-4-4 5.5-1z" fill="#065f46"/>
  </svg>
);

const BoxingLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#7c2d12"/>
    <rect x="8" y="10" width="16" height="12" rx="3" fill="#ea580c"/>
    <path d="M8 14h16M12 10v12M20 10v12" stroke="#7c2d12" strokeWidth="1"/>
  </svg>
);

const CryptoLogo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#345D9D"/>
    <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="bold" fontFamily="Arial">Ł</text>
  </svg>
);

/* ─────────────── WALLET LOGOS (inline SVG) ─────────────── */
const MetaMaskLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#E2761B"/>
    <path d="M16 6l-4 8h8l-4-8z" fill="#fff"/>
    <path d="M8 14l4 2-1 6-3-8z" fill="#C0C0C0"/>
    <path d="M24 14l-4 2 1 6 3-8z" fill="#C0C0C0"/>
    <path d="M12 22l4 4 4-4h-8z" fill="#fff"/>
  </svg>
);

const RabbyLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#8697FF"/>
    <circle cx="16" cy="14" r="6" fill="#fff"/>
    <circle cx="13" cy="13" r="1.5" fill="#8697FF"/>
    <circle cx="19" cy="13" r="1.5" fill="#8697FF"/>
    <path d="M13 18q3 3 6 0" stroke="#8697FF" strokeWidth="1.5" fill="none"/>
    <path d="M8 24c2-4 6-5 8-5s6 1 8 5" fill="#6B7CD9"/>
  </svg>
);

const CoinbaseLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#0052FF"/>
    <circle cx="16" cy="16" r="6" fill="#fff"/>
    <path d="M16 12a4 4 0 100 8 4 4 0 000-8z" fill="#0052FF"/>
  </svg>
);

const UniswapLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#FF007A"/>
    <path d="M16 8c-2 2-4 4-4 7 0 3 2 5 4 7 2-2 4-4 4-7 0-3-2-5-4-7z" fill="#fff"/>
    <circle cx="16" cy="15" r="2" fill="#FF007A"/>
  </svg>
);

const PhantomLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#AB9FF2"/>
    <path d="M16 8c-4 0-7 3-7 7 0 3 2 5 4 6v-2c0-1 1-2 2-2h2c1 0 2 1 2 2v2c2-1 4-3 4-6 0-4-3-7-7-7z" fill="#fff"/>
  </svg>
);

const TrustLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#3375BB"/>
    <path d="M16 8l-6 3v6c0 5 6 7 6 7s6-2 6-7v-6l-6-3z" fill="#fff"/>
    <path d="M14 17l2 2 4-4" stroke="#3375BB" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const WalletConnectLogo = () => (
  <svg viewBox="0 0 32 32" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="8" fill="#3B99FC"/>
    <path d="M10 14c4-3 8-3 12 0" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M12 17c3-2 5-2 8 0" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    <path d="M14 20c2-1 2-1 4 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/* ─────────────── DEMO SPORTS DATA (expanded) ─────────────── */
const DEMO_SPORTS_GAMES = [
  { id: "hof-2026", tag: "NFL", date: "Aug 7", home: { name: "Cardinals", abbr: "ARI", prob: 47.8 }, away: { name: "Panthers", abbr: "CAR", prob: 52.2 } },
  { id: "pre1-detcin-2026", tag: "NFL", date: "Aug 14", home: { name: "Bengals", abbr: "CIN", prob: 50 }, away: { name: "Lions", abbr: "DET", prob: 50 } },
  { id: "pre1-indne-2026", tag: "NFL", date: "Aug 15", home: { name: "Patriots", abbr: "NE", prob: 52 }, away: { name: "Colts", abbr: "IND", prob: 48 } },
  { id: "ufc-305", tag: "UFC", date: "Aug 9", home: { name: "Mateusz Gamrot", abbr: "GAM", prob: 55 }, away: { name: "Quillan Salkilld", abbr: "SAL", prob: 45 } },
  { id: "ufc-306", tag: "UFC", date: "Aug 9", home: { name: "Darren Elkins", abbr: "ELK", prob: 48 }, away: { name: "Yadier Delvalle", abbr: "DEL", prob: 52 } },
  { id: "one-sam2", tag: "ONE Championship", date: "Aug 8", home: { name: "Masaaki Noiri", abbr: "NOI", prob: 51 }, away: { name: "Mengyang Liu", abbr: "LIU", prob: 49 } },
  { id: "ucl-final", tag: "Soccer", date: "Aug 12", home: { name: "Real Madrid", abbr: "RMA", prob: 48 }, away: { name: "Man City", abbr: "MCI", prob: 52 } },
  { id: "boxing-heavy", tag: "Boxing", date: "Aug 20", home: { name: "Oleksandr Usyk", abbr: "USY", prob: 53 }, away: { name: "Tyson Fury", abbr: "FUR", prob: 47 } },
];

/* ─────────────── HELPERS ─────────────── */
function sportMeta(title = "") {
  const t = title.toUpperCase();
  if (t.includes("UFC")) return { tag: "UFC", icon: <UFCLogo /> };
  if (t.includes("ONE ") || t.includes("ONE CHAMPIONSHIP")) return { tag: "ONE Championship", icon: <ONELogo /> };
  if (t.includes("UCL") || t.includes("CHAMPIONS LEAGUE") || t.includes("SOCCER")) return { tag: "Soccer", icon: <SoccerLogo /> };
  if (t.includes("BOXING")) return { tag: "Boxing", icon: <BoxingLogo /> };
  return { tag: "NFL", icon: <NFLLogo /> };
}

const SPORTS_BETS_KEY = "lp_sports_demo_bets";
const CHAT_KEY = "lp_market_chat";

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
          outcome: Number(m.outcome),
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
    const tx = await contract.bet(marketId, side, { value });
    await tx.wait();
    await fetchMarkets();
  }, [fetchMarkets]);

  return { markets, loading, placeBet, refetch: fetchMarkets };
}

/* ─────────────── WALLET DETECTION ─────────────── */
function detectWallets() {
  const wallets = [];
  const eth = window.ethereum;
  if (!eth) return wallets;

  // EIP-6963 wallet discovery
  if (eth.providers?.length) {
    eth.providers.forEach((p, i) => {
      if (p.isMetaMask && !p.isRabby) wallets.push({ id: "metamask", name: "MetaMask", provider: p, icon: <MetaMaskLogo /> });
      else if (p.isRabby) wallets.push({ id: "rabby", name: "Rabby", provider: p, icon: <RabbyLogo /> });
      else if (p.isCoinbaseWallet) wallets.push({ id: "coinbase", name: "Coinbase Wallet", provider: p, icon: <CoinbaseLogo /> });
      else if (p.isPhantom) wallets.push({ id: "phantom", name: "Phantom", provider: p, icon: <PhantomLogo /> });
      else if (p.isTrust) wallets.push({ id: "trust", name: "Trust Wallet", provider: p, icon: <TrustLogo /> });
    });
  }

  // Standard detection
  if (eth.isMetaMask && !eth.isRabby && !wallets.find(w => w.id === "metamask")) {
    wallets.unshift({ id: "metamask", name: "MetaMask", provider: eth, icon: <MetaMaskLogo /> });
  }
  if (eth.isRabby && !wallets.find(w => w.id === "rabby")) {
    wallets.unshift({ id: "rabby", name: "Rabby", provider: eth, icon: <RabbyLogo /> });
  }
  if (eth.isCoinbaseWallet && !wallets.find(w => w.id === "coinbase")) {
    wallets.push({ id: "coinbase", name: "Coinbase Wallet", provider: eth, icon: <CoinbaseLogo /> });
  }
  if (eth.isPhantom && !wallets.find(w => w.id === "phantom")) {
    wallets.push({ id: "phantom", name: "Phantom", provider: eth, icon: <PhantomLogo /> });
  }
  if (eth.isTrust && !wallets.find(w => w.id === "trust")) {
    wallets.push({ id: "trust", name: "Trust Wallet", provider: eth, icon: <TrustLogo /> });
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = [];
  for (const w of wallets) {
    if (!seen.has(w.id)) { seen.add(w.id); unique.push(w); }
  }

  // Always add WalletConnect as fallback
  unique.push({ id: "walletconnect", name: "WalletConnect", provider: null, icon: <WalletConnectLogo /> });

  return unique;
}

/* ─────────────── CHAT HOOK ─────────────── */
function useMarketChat(marketKey) {
  const [messages, setMessages] = useState(() => {
    try {
      const all = JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
      return all[marketKey] || [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
      setMessages(all[marketKey] || []);
    } catch { setMessages([]); }
  }, [marketKey]);

  const post = useCallback((text, sender = "anon") => {
    if (!text.trim()) return;
    const msg = { id: Date.now(), text: text.trim(), sender, time: Date.now() };
    setMessages(prev => {
      const next = [...prev, msg];
      try {
        const all = JSON.parse(localStorage.getItem(CHAT_KEY)) || {};
        all[marketKey] = next;
        localStorage.setItem(CHAT_KEY, JSON.stringify(all));
      } catch {}
      return next;
    });
  }, [marketKey]);

  return { messages, post };
}

/* ─────────────── MAIN COMPONENT ─────────────── */
export default function SimplePredict({ onSwitchToClassic }) {
  const [theme, setTheme] = useState("dark");
  const [category, setCategory] = useState("crypto");
  const [sportFilter, setSportFilter] = useState("All");

  const [account, setAccount] = useState("");
  const [currentEpoch, setCurrentEpoch] = useState(null);
  const [round, setRound] = useState(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [toast, setToast] = useState("");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [availableWallets, setAvailableWallets] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMarket, setChatMarket] = useState("");
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef(null);

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

  const openWalletModal = () => {
    if (!window.ethereum) {
      setToast("No wallet found — install MetaMask, Rabby, or another wallet to connect.");
      return;
    }
    const wallets = detectWallets();
    if (wallets.length === 0) {
      setToast("No compatible wallets detected. Install MetaMask or Rabby.");
      return;
    }
    setAvailableWallets(wallets);
    setWalletModalOpen(true);
  };

  const connectWallet = async (wallet) => {
    try {
      let provider;
      if (wallet.id === "walletconnect") {
        setToast("WalletConnect integration coming soon — please use an injected wallet for now.");
        setWalletModalOpen(false);
        return;
      }
      if (wallet.provider) {
        provider = new ethers.BrowserProvider(wallet.provider);
      } else {
        provider = new ethers.BrowserProvider(window.ethereum);
      }
      const accs = await provider.send("eth_requestAccounts", []);
      setAccount(accs[0]);
      setWalletModalOpen(false);
    } catch (e) {
      setToast("Wallet connection was rejected or failed.");
    }
  };

  const secondsLeft = round ? Math.max(0, round.lockTimestamp - now) : 0;
  const bullPct = round && parseFloat(round.totalAmount) > 0
    ? (parseFloat(round.bullAmount) / parseFloat(round.totalAmount)) * 100
    : 50;
  const bearPct = 100 - bullPct;

  const [slip, setSlip] = useState({});

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
    if (!account) { openWalletModal(); return; }
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
    setTimeout(() => {
      setSlip(prev => {
        const next = {};
        for (const [k, v] of Object.entries(prev)) if (v.status !== "success") next[k] = v;
        return next;
      });
    }, 1500);
  };

  // Filter sports by category
  const allSports = useMemo(() => {
    if (SPORTS_LIVE) {
      return onChainSports.markets.map(m => {
        const meta = sportMeta(m.title);
        return { ...m, ...meta, key: `sports-${m.marketId}`, kind: "sports-onchain" };
      });
    }
    return DEMO_SPORTS_GAMES.map(g => {
      const meta = sportMeta(g.tag);
      const title = `${g.away.name} @ ${g.home.name}`;
      return { ...g, ...meta, title, key: `sports-demo-${g.id}`, kind: "sports-demo", leftLabel: g.away.name, rightLabel: g.home.name, leftPct: g.away.prob, rightPct: g.home.prob };
    });
  }, [onChainSports.markets]);

  const filteredSports = useMemo(() => {
    if (sportFilter === "All") return allSports;
    return allSports.filter(s => s.tag === sportFilter);
  }, [allSports, sportFilter]);

  const sportCategories = ["All", "NFL", "UFC", "ONE Championship", "Soccer", "Boxing"];

  // Chat for currently selected slip item
  const activeSlipKey = slipItems.length > 0 ? slipItems[0][0] : "";
  const activeSlipItem = slip[activeSlipKey];
  const chatKey = activeSlipItem ? `${activeSlipItem.title}-${activeSlipItem.sideLabel}` : "general";
  const { messages: chatMessages, post: postChat } = useMarketChat(chatKey);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    postChat(chatInput, account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "anon");
    setChatInput("");
  };

  return (
    <div data-theme={theme} className="mp-root">
      <style>{STYLES}</style>

      {/* ─── NAV ─── */}
      <div className="mp-nav">
        <div className="mp-logo"><div className="mp-logo-mark">LP</div>LitePredict</div>
        <div className="mp-nav-right">
          <button className="mp-link" onClick={onSwitchToClassic}>Classic view</button>
          <div className="mp-toggle" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}>
            <div className="mp-toggle-knob" />
          </div>
          {account
            ? <span className="mp-account">{account.slice(0,6)}…{account.slice(-4)}</span>
            : <button className="mp-wallet-btn" onClick={openWalletModal}>Connect wallet</button>}
        </div>
      </div>

      {/* ─── CATEGORY TABS ─── */}
      <div className="mp-cats">
        <button className={`mp-cat ${category === "crypto" ? "active" : ""}`} onClick={() => setCategory("crypto")}>Crypto</button>
        <button className={`mp-cat ${category === "sports" ? "active" : ""}`} onClick={() => setCategory("sports")}>Sports</button>
      </div>

      {/* ─── SPORTS SUB-FILTERS ─── */}
      {category === "sports" && (
        <div className="mp-subcats">
          {sportCategories.map(cat => (
            <button
              key={cat}
              className={`mp-subcat ${sportFilter === cat ? "active" : ""}`}
              onClick={() => setSportFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {toast && <div className="mp-toast">{toast}</div>}

      {/* ─── WALLET MODAL ─── */}
      {walletModalOpen && (
        <div className="mp-modal-overlay" onClick={() => setWalletModalOpen(false)}>
          <div className="mp-modal" onClick={e => e.stopPropagation()}>
            <div className="mp-modal-head">
              <h3>Connect Wallet</h3>
              <button className="mp-modal-close" onClick={() => setWalletModalOpen(false)}>✕</button>
            </div>
            <p className="mp-modal-sub">Select your preferred wallet to connect to LitePredict</p>
            <div className="mp-wallet-list">
              {availableWallets.map(w => (
                <button key={w.id} className="mp-wallet-option" onClick={() => connectWallet(w)}>
                  <span className="mp-wallet-icon">{w.icon}</span>
                  <span className="mp-wallet-name">{w.name}</span>
                  {w.id === "metamask" && <span className="mp-wallet-badge">Popular</span>}
                </button>
              ))}
            </div>
            <p className="mp-modal-footer">New to crypto? <a href="https://metamask.io" target="_blank" rel="noreferrer">Get MetaMask</a></p>
          </div>
        </div>
      )}

      {/* ─── MAIN LAYOUT ─── */}
      <div className="mp-layout">
        <div className="mp-list">
          {category === "crypto" && (
            <MarketRow
              icon={<CryptoLogo />}
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
              {SPORTS_LIVE && !onChainSports.loading && filteredSports.length === 0 && (
                <p className="mp-note">No sports markets in this category.</p>
              )}

              {filteredSports.map(s => {
                if (SPORTS_LIVE) {
                  const meta = sportMeta(s.title);
                  const key = `sports-${s.marketId}`;
                  return (
                    <MarketRow
                      key={key}
                      icon={meta.icon}
                      tag={meta.tag}
                      title={s.title}
                      sub={s.outcome === 0 ? `Closes ${new Date(s.closeTime * 1000).toLocaleDateString()}` : "Resolved"}
                      live={s.outcome === 0}
                      leftLabel={s.awayTeam} leftPct={s.awayPct}
                      rightLabel={s.homeTeam} rightPct={s.homePct}
                      disabled={s.outcome !== 0}
                      selectedSide={slip[key]?.sideKey}
                      onSelect={(sideKey, sideLabel, percent) => toggleSlip(key, {
                        kind: "sports-onchain", marketId: s.marketId, title: s.title, sideKey, sideLabel, percent,
                      })}
                    />
                  );
                } else {
                  const key = s.key;
                  return (
                    <MarketRow
                      key={key}
                      icon={s.icon}
                      tag={s.tag}
                      title={s.title}
                      sub={s.date}
                      live
                      leftLabel={s.leftLabel} leftPct={s.leftPct}
                      rightLabel={s.rightLabel} rightPct={s.rightPct}
                      selectedSide={slip[key]?.sideKey}
                      onSelect={(sideKey, sideLabel, percent) => toggleSlip(key, {
                        kind: "sports-demo", gameId: s.id, title: s.title, sideKey, sideLabel, percent,
                      })}
                    />
                  );
                }
              })}
            </>
          )}
        </div>

        {/* ─── BET SLIP + CHAT ─── */}
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

          {/* ─── CHAT PANEL ─── */}
          {slipItems.length > 0 && (
            <div className="mp-chat-section">
              <button className="mp-chat-toggle" onClick={() => setChatOpen(c => !c)}>
                💬 Chat about this bet {chatOpen ? "▲" : "▼"}
              </button>
              {chatOpen && (
                <div className="mp-chat-box">
                  <div className="mp-chat-messages">
                    {chatMessages.length === 0 && (
                      <p className="mp-chat-empty">No messages yet. Be the first to talk about this pick!</p>
                    )}
                    {chatMessages.map(m => (
                      <div key={m.id} className="mp-chat-msg">
                        <span className="mp-chat-sender">{m.sender}</span>
                        <span className="mp-chat-time">{new Date(m.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <p className="mp-chat-text">{m.text}</p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form className="mp-chat-form" onSubmit={handleChatSubmit}>
                    <input
                      className="mp-chat-input"
                      placeholder="Say something about this bet..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                    />
                    <button type="submit" className="mp-chat-send">Send</button>
                  </form>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─────────────── MARKET ROW ─────────────── */
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

/* ─────────────── STYLES ─────────────── */
const STYLES = `
html, body, #root {
  overflow: auto !important;
  height: auto !important;
  min-height: 100vh !important;
}
.mp-root{
  --bg:#0b0e14; --bg-alt:#151922; --bg-alt2:#1b212c; --bg-alt3:#0f131a; --border:#242a36;
  --text:#f4f5f7; --text-2:#9aa1ae; --text-3:#5b6270;
  --blue:#3b6bff; --green:#22c55e; --green-dim:#10241a;
  --red:#f2495c; --red-dim:#2a1418;
  background:var(--bg); color:var(--text); min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,sans-serif;
}
.mp-root[data-theme="light"]{
  --bg:#ffffff; --bg-alt:#f7f8fa; --bg-alt2:#eef0f3; --bg-alt3:#f0f2f5; --border:#e5e7eb;
  --text:#0b0e14; --text-2:#6b7280; --text-3:#9ca3af;
  --blue:#1652f0; --green:#059669; --green-dim:#ecfdf5;
  --red:#dc2626; --red-dim:#fef2f2;
}

/* Nav */
.mp-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);}
.mp-logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;}
.mp-logo-mark{width:22px;height:22px;border-radius:6px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;}
.mp-nav-right{display:flex;align-items:center;gap:12px;}
.mp-link{background:none;border:none;color:var(--text-2);font-size:13px;cursor:pointer;text-decoration:underline;}
.mp-toggle{width:44px;height:24px;border-radius:20px;background:var(--bg-alt);border:1px solid var(--border);position:relative;cursor:pointer;flex-shrink:0;}
.mp-toggle-knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--text);transition:transform .15s;}
.mp-root[data-theme="light"] .mp-toggle-knob{transform:translateX(20px);}
.mp-wallet-btn{background:var(--blue);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;}
.mp-account{font-size:12px;color:var(--text-2);font-family:monospace;background:var(--bg-alt);padding:4px 10px;border-radius:6px;border:1px solid var(--border);}

/* Category tabs */
.mp-cats{display:flex;gap:8px;padding:16px 24px 0;}
.mp-cat{border:1px solid var(--border);background:transparent;color:var(--text-2);font-size:13px;font-weight:600;padding:7px 14px;border-radius:20px;cursor:pointer;}
.mp-cat.active{background:var(--text);color:var(--bg);border-color:var(--text);}

/* Sub-category filters */
.mp-subcats{display:flex;gap:6px;padding:12px 24px 0;flex-wrap:wrap;}
.mp-subcat{border:1px solid var(--border);background:var(--bg-alt2);color:var(--text-2);font-size:11px;font-weight:600;padding:5px 12px;border-radius:16px;cursor:pointer;}
.mp-subcat.active{background:var(--blue);color:#fff;border-color:var(--blue);}

/* Toast */
.mp-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);max-width:600px;width:calc(100% - 40px);padding:12px 18px;background:var(--red-dim);color:var(--red);border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);z-index:1000;border:1px solid var(--red);}

/* Demo banner */
.mp-demo-banner{padding:10px 16px;background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--text-2);margin-bottom:12px;}
.mp-note{font-size:12px;color:var(--text-3);}

/* Layout */
.mp-layout{display:grid;grid-template-columns:1fr 340px;gap:20px;padding:20px 24px 60px;max-width:1200px;margin:0 auto;align-items:start;}
@media (max-width:900px){.mp-layout{grid-template-columns:1fr;}}

/* Market rows */
.mp-list{display:flex;flex-direction:column;gap:10px;}
.mp-row{display:flex;align-items:center;gap:14px;background:var(--bg-alt);border:1px solid var(--border);border-radius:12px;padding:14px 16px;transition:background .15s;}
.mp-row:hover{background:var(--bg-alt2);}
.mp-row.disabled{opacity:.5;}
.mp-row-icon{width:36px;height:36px;border-radius:50%;background:var(--bg-alt2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;overflow:hidden;}
.mp-row-icon svg{width:28px;height:28px;}
.mp-row-main{flex:1;min-width:0;}
.mp-row-tagline{display:flex;align-items:center;gap:8px;margin-bottom:3px;}
.mp-row-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);}
.mp-row-live{font-size:10px;font-weight:700;color:var(--green);}
.mp-row-title{font-size:14px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mp-row-sub{font-size:11px;color:var(--text-3);margin:2px 0 0;}
.mp-row-pills{display:flex;gap:8px;flex-shrink:0;}
.mp-pill{border:1px solid var(--border);background:var(--bg-alt2);border-radius:20px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-2);white-space:nowrap;transition:all .15s;}
.mp-pill b{margin-left:4px;}
.mp-pill.pill-a{color:var(--green);}
.mp-pill.pill-b{color:var(--red);}
.mp-pill.pill-a.selected{background:var(--green);color:#fff;border-color:var(--green);}
.mp-pill.pill-b.selected{background:var(--red);color:#fff;border-color:var(--red);}
.mp-pill:hover{transform:translateY(-1px);}
.mp-pill:disabled{opacity:.4;cursor:not-allowed;transform:none;}

/* Bet Slip */
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
.mp-slip-remove:hover{color:var(--red);}
.mp-slip-amount{width:100%;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;}
.mp-slip-amount:focus{outline:none;border-color:var(--blue);}
.mp-slip-status{font-size:11px;margin:6px 0 0;font-weight:600;}
.mp-slip-status.pending{color:var(--text-2);}
.mp-slip-status.success{color:var(--green);}
.mp-slip-status.error{color:var(--red);}
.mp-slip-total{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-2);margin:14px 0 10px;padding-top:12px;border-top:1px solid var(--border);}
.mp-slip-total b{color:var(--text);font-size:14px;}
.mp-slip-submit{width:100%;background:var(--blue);color:#fff;border:none;border-radius:10px;padding:12px 0;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s;}
.mp-slip-submit:hover{opacity:.9;}
.mp-slip-submit:disabled{opacity:.5;cursor:not-allowed;}

/* Wallet Modal */
.mp-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;}
.mp-modal{background:var(--bg-alt);border:1px solid var(--border);border-radius:16px;padding:24px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.5);}
.mp-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;}
.mp-modal-head h3{margin:0;font-size:16px;}
.mp-modal-close{background:none;border:none;color:var(--text-3);font-size:16px;cursor:pointer;padding:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;}
.mp-modal-close:hover{background:var(--bg-alt2);color:var(--text);}
.mp-modal-sub{font-size:12px;color:var(--text-2);margin:0 0 16px;}
.mp-wallet-list{display:flex;flex-direction:column;gap:8px;}
.mp-wallet-option{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);background:var(--bg);border-radius:10px;cursor:pointer;transition:all .15s;width:100%;}
.mp-wallet-option:hover{background:var(--bg-alt2);border-color:var(--blue);transform:translateY(-1px);}
.mp-wallet-icon{width:24px;height:24px;flex-shrink:0;}
.mp-wallet-name{font-size:13px;font-weight:600;color:var(--text);}
.mp-wallet-badge{font-size:10px;font-weight:700;background:var(--green-dim);color:var(--green);padding:2px 8px;border-radius:20px;margin-left:auto;}
.mp-modal-footer{font-size:11px;color:var(--text-3);text-align:center;margin:16px 0 0;}
.mp-modal-footer a{color:var(--blue);text-decoration:none;}

/* Chat */
.mp-chat-section{margin-top:16px;padding-top:16px;border-top:1px solid var(--border);}
.mp-chat-toggle{width:100%;background:var(--bg-alt2);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;color:var(--text-2);cursor:pointer;display:flex;align-items:center;justify-content:space-between;}
.mp-chat-toggle:hover{background:var(--bg-alt3);}
.mp-chat-box{margin-top:8px;background:var(--bg-alt3);border:1px solid var(--border);border-radius:10px;padding:10px;}
.mp-chat-messages{max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}
.mp-chat-empty{font-size:11px;color:var(--text-3);text-align:center;padding:8px;}
.mp-chat-msg{background:var(--bg-alt);border:1px solid var(--border);border-radius:8px;padding:8px 10px;}
.mp-chat-sender{font-size:10px;font-weight:700;color:var(--blue);}
.mp-chat-time{font-size:9px;color:var(--text-3);margin-left:6px;}
.mp-chat-text{font-size:12px;color:var(--text);margin:4px 0 0;line-height:1.4;}
.mp-chat-form{display:flex;gap:6px;}
.mp-chat-input{flex:1;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;padding:6px 10px;font-size:12px;font-family:inherit;}
.mp-chat-input:focus{outline:none;border-color:var(--blue);}
.mp-chat-send{background:var(--blue);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;}
`;
