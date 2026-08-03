#!/bin/bash
# ─────────────────────────────────────────────
#  SportsMarket — Deploy Script
#  Run after funding your wallet from the faucet.
# ─────────────────────────────────────────────
set -e

# Load env (same .env used by deploy_litvm.sh — needs PRIVATE_KEY and DEPLOY_WALLET)
source "$(dirname "$0")/.env"

LITVM_RPC="https://liteforge.rpc.caldera.xyz/http"
EXPLORER="https://liteforge.explorer.caldera.xyz"

echo ""
echo "================================================"
echo "  SportsMarket - LitVM Testnet Deployment"
echo "================================================"
echo ""

# ─── 1. Check balance ───
BALANCE=$(cast balance $DEPLOY_WALLET --rpc-url $LITVM_RPC)
echo "  Wallet: $DEPLOY_WALLET"
echo "  Balance: $BALANCE wei"

if [ "$BALANCE" = "0" ]; then
  echo ""
  echo "  ❌ WALLET HAS NO FUNDS!"
  echo ""
  echo "  Please get testnet zkLTC from the faucet:"
  echo "  👉 https://liteforge.hub.caldera.xyz"
  echo ""
  exit 1
fi

echo "  ✅ Balance OK — proceeding with deployment..."
echo ""

# ─── 2. Deploy + seed initial markets ───
echo "  Deploying SportsMarket contract and seeding NFL markets..."
DEPLOY_OUTPUT=$(forge script script/DeploySportsMarket.s.sol \
  --rpc-url $LITVM_RPC \
  --broadcast \
  --private-key $PRIVATE_KEY \
  2>&1)

echo "$DEPLOY_OUTPUT"

# Extract contract address
CONTRACT=$(echo "$DEPLOY_OUTPUT" | grep "SportsMarket deployed:" | awk '{print $NF}')

if [ -z "$CONTRACT" ]; then
  echo "  ❌ Could not extract contract address. Check output above."
  exit 1
fi

echo ""
echo "================================================"
echo "  DEPLOYMENT COMPLETE"
echo "================================================"
echo "  Contract Address: $CONTRACT"
echo "  Explorer: $EXPLORER/address/$CONTRACT"
echo ""
echo "  NEXT STEPS:"
echo "  1. Open frontend/src/constants/sportsContract.js"
echo "  2. Set SPORTS_MARKET_ADDRESS = \"$CONTRACT\""
echo "  3. Start the oracle keeper (in a separate terminal, keep it running):"
echo "       export SPORTS_MARKET_ADDRESS=$CONTRACT"
echo "       export RESOLVER_PRIVATE_KEY=\$PRIVATE_KEY"
echo "       node keeper/sports-oracle-keeper.js"
echo "  4. cd frontend && npm run dev — check the Sports tab, it should now"
echo "     read real on-chain markets instead of demo mode."
echo "================================================"
