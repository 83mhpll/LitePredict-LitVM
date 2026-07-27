# LitePredict - Prediction Market on LitVM

LitePredict is a high-performance, trustless, and fast-paced prediction market dApp designed for **LitVM**, Litecoin's first EVM-compatible zero-knowledge rollup. 

The dApp integrates with **DIA Oracles** to fetch real-time, transparent LTC/USD price feeds to determine prediction round winners (Bull vs. Bear).

---

## Key Features

1. **LitVM Optimizations:** Low transaction fees and lightning-fast block times make frequent rounds (e.g. 5-minute epochs) highly accessible and cheap.
2. **DIA Oracle Integration:** Verifiable and decentralized price feeds protect round integrity.
3. **Decentralized Keeper System:** Permissionless round execution design. Anyone can trigger new epochs after expiry.
4. **Premium UI/UX:** A dark glassmorphic design system optimized for mobile and desktop Web3 wallets.

---

## Repository Structure

```
├── contracts/             # Smart Contracts directory (Foundry setup)
│   ├── src/
│   │   ├── LitePredict.sol       # Core prediction market contract
│   │   └── interfaces/
│   │       └── IDiaOracle.sol    # DIA Oracle interface
│   ├── test/
│   │   └── LitePredict.t.sol     # Comprehensive unit tests with Mock DIA Oracle
│   └── script/
│       ├── Deploy.s.sol          # LitVM Testnet deployment script
│       └── DeployPOC.s.sol       # Local POC deployment script
├── frontend/             # React + Vite frontend application
│   ├── src/
│   │   ├── App.jsx               # Main React interface & Web3 state
│   │   └── index.css             # Glassmorphism/neon custom design system
│   └── keeper.js                 # Local POC auto-keeper & price simulator
└── run_poc.sh            # One-click local POC launch script
```

---

## 🚀 How to Run the Local POC (Proof of Concept)

We have built a completely automated local simulator that runs Anvil (simulating the LitVM network), deploys the smart contracts, starts a local oracle price simulator + keeper, and launches the web app.

### Prerequisites
Make sure you have [Foundry](https://getfoundry.sh/) and [Node.js](https://nodejs.org/) installed.

### Launching the POC
Simply run the launch script in your terminal:
```bash
./run_poc.sh
```

This script will:
1. Start a local `anvil` node on port 8545 simulating Chain ID 4441 (LitVM Testnet).
2. Deploy the `MockDiaOracle` and the `LitePredict` contracts.
3. Start the background Auto-Keeper simulation (`frontend/keeper.js`) to auto-advance rounds and fluctuate LTC prices.
4. Launch the Vite React development server at `http://localhost:5173/`.

### Testing locally with MetaMask:
1. Open MetaMask and add a custom network:
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `4441`
   - **Symbol:** `zkLTC`
2. Import one of the pre-funded Anvil accounts. For example, private key:
   `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
3. Connect your wallet at `http://localhost:5173/` and start placing Bull/Bear bets! 
4. Watch the rounds automatically advance and prices fluctuate every 60 seconds!

---

## 🌐 Deploying to LitVM Testnet (LiteForge)

When you are ready to deploy to the live LitVM Testnet:

1. Obtain testnet `zkLTC` from the [LitVM Testnet Faucet](https://testnet.litvm.com/).
2. Run the deployment script:
   ```bash
   forge script script/Deploy.s.sol --rpc-url https://liteforge.rpc.caldera.xyz/http --broadcast --private-key YOUR_PRIVATE_KEY
   ```
3. Copy the deployed contract address from the logs.
4. On the frontend UI, click **Edit** next to the contract address field, paste your deployed address, and click **Save**.

---

## 📦 Push to GitHub

To push this repository to your GitHub account:

1. Create a new empty repository on GitHub (e.g. `LitePredict-LitVM`).
2. Run the following commands in this directory:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/LitePredict-LitVM.git
   git branch -M main
   git push -u origin main
   ```
