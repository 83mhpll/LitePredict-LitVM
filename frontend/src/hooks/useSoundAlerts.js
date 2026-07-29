import { useCallback } from "react";

/* ── Hooks ── */
export const useSoundAlerts = (soundEnabled) => {
  const playSound = useCallback((type) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'new') {
        osc.frequency.value = 880; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.15); osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'lock') {
        osc.frequency.value = 440; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.2); osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'end') {
        osc.frequency.value = 220; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); osc.stop(ctx.currentTime + 0.3);
      } else if (type === 'win') {
        osc.frequency.value = 660; osc.start();
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2); gain2.connect(ctx.destination);
          osc2.frequency.value = 880;
          osc2.start(); gain2.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3); osc2.stop(ctx.currentTime + 0.3);
        }, 100);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1); osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) {
      console.warn("Sound error", e);
    }
  }, [soundEnabled]);
  return playSound;
};
