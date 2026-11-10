// All settings come from environment variables so the bot is easy to self-host.

export interface Config {
  bbUrl: string; // BlueBubbles server URL, e.g. http://localhost:1234
  bbPassword: string; // BlueBubbles server password
  bbSendMethod: string; // "apple-script" (default) or "private-api"
  port: number; // port this bot listens on for BlueBubbles webhooks
  dailyCap: number; // fortunes per person per day. 0 means unlimited.
  timezone: string; // IANA zone used for "per day" and the Sunday drop
  weeklyHour: number; // hour (0-23, local) of the Sunday prediction
  model: string;
  apiKey: string | undefined;
  dataDir: string;
  dedicated: boolean; // bot has its own Apple ID
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cap = env.DAILY_CAP === undefined || env.DAILY_CAP === "" ? 3 : Number.parseInt(env.DAILY_CAP, 10);
  if (!Number.isFinite(cap) || cap < 0) throw new Error("DAILY_CAP must be a non-negative integer (0 = unlimited)");
  return {
    bbUrl: (env.BB_URL ?? "http://localhost:1234").replace(/\/$/, ""),
    bbPassword: env.BB_PASSWORD ?? "",
    bbSendMethod: env.BB_SEND_METHOD ?? "apple-script",
    port: int("PORT", 8787),
    dailyCap: cap,
    timezone: env.TIMEZONE ?? "America/Los_Angeles",
    weeklyHour: Math.min(23, int("WEEKLY_HOUR", 10)),
    model: env.FORTUNE_MODEL ?? "claude-opus-5-5",
    apiKey: env.ANTHROPIC_API_KEY,
    dataDir: env.DATA_DIR ?? "./data",
    dedicated: env.BOT_ACCOUNT === "dedicated",
  };
}
