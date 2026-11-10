// Run the fortune cookie straight through this Mac's Messages app.
//   npm run mac
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
});

let mac: MacMessages;
try {
  mac = new MacMessages();
} catch (err) {
  console.error("🥠 " + (err as Error).message);
  process.exit(1);
}

console.log("🥠 Fortune Cookie is listening to Messages on this Mac.");
console.log(`Daily cap: ${cfg.dailyCap === 0 ? "unlimited" : `${cfg.dailyCap}/day for standard accounts`}; first 5 users get 6/day, two numbers are unlimited.`);
console.log("Unlimited accounts: 555 010 0001, 555 010 0002. Learning profile: 555 010 0001.");
console.log(`Account: ${cfg.dedicated ? "dedicated bot Apple ID (greets groups, answers any private text)" : "personal (only answers messages starting with \"fortune\" or 🥠)"}`);
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
// Check if message is from the bot itself to prevent loops
if (message.isFromMe) return;

// Expanded trigger matching: checks for "fortune", typos, @Fortune, emojis, or natural phrases
const text = message.text.toLowerCase();
const isTriggered = 
  text.includes("fortune") ||
  text.includes("fotune") || // common typo
  text.includes("@fortune") ||
  text.includes("🥠") ||
  text.includes("tell me my fortune");

if (!isTriggered) return;
const VIP_NUMBERS = ["555 010 0001", "555 010 0002"];
const STANDARD_DAILY_LIMIT = 6;

async function handleFortuneRequest(sender: string, chatGuid: string) {
  const cleanSender = sender.replace(/[\s\-\(\)]/g, "");
  const isVip = VIP_NUMBERS.some(vip => cleanSender.endsWith(vip));

  if (!isVip) {
    const usage = await getDailyUsageCount(cleanSender);
    if (usage >= STANDARD_DAILY_LIMIT) {
      await sendWithDelay(chatGuid, "You've reached your daily limit of 6 fortunes! Come back tomorrow. 🥠✨");
      return;
    }
    await incrementDailyUsage(cleanSender);
  }

  // 1-2 second pause to simulate thinking
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const fortuneText = await getNextCustomFortune();
  await sendWithDelay(chatGuid, fortuneText);
}

async function sendWithDelay(chatGuid: string, text: string) {
  // Uses your chat GUID routing for direct or group replies
  await macMessages.sendMessageToChat(chatGuid, text);
}
const CUSTOM_SENTENCES = [
  "Your custom sentence 1 here.",
  "Your custom sentence 2 here.",
  "Your custom sentence 3 here.",
  "Your custom sentence 4 here.",
  "Your custom sentence 5 here.",
  "Your custom sentence 6 here.",
  "Your custom sentence 7 here."
];

// Feedback command handlers
if (text.startsWith("fortune like")) {
  await recordFeedback(sender, "like");
  await macMessages.sendMessageToChat(chatGuid, "Noted! Saved to your preference profile. 👍✨");
  return;
}
if (text.startsWith("fortune dislike")) {
  await recordFeedback(sender, "dislike");
  await macMessages.sendMessageToChat(chatGuid, "Got it, adjusting your future fortunes. 📉");
  return;
}
if (text.startsWith("fortune forget")) {
  await clearFeedbackProfile(sender);
  await macMessages.sendMessageToChat(chatGuid, "Your learning profile has been cleared. 🔄");
  return;
}
interface FortuneResponse {
  category: string;
  emoji: string;
  text: string;
  luckyNumber: number;
}

function formatFortuneOutput(rawText: string): string {
  const categories = ["Career", "Chaos", "Cosmic", "Love"];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const luckyNum = Math.floor(Math.random() * 99) + 1;
  
  return `🥠 [${randomCategory}] - Lucky #${luckyNum}\n${rawText}`;
}
export const customSentences = [
  "it's all in your head.",
  "what if it doesn't come true? but, ah, what if it does?",
  "you write your own fortune",
  "no risk, no story",
  "it's your vision for a reason",
  "you're worthier than you think",
  "all it takes is that one small step"
];

// Function to serve your sentences in a persisted sequential queue, 
// falling back to the standard deck once all 7 have been served.
export function getNextCustomFortune(currentIndex: number): { text: string; nextIndex: number } {
  const sentence = customSentences[currentIndex % customSentences.length];
  
  // Add category styling, lucky numbers, and emojis
  const categories = ["Mindset", "Bold Moves", "Vision", "Growth"];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const luckyNumber = Math.floor(Math.random() * 99) + 1;

  const formattedFortune = `🥠 [${randomCategory}] - Lucky #${luckyNumber}\n"${sentence}"`;

  return {
    text: formattedFortune,
    nextIndex: currentIndex + 1
  };
}
// Wrap your listener logic inside a function:
async function processMessage(message) {
  // Now return is valid here!
  if (message.isFromMe) return;

  const text = message.text.toLowerCase();
  // ... rest of your code
}
// Listen for incoming iMessages
iMessageClient.on('message', async (message) => {
  // Check if message is from the bot itself to prevent loops
  if (message.isFromMe) return;

  const text = message.text.toLowerCase();
  
  // Your trigger matching and fortune logic goes here...
});
