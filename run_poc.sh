#!/bin/bash

# Exit on any error
set -e

echo "============================================="
echo "   LitePredict Local POC Launch Script       "
echo "============================================="

# Clean up existing anvil processes
echo "Cleaning up old processes..."
pkill -f "anvil --chain-id 4441" || true
pkill -f "node keeper.js" || true

# Start Anvil in background simulating LitVM Testnet (Chain ID 4441)
echo "Starting local Anvil node on port 8545 (simulating Chain ID 4441)..."
anvil --chain-id 4441 --port 8545 > anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for Anvil to spin up
sleep 3

# Deploy contracts
echo "Deploying Smart Contracts to local node..."
forge script script/DeployPOC.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Start the Auto-Keeper in the background to advance rounds and simulate price feeds
echo "Starting Auto-Keeper simulation script..."
node frontend/keeper.js > keeper.log 2>&1 &
KEEPER_PID=$!

echo "============================================="
echo "  POC Setup Complete & Running in Background!"
echo "============================================="
echo "Anvil PID: $ANVIL_PID"
echo "Keeper PID: $KEEPER_PID"
echo ""
echo "To view Anvil logs: tail -f anvil.log"
echo "To view Keeper logs: tail -f keeper.log"
echo ""
echo "Now launching Frontend development server..."
echo "Open http://localhost:5173/ in your browser"
echo "============================================="

# Start Vite React frontend
cd frontend
npm run dev
