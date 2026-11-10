// The brain. Pure logic: give it an incoming message, get back the reply (or null).
// No network in here, so it is easy to test.
import { checkQuestion, cleanStyle, DISCLAIMER, refusalMessage } from "./guardrails.ts";
import type { Fortune } from "./fortune.ts";
import type { Store } from "./store.ts";

export interface Incoming {
  chat: string; // chat guid
  handle: string; // sender phone or email
  text: string;
  fromMe?: boolean;
  isGroup?: boolean;
}

export interface BotDeps {
  store: Store;
  fortune: Fortune;
  dailyCap: number; // 0 = unlimited
  now?: () => Date;
  timezone?: string;
  // true only when the bot has its OWN Apple ID. Then it greets new groups and
  // treats any text in a private chat as a question. On a personal account
  // (false, the default) it only ever answers messages that start with
  // "fortune" or 🥠, in any chat.
  dedicated?: boolean;
}

// Local calendar date (YYYY-MM-DD) in the configured timezone.
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// The bot only speaks when asked: the message must START with "fortune" or contain 🥠.
// This stops it from firing on ordinary chatter that happens to mention the word.
const TRIGGER = /^\s*(@?fortune(\s*(teller|cookie))?\b|🥠|🔮)/i;

export function parseTrigger(text: string): { command: string; rest: string } | null {
  if (!TRIGGER.test(text)) return null;
  const rest = text.replace(TRIGGER, "").replace(/^[\s:,\-!?]+/, "").trim();
  const [first = "", ...tail] = rest.split(/\s+/);
  const word = first.toLowerCase();
  if (["stop", "join", "log", "help", "resume"].includes(word)) return { command: word, rest: tail.join(" ") };
  return { command: "ask", rest };
}

export const WELCOME_GROUP = '🥠 Hi! I\'m Fortune Cookie. Text "fortune" for yours. 3 a day, just for fun.';

export const WELCOME_DM = "🥠 Hi! I'm Fortune Cookie. Ask me anything, or add me to your group.";

export function createBot(deps: BotDeps) {
  const { store, fortune, dailyCap } = deps;
  const now = deps.now ?? (() => new Date());
  const tz = deps.timezone ?? "America/Los_Angeles";
  const dedicated = deps.dedicated ?? false;

  async function handle(msg: Incoming): Promise<string | null> {
    if (msg.fromMe) return null;
    const fresh = !store.knowsChat(msg.chat);
    store.seen(msg.chat, msg.handle);

    // First message in a new group: say hi, like a new friend joining.
    if (dedicated && fresh && msg.isGroup) return WELCOME_GROUP;

    let trig = parseTrigger(msg.text);
    // With its own Apple ID, a private chat needs no trigger word.
    if (dedicated && !trig && msg.isGroup === false) trig = parseTrigger(`fortune ${msg.text}`);
    if (!trig) return null;
    const { command, rest } = trig;
    if (dedicated && fresh && msg.isGroup === false && command === "ask") {
      const first = await answer(msg, rest);
      return `${WELCOME_DM}\n\n${first}`;
    }

    if (command === "stop") {
      store.stop(msg.handle);
      return '🥠 Got it, I\'ll stay quiet for you. "fortune resume" brings me back.';
    }
    if (command === "resume") {
      store.resume(msg.handle);
      return '🥠 Welcome back! Text "fortune" anytime.';
    }
    if (store.isStopped(msg.handle)) return null; // they asked me to stay quiet

    if (command === "join") {
      const name = (rest.split(/\s+/)[0] || "friend").slice(0, 20).replace(/[^\p{L}\p{N}'-]/gu, "") || "friend";
      store.optIn(msg.handle, name);
      return `🥠 You're in, ${name}! You'll be in Sunday's group fortune.`;
    }
    if (command === "help") {
      return [
        "🥠 Text me:",
        `fortune (a random one) or fortune <your question>`,
        `fortune join <name> (let the weekly fortune mention you)`,
        `fortune log (what I said recently)`,
        `fortune stop (I go quiet for you)`,
        dailyCap > 0 ? `Up to ${dailyCap} fortunes each per day. ${DISCLAIMER}` : DISCLAIMER,
      ].join("\n");
    }
    if (command === "log") {
      const recent = store.recent(msg.chat, 5);
      if (!recent.length) return '🥠 Nothing yet. Text "fortune" to start.';
      return "🥠 Last things I said here:\n" + recent.map((r) => `- ${r.text}`).join("\n");
    }

    return answer(msg, rest);
  }

  async function answer(msg: Incoming, rest: string): Promise<string> {
    const refusal = checkQuestion(rest);
    if (refusal) return refusalMessage(refusal); // refusals never count toward the cap

    const today = localDate(now(), tz);
    if (dailyCap > 0 && store.used(msg.handle, today) >= dailyCap) {
      return `🥠 That's ${dailyCap} for today. More cookies at midnight.`;
    }
    const text = cleanStyle(await fortune({ kind: "fortune", question: rest }));
    store.bump(msg.handle, today);
    store.log({ at: now().toISOString(), chat: msg.chat, who: msg.handle, kind: "fortune", question: rest, text });
    return text;
  }

  // Sunday drop. Returns the text to send to the chat, or null if already done today / not Sunday.
  async function weekly(chat: string): Promise<string | null> {
    const d = now();
    const today = localDate(d, tz);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
    if (weekday !== "Sun" || store.weeklyDone(chat, today)) return null;
    const names = store.optedInNames(chat);
    const text = cleanStyle(await fortune({ kind: "weekly", question: "", names }));
    store.markWeekly(chat, today);
    store.log({ at: d.toISOString(), chat, who: "group", kind: "weekly", question: "", text });
    return text;
  }

  return { handle, weekly };
}
