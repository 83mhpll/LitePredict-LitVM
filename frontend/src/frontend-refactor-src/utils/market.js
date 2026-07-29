import { randomBetween } from "./format";

/* ── Orderbook Generator ── */
export const generateOrderbook = (midPrice) => {
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
export const genCandles = (basePrice = 85) => {
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
export const calcRoundScore = (round) => {
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
