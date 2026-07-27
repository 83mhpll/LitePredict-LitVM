#!/bin/bash
# ─────────────────────────────────────────────
#  LitePredict Keeper Bot — LitVM Testnet
#  ทำงานอัตโนมัติทุก 30 วินาที:
#    - ล็อค Genesis Round
#    - Execute round เมื่อถึงเวลา
#    - เริ่ม round ใหม่
# ─────────────────────────────────────────────
set -e

source "$(dirname "$0")/.env"

LITVM_RPC="https://liteforge.rpc.caldera.xyz/http"
CONTRACT="${CONTRACT_ADDRESS:-}"

if [ -z "$CONTRACT" ]; then
  echo "❌ CONTRACT_ADDRESS not set in .env — run deploy_litvm.sh first"
  exit 1
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  LitePredict Keeper Bot — LitVM Testnet  ║"
echo "╚══════════════════════════════════════════╝"
echo "  Contract: $CONTRACT"
echo "  Wallet:   $DEPLOY_WALLET"
echo "  Polling every 30 seconds..."
echo ""

call_contract() {
  local fn="$1"
  echo "  ➤ Calling $fn..."
  cast send $CONTRACT "$fn()" \
    --private-key $PRIVATE_KEY \
    --rpc-url $LITVM_RPC \
    2>&1 | grep -E "transactionHash|blockNumber|Error" || true
}

while true; do
  TIMESTAMP=$(date '+%H:%M:%S')
  
  # Get current state
  EPOCH=$(cast call $CONTRACT "currentEpoch()(uint256)" --rpc-url $LITVM_RPC 2>/dev/null || echo "0")
  GENESIS_START=$(cast call $CONTRACT "genesisStartOnce()(bool)" --rpc-url $LITVM_RPC 2>/dev/null || echo "false")
  GENESIS_LOCK=$(cast call $CONTRACT "genesisLockOnce()(bool)" --rpc-url $LITVM_RPC 2>/dev/null || echo "false")
  
  echo "[$TIMESTAMP] Epoch: $EPOCH | genesisStart: $GENESIS_START | genesisLock: $GENESIS_LOCK"
  
  # Try genesisLockRound if needed
  if [ "$GENESIS_START" = "true" ] && [ "$GENESIS_LOCK" = "false" ]; then
    echo "[$TIMESTAMP]  Attempting genesisLockRound..."
    cast send $CONTRACT "genesisLockRound()" \
      --private-key $PRIVATE_KEY \
      --rpc-url $LITVM_RPC \
      2>&1 | grep -E "transactionHash|error|Error" | head -3 || true
  fi
  
  # Try executeRound
  if [ "$GENESIS_LOCK" = "true" ] && [ "$EPOCH" -gt "1" ] 2>/dev/null; then
    echo "[$TIMESTAMP]  Attempting executeRound..."
    cast send $CONTRACT "executeRound()" \
      --private-key $PRIVATE_KEY \
      --rpc-url $LITVM_RPC \
      2>&1 | grep -E "transactionHash|error|Error" | head -3 || true
  fi
  
  sleep 30
done
