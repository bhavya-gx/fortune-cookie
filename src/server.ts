// Runs the bot: receives BlueBubbles webhooks, replies, and does the Sunday drop.
import http from "node:http";
import { BlueBubbles, parseWebhook } from "./bluebubbles.ts";
import { createBot } from "./bot.ts";
import { loadConfig } from "./config.ts";
import { makeFortune } from "./fortune.ts";
import { Store } from "./store.ts";

const cfg = loadConfig();
const store = new Store(cfg.dataDir);
const bb = new BlueBubbles(cfg.bbUrl, cfg.bbPassword, cfg.bbSendMethod);
const bot = createBot({
  store,
  fortune: makeFortune({ apiKey: cfg.apiKey, model: cfg.model }),
  dailyCap: cfg.dailyCap,
  timezone: cfg.timezone,
  dedicated: cfg.dedicated,
  unlimitedPhones: cfg.unlimitedPhones,
  learningPhone: cfg.learningPhone,
});

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Fortune Cookie is awake. 🥠\n");
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    res.writeHead(200).end("ok"); // always ack fast so BlueBubbles does not retry
    try {
      const msg = parseWebhook(JSON.parse(raw));
      if (!msg) return;
      const reply = await bot.handle(msg);
      if (reply) {
        await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
        await bb.send(msg.chat, reply);
      }
    } catch (err) {
      console.warn("[webhook]", (err as Error).message);
    }
  });
});

// Sunday drop: check every minute, fire once per chat per Sunday at WEEKLY_HOUR local.
setInterval(async () => {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour !== cfg.weeklyHour) return;
  for (const chat of store.chatGuids()) {
    try {
      const text = await bot.weekly(chat);
      if (text) await bb.send(chat, text);
    } catch (err) {
      console.warn("[weekly]", (err as Error).message);
    }
  }
}, 60_000);

server.listen(cfg.port, async () => {
  console.log(`Fortune Cookie listening on :${cfg.port}`);
  console.log(`Daily cap: ${cfg.dailyCap === 0 ? "unlimited" : `${cfg.dailyCap} per person per day`}. Unlimited numbers from .env: ${cfg.unlimitedPhones.length}. Learning number: ${cfg.learningPhone ? "set" : "none"}.`);
  console.log(`Engine: ${cfg.apiKey ? `Claude (${cfg.model})` : "built-in deck (set ANTHROPIC_API_KEY for AI fortunes)"}`);
  console.log(`BlueBubbles at ${cfg.bbUrl}: ${(await bb.ping()) ? "reachable" : "NOT reachable (check BB_URL and BB_PASSWORD)"}`);
});
