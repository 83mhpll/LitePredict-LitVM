import TelegramBot from "node-telegram-bot-api";
import { CONFIG } from "./config";

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!CONFIG.telegramToken || !CONFIG.telegramChatId) return null;
  if (!bot) bot = new TelegramBot(CONFIG.telegramToken, { polling: false });
  return bot;
}

export async function sendAlert(message: string, level: "info" | "warn" | "error" = "info"): Promise<void> {
  const emoji = { info: "ℹ️", warn: "⚠️", error: "🚨" }[level];
  const text = `${emoji} *LitePredict Keeper*\n\n${message}\n\n_${new Date().toISOString()}_`;
  const b = getBot();
  if (b) {
    try {
      await b.sendMessage(CONFIG.telegramChatId, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("[Telegram] Failed to send alert:", e);
    }
  }
  const logLevel = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  logLevel(`[Alert][${level.toUpperCase()}] ${message}`);
}
