// The brain. Pure logic: give it an incoming message, get back the reply (or null).
// No network in here, so it is easy to test.
import { checkQuestion, cleanStyle, DISCLAIMER, refusalMessage } from "./guardrails.ts";
import { formatCustomFortune, type Fortune } from "./fortune.ts";
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
  cooldownMs?: () => number;
  // Phone numbers (digits, any format) that skip the daily cap, and the one number whose
  // "fortune like / dislike" ratings are learned. Both come from .env, never from code.
  unlimitedPhones?: string[];
  learningPhone?: string;
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

// Match the keyword, its common typo, a bot mention, or a cookie emoji anywhere.
const TRIGGER = /@?(?:fortune|fotune|fortun|forturne)(?:\s+(?:teller|cookie))?|🥠|🔮/i;
const NATURAL_TRIGGER = /\b(?:tell me (?:my )?fortune|what(?:'s| is) my fortune|give me (?:a )?fortune)\b/i;

export function parseTrigger(text: string): { command: string; rest: string } | null {
  const natural = NATURAL_TRIGGER.exec(text);
  const trigger = natural ?? TRIGGER.exec(text);
  if (!trigger) return null;
  const rest = `${text.slice(0, trigger.index)} ${text.slice(trigger.index + trigger[0].length)}`
    .replace(/^[\s:,\-!?]+/, "")
    .trim();
  const [first = "", ...tail] = rest.split(/\s+/);
  const word = first.toLowerCase();
  if (["stop", "join", "log", "help", "resume", "like", "dislike", "forget"].includes(word)) return { command: word, rest: tail.join(" ") };
  return { command: "ask", rest };
}

export const WELCOME_GROUP = '🥠✨ Hi! I\'m Fortune Cookie. Ask for a fortune anytime. Daily limits apply.';

export const WELCOME_DM = "🥠 Hi! I'm Fortune Cookie. Ask me anything, or add me to your group.";

export const CUSTOM_FORTUNES = [
  "it's all in your head.",
  "what if it doesn't come true? but, ah, what if it does?",
  "you write your own fortune",
  "no risk, no story",
  "it's your vision for a reason",
  "you're worthier than you think",
  "all it takes is that one small step",
];

function normalizedPhone(handle: string): string {
  const digits = handle.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function createBot(deps: BotDeps) {
  const { store, fortune, dailyCap } = deps;
  const now = deps.now ?? (() => new Date());
  const tz = deps.timezone ?? "America/Los_Angeles";
  const dedicated = deps.dedicated ?? false;
  const cooldownMs = deps.cooldownMs ?? (() => 5000 + Math.random() * 5000);
  const cooldownUntil = new Map<string, number>();
  const unlimitedPhones = new Set((deps.unlimitedPhones ?? []).map(normalizedPhone).filter(Boolean));
  const learningPhone = deps.learningPhone ? normalizedPhone(deps.learningPhone) : "";

  async function handle(msg: Incoming): Promise<string | null> {
    if (msg.fromMe) return null;
    const fresh = !store.knowsChat(msg.chat);
    // On a personal Apple ID, chats and people that never use a trigger are not
    // recorded at all, so the bot keeps no trace of your ordinary conversations.
    if (dedicated) store.seen(msg.chat, msg.handle, msg.isGroup);

    // First message in a new group: say hi, like a new friend joining.
    if (dedicated && fresh && msg.isGroup) return WELCOME_GROUP;

    let trig = parseTrigger(msg.text);
    // With its own Apple ID, a private chat needs no trigger word.
    if (dedicated && !trig && msg.isGroup === false) trig = parseTrigger(`fortune ${msg.text}`);
    if (!trig) return null;
    if (!dedicated) store.seen(msg.chat, msg.handle, msg.isGroup);
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
    if (["like", "dislike", "forget"].includes(command)) {
      if (!learningPhone || normalizedPhone(msg.handle) !== learningPhone) {
        return "🥠✨ Personal learning is enabled only for its designated account.";
      }
      if (command === "forget") {
        store.forgetCategoryPreferences(msg.handle);
        return "🥠✨ Your learned preferences are cleared.";
      }
      const previous = store.latestFortune(msg.handle, msg.chat);
      const category = previous?.text.match(/^🥠✨\s*([^:]+):/u)?.[1]?.trim();
      if (!category) return '🥠✨ Get a fortune here first, then text "fortune like" or "fortune dislike".';
      store.rateCategory(msg.handle, category, command === "like");
      return command === "like"
        ? `🥠✨ Got it. I'll lean toward ${category} fortunes.`
        : `🥠✨ Got it. I'll steer away from ${category} fortunes.`;
    }
    if (command === "help") {
      return [
        "🥠 Text me:",
        `fortune, fotune, @Fortune, 🥠, or "tell me my fortune"`,
        `Add a question to get a fortune about it`,
        `fortune join <name> (get the Sunday group fortune here, with your name in it)`,
        `fortune log (what I said recently)`,
        `fortune stop (I go quiet for you)`,
        ...(learningPhone ? [`On the learning account: fortune like, fortune dislike, or fortune forget`] : []),
        dailyCap > 0 ? `Everyone gets up to ${dailyCap} fortunes per day. ${DISCLAIMER}` : `Unlimited fortunes. ${DISCLAIMER}`,
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
    const timestamp = now().getTime();
    const readyAt = cooldownUntil.get(msg.handle) ?? 0;
    if (timestamp < readyAt) {
      const seconds = Math.ceil((readyAt - timestamp) / 1000);
      return `🥠✨ The cookie is still baking. Give it ${seconds} seconds, then try again.`;
    }
    const cap = unlimitedPhones.has(normalizedPhone(msg.handle)) ? 0 : store.capFor(msg.handle, dailyCap);
    if (cap > 0 && store.used(msg.handle, today) >= cap) {
      return `🥠✨ That's ${cap} for today. The cookie is taking a nap until midnight!`;
    }
    cooldownUntil.set(msg.handle, timestamp + cooldownMs());
    const customFortune = store.takeCustomFortune(CUSTOM_FORTUNES);
    const preferences = learningPhone && normalizedPhone(msg.handle) === learningPhone
      ? store.categoryPreferences(msg.handle)
      : undefined;
    const text = customFortune
      ? formatCustomFortune(customFortune)
      : cleanStyle(await fortune({ kind: "fortune", question: rest, preferences }));
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
    // Only chats where someone texted "fortune join" get the unprompted Sunday message.
    if (!names.length) return null;
    const text = cleanStyle(await fortune({ kind: "weekly", question: "", names }));
    store.markWeekly(chat, today);
    store.log({ at: d.toISOString(), chat, who: "group", kind: "weekly", question: "", text });
    return text;
  }

  return { handle, weekly };
}
