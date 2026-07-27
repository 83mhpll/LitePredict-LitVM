import React, { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

// ABI definitions
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
  "function treasuryFee() view returns (uint256)",
  "function getUserRounds(address user) view returns (uint256[])"
];

const DIA_ORACLE_ABI = [
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)"
];

const LITE_PREDICT_DEFAULT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Default local anvil deploy address
const DIA_LTC_USD_ADDRESS = "0x45dDa5d881BD2C917976CCfde74fFd6f6412da29"; // LitVM Testnet DIA LTC/USD Adapter

const LITVM_RPC_URL = "https://liteforge.rpc.caldera.xyz/http";
const LITVM_CHAIN_ID = 4441;
const LITVM_CHAIN_ID_HEX = "0x1159";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(0);
  const [contractAddress, setContractAddress] = useState(() => {
    return localStorage.getItem("lite_predict_address") || LITE_PREDICT_DEFAULT_ADDRESS;
  });
  
  // App State
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [ltcPrice, setLtcPrice] = useState(85.0);
  const [priceDirection, setPriceDirection] = useState("same");
  const [rounds, setRounds] = useState({});
  const [userBets, setUserBets] = useState({});
  const [claimableEpochs, setClaimableEpochs] = useState([]);
  const [userStats, setUserStats] = useState({ totalBets: 0, totalWagered: "0", winCount: 0 });
  const [biddingRoundTimeLeft, setBiddingRoundTimeLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  // Bet Inputs
  const [betAmounts, setBetAmounts] = useState({});
  
  // Edit Mode for Contract Address
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState(contractAddress);

  const prevPriceRef = useRef(ltcPrice);

  useEffect(() => {
    // Check if ethereum is injected
    if (window.ethereum) {
      const ethProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(ethProvider);
      
      // Listeners
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount("");
          setSigner(null);
        }
      });

      window.ethereum.on("chainChanged", (hexChainId) => {
        setChainId(parseInt(hexChainId, 16));
      });
      
      // Get initial details
      ethProvider.getSigner().then((ethSigner) => {
        setSigner(ethSigner);
        ethSigner.getAddress().then(setAccount).catch(() => {});
      }).catch(() => {});

      ethProvider.getNetwork().then((net) => {
        setChainId(Number(net.chainId));
      }).catch(() => {});
    } else {
      setErrorMsg("Please install MetaMask or another Web3 browser wallet.");
    }
  }, []);

  // Poll LTC price from DIA Oracle on LitVM (or via fallback public RPC)
  useEffect(() => {
    const fetchLtcPrice = async () => {
      try {
        let tempProvider = provider;
        if (!tempProvider) {
          tempProvider = new ethers.JsonRpcProvider(LITVM_RPC_URL);
        }
        
        const oracleContract = new ethers.Contract(DIA_LTC_USD_ADDRESS, DIA_ORACLE_ABI, tempProvider);
        const [, answer, , , ] = await oracleContract.latestRoundData();
        const price = Number(answer) / 1e18; // 18 decimal places for DIA USDC/LTC adapters
        
        if (price !== prevPriceRef.current) {
          if (price > prevPriceRef.current) setPriceDirection("up");
          else if (price < prevPriceRef.current) setPriceDirection("down");
          else setPriceDirection("same");
          
          setLtcPrice(price);
          prevPriceRef.current = price;
        }
      } catch (err) {
        console.error("Failed to fetch LTC price from DIA Oracle:", err);
      }
    };

    fetchLtcPrice();
    const interval = setInterval(fetchLtcPrice, 10000); // 10 seconds price updates
    return () => clearInterval(interval);
  }, [provider]);

  // Main Blockchain Data fetcher
  const loadData = async () => {
    if (!contractAddress || !ethers.isAddress(contractAddress)) return;
    setLoading(true);
    setErrorMsg("");
    
    try {
      let tempProvider = provider;
      if (!tempProvider) {
        tempProvider = new ethers.JsonRpcProvider(LITVM_RPC_URL);
      }

      const contract = new ethers.Contract(contractAddress, LITE_PREDICT_ABI, tempProvider);
      
      // Get current epoch
      const epochBig = await contract.currentEpoch();
      const epoch = Number(epochBig);
      setCurrentEpoch(epoch);

      // Fetch rounds data (Current Bidding, Live, and last Ended)
      const fetchedRounds = {};
      const startEpoch = epoch > 2 ? epoch - 2 : 1;
      
      for (let ep = startEpoch; ep <= epoch; ep++) {
        const roundData = await contract.rounds(ep);
        fetchedRounds[ep] = {
          epoch: Number(roundData[0]),
          startTimestamp: Number(roundData[1]),
          lockTimestamp: Number(roundData[2]),
          closeTimestamp: Number(roundData[3]),
          lockPrice: Number(roundData[4]) / 1e18,
          closePrice: Number(roundData[5]) / 1e18,
          totalAmount: ethers.formatEther(roundData[6]),
          bullAmount: ethers.formatEther(roundData[7]),
          bearAmount: ethers.formatEther(roundData[8]),
          rewardBaseCalData: ethers.formatEther(roundData[9]),
          rewardAmount: ethers.formatEther(roundData[10]),
          oracleCalled: roundData[11],
          cancelled: roundData[12]
        };
      }
      setRounds(fetchedRounds);

      // Compute bidding time left
      if (fetchedRounds[epoch]) {
        const now = Math.floor(Date.now() / 1000);
        const diff = fetchedRounds[epoch].lockTimestamp - now;
        setBiddingRoundTimeLeft(diff > 0 ? diff : 0);
      }

      // User specific details
      if (account) {
        const bets = {};
        const claimableList = [];
        let betsCount = 0;
        let totalWageredEth = 0n;
        let wonCount = 0;

        // Get past user participating epochs
        const userRounds = await contract.getUserRounds(account).catch(() => []);
        
        for (const epVal of userRounds) {
          const ep = Number(epVal);
          const betData = await contract.userBets(ep, account);
          const betAmount = betData[1];
          
          if (betAmount > 0n) {
            bets[ep] = {
              position: Number(betData[0]) === 0 ? "Bull" : "Bear",
              amount: ethers.formatEther(betAmount),
              claimed: betData[2]
            };
            betsCount++;
            totalWageredEth += betAmount;

            // Check if claimable
            if (!betData[2]) {
              const isClaimable = await contract.claimable(ep, account).catch(() => false);
              const roundDetails = await contract.rounds(ep);
              const isCancelled = roundDetails[12];
              
              if (isClaimable || (isCancelled && !betData[2])) {
                claimableList.push(ep);
                if (isClaimable) wonCount++;
              }
            } else {
              // Already claimed, count wins
              const roundDetails = await contract.rounds(ep);
              const lockP = roundDetails[4];
              const closeP = roundDetails[5];
              const pos = Number(betData[0]);
              if ((closeP > lockP && pos === 0) || (closeP < lockP && pos === 1)) {
                wonCount++;
              }
            }
          }
        }
        setUserBets(bets);
        setClaimableEpochs(claimableList);
        setUserStats({
          totalBets: betsCount,
          totalWagered: ethers.formatEther(totalWageredEth),
          winCount: wonCount
        });
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to load blockchain data. Check if contract address is deployed on LitVM Testnet.");
    } finally {
      setLoading(false);
    }
  };

  // Run loadData on load, account change, chainId change, or contract address change
  useEffect(() => {
    loadData();
  }, [account, chainId, contractAddress]);

  // Bidding Countdown clock
  useEffect(() => {
    if (biddingRoundTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setBiddingRoundTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          loadData(); // reload once expired
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [biddingRoundTimeLeft]);

  // Connect Web3 Wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("No MetaMask extension found. Please install it.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      if (provider) {
        const ethSigner = await provider.getSigner();
        setSigner(ethSigner);
        const net = await provider.getNetwork();
        setChainId(Number(net.chainId));
      }
      setErrorMsg("");
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect wallet.");
    }
  };

  // Add LitVM Network to Wallet
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: LITVM_CHAIN_ID_HEX }],
      });
    } catch (switchError) {
      // Hex chain ID not found, try to add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: LITVM_CHAIN_ID_HEX,
                chainName: "LitVM LiteForge",
                nativeCurrency: {
                  name: "zkLTC",
                  symbol: "zkLTC",
                  decimals: 18,
                },
                rpcUrls: [LITVM_RPC_URL],
                blockExplorerUrls: ["https://liteforge.explorer.caldera.xyz"],
              },
            ],
          });
        } catch (addError) {
          console.error(addError);
          setErrorMsg("Could not add LitVM Testnet network to wallet.");
        }
      } else {
        console.error(switchError);
        setErrorMsg("Failed to switch network.");
      }
    }
  };

  // Betting Actions
  const handleBet = async (epoch, position) => {
    if (!signer) {
      alert("Please connect your wallet first.");
      return;
    }
    if (chainId !== LITVM_CHAIN_ID) {
      alert("Please switch network to LitVM LiteForge Testnet first.");
      return;
    }
    
    const amountStr = betAmounts[epoch] || "";
    if (!amountStr || parseFloat(amountStr) <= 0) {
      alert("Please enter a valid zkLTC amount.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const contract = new ethers.Contract(contractAddress, LITE_PREDICT_ABI, signer);
      const parsedAmount = ethers.parseEther(amountStr);
      
      let tx;
      if (position === "Bull") {
        tx = await contract.betBull(epoch, { value: parsedAmount });
      } else {
        tx = await contract.betBear(epoch, { value: parsedAmount });
      }
      
      await tx.wait();
      setSuccessMsg(`Bet on ${position} for Round ${epoch} placed successfully!`);
      setBetAmounts(prev => ({ ...prev, [epoch]: "" }));
      loadData();
    } catch (err) {
      console.error(err);
      setErrorMsg("Transaction failed or was rejected.");
    } finally {
      setLoading(false);
    }
  };

  // Claiming Actions
  const handleClaim = async (epochsToClaim) => {
    if (!signer || epochsToClaim.length === 0) return;
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      const contract = new ethers.Contract(contractAddress, LITE_PREDICT_ABI, signer);
      const tx = await contract.claim(epochsToClaim);
      await tx.wait();
      setSuccessMsg(`Claimed rewards for round(s): ${epochsToClaim.join(", ")}!`);
      loadData();
    } catch (err) {
      console.error(err);
      setErrorMsg("Claim transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  // Keeper automation trigger (Execute Round)
  const handleExecuteRound = async () => {
    if (!signer) {
      alert("Please connect your wallet first.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      const contract = new ethers.Contract(contractAddress, LITE_PREDICT_ABI, signer);
      const tx = await contract.executeRound();
      await tx.wait();
      setSuccessMsg("Round advanced successfully!");
      loadData();
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to execute round. Verify if the execution window is active and current time has passed the close time.");
    } finally {
      setLoading(false);
    }
  };

  // Update Contract Address locally
  const saveContractAddress = () => {
    if (ethers.isAddress(addressInput)) {
      setContractAddress(addressInput);
      localStorage.setItem("lite_predict_address", addressInput);
      setIsEditingAddress(false);
      setSuccessMsg("Contract address updated!");
    } else {
      alert("Invalid Ethereum contract address.");
    }
  };

  // Helpers
  const formatTime = (seconds) => {
    if (seconds <= 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getPayoutMultiplier = (round, position) => {
    const total = parseFloat(round.totalAmount);
    const bull = parseFloat(round.bullAmount);
    const bear = parseFloat(round.bearAmount);
    if (total === 0) return "1.00x";
    
    if (position === "Bull") {
      if (bull === 0) return "1.00x";
      const val = (total * 0.98) / bull; // 2% fee estimate
      return `${val.toFixed(2)}x`;
    } else {
      if (bear === 0) return "1.00x";
      const val = (total * 0.98) / bear;
      return `${val.toFixed(2)}x`;
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-badge">LTC</div>
          <h1 className="brand-title">LitePredict</h1>
        </div>
        
        <div className="price-ticker">
          <span>LTC/USD:</span>
          <span className={`price-value ${priceDirection}`}>
            ${ltcPrice.toFixed(4)}
            {priceDirection === "up" && " ↗"}
            {priceDirection === "down" && " ↘"}
          </span>
        </div>

        <div>
          {account ? (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {chainId !== LITVM_CHAIN_ID ? (
                <button className="btn btn-primary" onClick={switchNetwork}>
                  Switch to LitVM
                </button>
              ) : (
                <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {account.substring(0, 6)}...{account.substring(account.length - 4)}
                </span>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" onClick={connectWallet}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      {errorMsg && <div style={{ background: "rgba(255,23,68,0.15)", border: "1px solid var(--bear-red)", padding: "15px", borderRadius: "10px", marginBottom: "25px", color: "#ff8a9f" }}>{errorMsg}</div>}
      {successMsg && <div style={{ background: "rgba(0,230,118,0.15)", border: "1px solid var(--bull-green)", padding: "15px", borderRadius: "10px", marginBottom: "25px", color: "#85ffd1" }}>{successMsg}</div>}

      {/* Contract Settings Controller */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "12px 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)", marginBottom: "30px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", width: "70%" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>Predict Contract:</span>
          {isEditingAddress ? (
            <div style={{ display: "flex", gap: "10px", width: "100%" }}>
              <input
                className="bet-input"
                style={{ padding: "6px 12px", fontSize: "0.9rem" }}
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
              />
              <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: "0.85rem" }} onClick={saveContractAddress}>
                Save
              </button>
            </div>
          ) : (
            <>
              <span style={{ fontFamily: "monospace", fontSize: "0.9rem", color: "var(--accent)" }}>{contractAddress}</span>
              <button className="btn btn-outline" style={{ padding: "3px 8px", fontSize: "0.75rem" }} onClick={() => { setAddressInput(contractAddress); setIsEditingAddress(true); }}>
                Edit
              </button>
            </>
          )}
        </div>
        <a href="https://testnet.litvm.com" target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: "0.85rem", padding: "6px 12px" }}>
          Get zkLTC Faucet
        </a>
      </div>

      {/* Prediction Cards Grid */}
      <div className="rounds-grid">
        {/* ROUND 1: ENDED (currentEpoch - 2) */}
        {currentEpoch > 2 && rounds[currentEpoch - 2] && (
          <div className="round-card ended-round">
            <div className="card-header">
              <span className="epoch-badge">Epoch #{currentEpoch - 2}</span>
              <div className="round-status">
                <div className="status-dot"></div>
                <span>Ended</span>
              </div>
            </div>
            
            <div className="card-content">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                <div>
                  <div className="pill-title">Bull Payout</div>
                  <div className="pill-value" style={{ color: "var(--bull-green)" }}>
                    {getPayoutMultiplier(rounds[currentEpoch - 2], "Bull")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="pill-title">Bear Payout</div>
                  <div className="pill-value" style={{ color: "var(--bear-red)" }}>
                    {getPayoutMultiplier(rounds[currentEpoch - 2], "Bear")}
                  </div>
                </div>
              </div>

              <div className="price-comparison-box">
                <div className="comp-row">
                  <span className="comp-label">Close Price:</span>
                  <span className="comp-val" style={{ color: rounds[currentEpoch - 2].closePrice > rounds[currentEpoch - 2].lockPrice ? "var(--bull-green)" : "var(--bear-red)", fontWeight: "bold" }}>
                    ${rounds[currentEpoch - 2].closePrice.toFixed(4)}
                  </span>
                </div>
                <div className="comp-row">
                  <span className="comp-label">Locked Price:</span>
                  <span className="comp-val">${rounds[currentEpoch - 2].lockPrice.toFixed(4)}</span>
                </div>
                <div className="comp-row">
                  <span className="comp-label">Total Pool:</span>
                  <span className="comp-val">{rounds[currentEpoch - 2].totalAmount} zkLTC</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ROUND 2: LIVE (currentEpoch - 1) */}
        {currentEpoch > 1 && rounds[currentEpoch - 1] && (
          <div className="round-card live-round">
            <div className="card-header">
              <span className="epoch-badge">Epoch #{currentEpoch - 1}</span>
              <div className="round-status">
                <div className="status-dot"></div>
                <span style={{ color: "var(--accent)" }}>Live</span>
              </div>
            </div>
            
            <div className="card-content">
              <div className="pool-bar-container">
                <div className="ratio-label">
                  <span>Bull Pool: {rounds[currentEpoch - 1].bullAmount} LTC</span>
                  <span>Bear Pool: {rounds[currentEpoch - 1].bearAmount} LTC</span>
                </div>
                <div className="ratio-bar">
                  <div 
                    className="bull-progress" 
                    style={{ 
                      width: `${(parseFloat(rounds[currentEpoch - 1].bullAmount) / (parseFloat(rounds[currentEpoch - 1].totalAmount) || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>

              <div className="price-comparison-box" style={{ marginTop: "15px" }}>
                <div className="comp-row">
                  <span className="comp-label">Last Oracle Price:</span>
                  <span className={`comp-val ${priceDirection}`} style={{ fontSize: "1.1rem" }}>
                    ${ltcPrice.toFixed(4)}
                  </span>
                </div>
                <div className="comp-row">
                  <span className="comp-label">Locked Price:</span>
                  <span className="comp-val">${rounds[currentEpoch - 1].lockPrice.toFixed(4)}</span>
                </div>
                <div className="comp-row">
                  <span className="comp-label">Price Diff:</span>
                  <span className="comp-val" style={{ color: ltcPrice >= rounds[currentEpoch - 1].lockPrice ? "var(--bull-green)" : "var(--bear-red)" }}>
                    {(ltcPrice - rounds[currentEpoch - 1].lockPrice) >= 0 ? "+" : ""}
                    {(ltcPrice - rounds[currentEpoch - 1].lockPrice).toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Show user position if any */}
              {userBets[currentEpoch - 1] && (
                <div style={{ marginTop: "15px", padding: "10px", background: "rgba(124, 77, 255, 0.1)", borderRadius: "8px", border: "1px solid var(--border-glow)", textAlign: "center", fontSize: "0.9rem" }}>
                  Your Position: <span className="side-indicator bull" style={{ color: userBets[currentEpoch - 1].position === "Bull" ? "var(--bull-green)" : "var(--bear-red)", background: "none" }}>{userBets[currentEpoch - 1].position}</span> ({userBets[currentEpoch - 1].amount} zkLTC)
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROUND 3: NEXT / BIDDING (currentEpoch) */}
        {currentEpoch > 0 && rounds[currentEpoch] && (
          <div className="round-card next-round" style={{ border: "1px solid rgba(0, 230, 118, 0.25)" }}>
            <div className="card-header">
              <span className="epoch-badge">Epoch #{currentEpoch}</span>
              <div className="round-status">
                <div className="status-dot"></div>
                <span style={{ color: "var(--bull-green)" }}>Bidding</span>
              </div>
            </div>
            
            <div className="card-content">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Closes Bidding in:</span>
                <span style={{ fontFamily: "monospace", fontSize: "1.2rem", fontWeight: "700", color: biddingRoundTimeLeft < 60 ? "var(--bear-red)" : "#fff" }}>
                  {formatTime(biddingRoundTimeLeft)}
                </span>
              </div>

              <div className="bet-form">
                <div className="bet-input-wrap">
                  <input
                    type="number"
                    className="bet-input"
                    placeholder="Enter bet amount"
                    value={betAmounts[currentEpoch] || ""}
                    onChange={(e) => setBetAmounts({ ...betAmounts, [currentEpoch]: e.target.value })}
                  />
                  <span className="token-suffix">zkLTC</span>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn btn-bull-bet" onClick={() => handleBet(currentEpoch, "Bull")}>
                    Enter Bull
                  </button>
                  <button className="btn btn-bear-bet" onClick={() => handleBet(currentEpoch, "Bear")}>
                    Enter Bear
                  </button>
                </div>
              </div>

              {/* Show user position if any */}
              {userBets[currentEpoch] && (
                <div style={{ marginTop: "15px", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", textAlign: "center", fontSize: "0.9rem" }}>
                  Entered: <span style={{ color: userBets[currentEpoch].position === "Bull" ? "var(--bull-green)" : "var(--bear-red)", fontWeight: "bold" }}>{userBets[currentEpoch].position}</span> ({userBets[currentEpoch].amount} zkLTC)
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Keeper Automation Helper */}
      {currentEpoch > 0 && biddingRoundTimeLeft === 0 && (
        <div className="keeper-box" style={{ marginBottom: "30px" }}>
          <div>
            <strong>Round execution due!</strong>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "4px" }}>The current bidding round time window has ended. You can trigger execution to close the round and start the next epoch.</p>
          </div>
          <button className="btn btn-primary" onClick={handleExecuteRound}>
            Execute Round
          </button>
        </div>
      )}

      {/* User Dashboard */}
      {account && (
        <div className="dashboard-card">
          <h2 className="dashboard-title">My Dashboard</h2>
          
          <div className="dashboard-stats">
            <div className="stat-item">
              <span className="pill-title">Total Bets</span>
              <span className="pill-value" style={{ fontSize: "1.6rem" }}>{userStats.totalBets}</span>
            </div>
            <div className="stat-item">
              <span className="pill-title">Total Wagered</span>
              <span className="pill-value" style={{ fontSize: "1.6rem" }}>{userStats.totalWagered} <span style={{ fontSize: "1rem" }}>zkLTC</span></span>
            </div>
            <div className="stat-item">
              <span className="pill-title">Winning Rounds</span>
              <span className="pill-value" style={{ fontSize: "1.6rem", color: "var(--bull-green)" }}>{userStats.winCount}</span>
            </div>
          </div>

          <h3 style={{ fontSize: "1.1rem", marginBottom: "15px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "10px" }}>Claimable Rewards</h3>
          
          {claimableEpochs.length > 0 ? (
            <div className="claimable-list">
              {claimableEpochs.map((ep) => (
                <div key={ep} className="claimable-item">
                  <div className="claimable-info">
                    <span className="epoch-badge">Epoch #{ep}</span>
                    <span className={`side-indicator ${userBets[ep]?.position === "Bull" ? "bull" : "bear"}`}>
                      {userBets[ep]?.position}
                    </span>
                    <span style={{ fontSize: "0.95rem" }}>Wagered: {userBets[ep]?.amount} zkLTC</span>
                  </div>
                  <button className="btn btn-primary" style={{ padding: "6px 16px", fontSize: "0.85rem" }} onClick={() => handleClaim([ep])}>
                    Claim Payout
                  </button>
                </div>
              ))}
              
              {claimableEpochs.length > 1 && (
                <button className="btn btn-primary" style={{ alignSelf: "flex-end", marginTop: "10px" }} onClick={() => handleClaim(claimableEpochs)}>
                  Claim All ({claimableEpochs.length} Rounds)
                </button>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>No claimable rewards at the moment. Place bets and win rounds to collect rewards!</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
