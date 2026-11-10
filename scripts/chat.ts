// Try the fortune cookie in your terminal. No Mac, no BlueBubbles, no API key needed.
//   npm run chat
// Type as "you" in a pretend group chat. Use /as <name> to switch person.
import readline from "node:readline";
import { createBot } from "../src/bot.ts";
import { loadConfig } from "../src/config.ts";
import { makeFortune } from "../src/fortune.ts";
import { Store } from "../src/store.ts";

const cfg = loadConfig();
const bot = createBot({
  store: new Store(null),
  fortune: makeFortune({ apiKey: cfg.apiKey, model: cfg.model }),
  dailyCap: cfg.dailyCap,
  timezone: cfg.timezone,
});
let who = "you";
console.log("🥠 Fortune Cookie demo. Try: fortune | fortune will I get the job? | fortune help | /as maya | /weekly | /quit");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${who}> ` });
rl.prompt();
// Handle lines one at a time so pasted or piped input keeps its order.
let queue = Promise.resolve();
let closed = false;
rl.on("close", () => (closed = true));
rl.on("line", (line) => {
  queue = queue.then(async () => {
    if (line.trim() === "/quit") return rl.close();
    if (line.startsWith("/as ")) { who = line.slice(4).trim() || "you"; rl.setPrompt(`${who}> `); }
    else if (line.trim() === "/weekly") console.log((await bot.weekly("demo-chat")) ?? "(weekly drop only fires on Sundays, once)");
    else {
      const reply = await bot.handle({ chat: "demo-chat", handle: who, text: line, isGroup: true });
      if (reply) console.log(reply);
    }
    if (!closed) rl.prompt();
  });
});
