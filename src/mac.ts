// Run the fortune cookie straight through this Mac's Messages app.
//   npm run mac
import { spawn } from "node:child_process";
import { createBot } from "./bot.ts";
import { loadConfig } from "./config.ts";
import { makeFortune } from "./fortune.ts";
import { MacMessages } from "./messages-mac.ts";
import { Store } from "./store.ts";

const cfg = loadConfig();
const store = new Store(cfg.dataDir);
const bot = createBot({
  store,
  fortune: makeFortune({ apiKey: cfg.apiKey, model: cfg.model }),
  dailyCap: cfg.dailyCap,
  timezone: cfg.timezone,
  dedicated: cfg.dedicated,
  unlimitedPhones: cfg.unlimitedPhones,
  learningPhone: cfg.learningPhone,
});

let mac: MacMessages;
try {
  mac = new MacMessages();
} catch (err) {
  console.error("🥠 " + (err as Error).message);
  process.exit(1);
}

// Keep the Mac awake for as long as the bot runs. -w ties caffeinate to this
// process, so it exits by itself when the bot stops or crashes.
if (cfg.keepAwake && process.platform === "darwin") {
  const caffeinate = spawn("caffeinate", ["-dims", "-w", String(process.pid)], { stdio: "ignore" });
  caffeinate.on("error", (err) => console.warn("[caffeinate] could not start:", err.message));
  caffeinate.unref();
}

console.log("🥠 Fortune Cookie is listening to Messages on this Mac.");
console.log(`Daily cap: ${cfg.dailyCap === 0 ? "unlimited" : `${cfg.dailyCap} per person per day`}. Unlimited numbers from .env: ${cfg.unlimitedPhones.length}. Learning number: ${cfg.learningPhone ? "set" : "none"}.`);
console.log(`Account: ${cfg.dedicated ? "dedicated bot Apple ID (greets groups, answers any private text)" : "personal (only answers messages starting with \"fortune\" or 🥠)"}`);
console.log(`Keep awake: ${cfg.keepAwake ? "on (caffeinate)" : "off"}`);
console.log(`Engine: ${cfg.apiKey ? `Claude (${cfg.model})` : "built-in deck"}`);
const groups = mac.groups(8);
if (groups.length) console.log("Recent group chats it can answer in:\n" + groups.map((g) => `  - ${g.name}`).join("\n"));
console.log('Text "fortune" in any of them. Ctrl+C to stop.\n');

let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    for (const msg of mac.poll()) {
      if (msg.fromMe) continue;
      const reply = await bot.handle(msg);
      if (!reply) continue;
      console.log(`[${new Date().toLocaleTimeString()}] ${msg.handle}: ${msg.text}\n  -> ${reply}`);
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
      await mac.send(msg.chat, reply);
    }
    // Sunday group fortune
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: cfg.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hour === cfg.weeklyHour) {
      for (const chat of store.chatGuids()) {
        const text = await bot.weekly(chat);
        if (text) await mac.send(chat, text);
      }
    }
  } catch (err) {
    console.warn("[mac]", (err as Error).message);
  } finally {
    busy = false;
  }
}, 3000);
