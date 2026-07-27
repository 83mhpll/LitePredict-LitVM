#!/bin/bash
# ─────────────────────────────────────────────
#  LitePredict — Auto Deploy + Keeper Script
#  รันหลังจากเติม faucet แล้วเท่านั้น
# ─────────────────────────────────────────────
set -e

# Load env
source "$(dirname "$0")/.env"

LITVM_RPC="https://liteforge.rpc.caldera.xyz/http"
EXPLORER="https://liteforge.explorer.caldera.xyz"

echo ""
echo "================================================"
echo "  LitePredict - LitVM Testnet Deployment"  
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
  echo "  Wallet address to fund:"
  echo "  $DEPLOY_WALLET"
  echo ""
  exit 1
fi

echo "  ✅ Balance OK — proceeding with deployment..."
echo ""

# ─── 2. Deploy ───
echo "  Deploying LitePredict contract..."
DEPLOY_OUTPUT=$(forge script script/DeployLitVM.s.sol \
  --rpc-url $LITVM_RPC \
  --broadcast \
  --private-key $PRIVATE_KEY \
  2>&1)

echo "$DEPLOY_OUTPUT"

# Extract contract address
CONTRACT=$(echo "$DEPLOY_OUTPUT" | grep "LitePredict deployed:" | awk '{print $NF}')

if [ -z "$CONTRACT" ]; then
  echo "  ❌ Could not extract contract address. Check output above."
  exit 1
fi

echo ""
echo "================================================"
echo "  ✅ CONTRACT DEPLOYED!"
echo "  Address: $CONTRACT"
echo "  Explorer: $EXPLORER/address/$CONTRACT"
echo "================================================"
echo ""

# ─── 3. Update frontend ───
echo "  Updating frontend contract address..."
sed -i '' "s|const DEFAULT_CONTRACT = \".*\"|const DEFAULT_CONTRACT = \"$CONTRACT\"|" frontend/src/App.jsx
echo "  ✅ frontend/src/App.jsx updated → $CONTRACT"

# ─── 4. Save to .env ───
if grep -q "CONTRACT_ADDRESS" .env; then
  sed -i '' "s|# CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT|" .env
  sed -i '' "s|CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT|" .env
else
  echo "CONTRACT_ADDRESS=$CONTRACT" >> .env
fi

echo ""
echo "================================================"
echo "  NEXT: Start the keeper bot"
echo "  Run: bash keeper_litvm.sh"
echo "================================================"
echo ""
