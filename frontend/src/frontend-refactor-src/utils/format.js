/* ── Formatting Helpers ── */
export const fmt4 = (n) => Number(n).toFixed(4);

export const fmtTime = (s) => {
  if (s <= 0) return "00:00";
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};

export const shortAddr = (a) => a ? `${a.slice(0,5)}…${a.slice(-4)}` : "";

export const randomBetween = (a, b) => a + Math.random() * (b - a);
