import express from "express";
import { CONFIG } from "./config";

interface HealthState {
  status:        "ok" | "degraded" | "error";
  uptime:        number;
  lastPollAt:    string;
  lastTxAt:      string | null;
  currentEpoch:  number;
  genesisReady:  boolean;
  errors:        string[];
  walletBalance: string;
}

const state: HealthState = {
  status:        "ok",
  uptime:        0,
  lastPollAt:    "",
  lastTxAt:      null,
  currentEpoch:  0,
  genesisReady:  false,
  errors:        [],
  walletBalance: "0",
};

const startTime = Date.now();

export function updateHealth(patch: Partial<HealthState>): void {
  Object.assign(state, patch);
  state.uptime = Math.floor((Date.now() - startTime) / 1000);
}

export function startHealthServer(): void {
  const app = express();

  app.get("/health", (_req, res) => {
    const s = { ...state, uptime: Math.floor((Date.now() - startTime) / 1000) };
    const httpStatus = s.status === "ok" ? 200 : s.status === "degraded" ? 200 : 503;
    res.status(httpStatus).json(s);
  });

  app.get("/", (_req, res) => {
    res.redirect("/health");
  });

  app.listen(CONFIG.healthPort, () => {
    console.log(`[Health] HTTP server running on port ${CONFIG.healthPort}`);
    console.log(`[Health] Check: http://localhost:${CONFIG.healthPort}/health`);
  });
}
