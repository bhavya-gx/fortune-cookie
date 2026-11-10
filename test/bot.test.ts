// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBot, parseTrigger, localDate } from "../src/bot.ts";
import { Store } from "../src/store.ts";
import { checkQuestion, cleanStyle } from "../src/guardrails.ts";
import { offlineFortune } from "../src/fortune.ts";
import { parseWebhook } from "../src/bluebubbles.ts";
import { loadConfig } from "../src/config.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fortune = async () => "🥠 A tiny good surprise is on its way. Lucky numbers: 7, 18, 42";
const chat = "iMessage;+;chat123";

function bot(opts: { cap?: number; now?: () => Date; cooldownMs?: () => number } = {}) {
  const store = new Store(null);
  store.seen(chat, "+15550000"); // the group already knows the bot
  return { store, bot: createBot({ store, fortune, dailyCap: opts.cap ?? 3, now: opts.now, cooldownMs: opts.cooldownMs ?? (() => 0), timezone: "America/Los_Angeles" }) };
}
const msg = (text: string, handle = "+15550001") => ({ chat, handle, text, isGroup: true });

test("only speaks when triggered", async () => {
  const { bot: b } = bot();
  assert.equal(await b.handle(msg("what time is dinner")), null);
  assert.match((await b.handle(msg("my fortune cookie was stale")))!, /🥠/);
  assert.match((await b.handle(msg("fortune")))!, /🥠/);
  assert.match((await b.handle(msg("will I nap? 🥠")))!, /🥠/);
  assert.match((await b.handle(msg("fotune, will I get a dog?")))!, /🥠/);
  assert.match((await b.handle(msg("tell me my fortune")))!, /🥠/);
});

test("parseTrigger splits commands", () => {
  assert.deepEqual(parseTrigger("fortune stop"), { command: "stop", rest: "" });
  assert.deepEqual(parseTrigger("fortune join Maya"), { command: "join", rest: "Maya" });
  assert.deepEqual(parseTrigger("fortune: will I get a dog?"), { command: "ask", rest: "will I get a dog?" });
  assert.deepEqual(parseTrigger("tell me my fortune"), { command: "ask", rest: "" });
  assert.deepEqual(parseTrigger("will I get a dog? 🥠"), { command: "ask", rest: "will I get a dog?" });
  assert.equal(parseTrigger("hello"), null);
});

test("fortune cooldown is per user and gives a friendly nudge", async () => {
  let time = new Date("2026-11-04T18:00:00Z");
  const { bot: b } = bot({ now: () => time, cooldownMs: () => 7000 });
  assert.match((await b.handle(msg("fortune")))!, /Lucky numbers/);
  assert.match((await b.handle(msg("fortune")))!, /still baking/);
  assert.match((await b.handle(msg("fortune", "+15550002")))!, /Lucky numbers/);
  time = new Date(time.getTime() + 7000);
  assert.match((await b.handle(msg("fortune")))!, /Lucky numbers/);
});

test("fortune history is available after restarting the JSON store", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fortune-store-"));
  try {
    const first = new Store(dir);
    first.log({ at: "2026-11-04T18:00:00.000Z", chat, who: "+15550001", kind: "fortune", question: "", text: "🥠✨ A bright idea arrives. Lucky numbers: 2, 8, 19" });
    const restarted = new Store(dir);
    assert.equal(restarted.recent(chat)[0]?.text, "🥠✨ A bright idea arrives. Lucky numbers: 2, 8, 19");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("custom fortunes exhaust before the AI provider is used", async () => {
  const store = new Store(null);
  let aiCalls = 0;
  const b = createBot({
    store,
    fortune: async () => { aiCalls++; return "AI fortune. Lucky numbers: 3, 11, 24"; },
    dailyCap: 0,
    cooldownMs: () => 0,
  });
  const custom = [
    "It's all in your head.",
    "What if it doesn't come true? But, ah, what if it does?",
    "You write your own fortune.",
    "No risk, no story.",
    "It's your vision for a reason.",
    "You're worthier than you think.",
    "All it takes is that one small step.",
  ];
  for (const sentence of custom) {
    assert.match((await b.handle(msg("fortune")))!, new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.equal(aiCalls, 0);
  assert.match((await b.handle(msg("fortune")))!, /AI fortune/);
  assert.equal(aiCalls, 1);
});

test("custom fortune position survives a store restart", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fortune-deck-"));
  try {
    const deck = ["custom one", "custom two"];
    const first = new Store(dir);
    assert.equal(first.takeCustomFortune(deck), "custom one");
    const restarted = new Store(dir);
    assert.equal(restarted.takeCustomFortune(deck), "custom two");
    assert.equal(restarted.takeCustomFortune(deck), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the 415 number learns from explicit ratings and can clear its profile", async () => {
  const store = new Store(null);
  const handle = "555 010 0001";
  store.log({ at: "2026-11-04T18:00:00.000Z", chat, who: handle, kind: "fortune", question: "", text: "🥠✨ love: A kind surprise is coming. Lucky numbers: 2, 8, 19" });
  const exhaustedDeck = Array.from({ length: 7 }, (_, index) => `used ${index}`);
  for (let i = 0; i < exhaustedDeck.length; i++) store.takeCustomFortune(exhaustedDeck);
  const requests: Array<{ preferences?: { liked: string[]; disliked: string[] } }> = [];
  const b = createBot({
    store,
    fortune: async (request) => {
      requests.push(request);
      return "🥠✨ love: A new fortune. Lucky numbers: 3, 11, 24";
    },
    dailyCap: 3,
    cooldownMs: () => 0,
  });

  assert.match((await b.handle(msg("fortune like", handle)))!, /lean toward love/);
  await b.handle(msg("fortune", handle));
  assert.deepEqual(requests.at(-1)?.preferences, { liked: ["love"], disliked: [] });

  assert.match((await b.handle(msg("fortune dislike", handle)))!, /steer away from love/);
  await b.handle(msg("fortune", handle));
  assert.deepEqual(requests.at(-1)?.preferences, { liked: [], disliked: ["love"] });

  assert.match((await b.handle(msg("fortune forget", handle)))!, /cleared/);
  await b.handle(msg("fortune", handle));
  assert.deepEqual(requests.at(-1)?.preferences, { liked: [], disliked: [] });
  assert.match((await b.handle(msg("fortune like", "555 010 0002")))!, /only for its designated account/);
});

test("first-user cap of 6, refusals do not count, resets next day", async () => {
  let day = new Date("2026-11-04T18:00:00Z"); // 10am Pacific
  const { bot: b } = bot({ cap: 3, now: () => day });
  for (let i = 0; i < 6; i++) assert.match((await b.handle(msg("fortune")))!, /Lucky numbers/);
  const capped = await b.handle(msg("fortune"));
  assert.match(capped!, /6 for today/);
  // a different person still has their own early-user allowance
  assert.match((await b.handle(msg("fortune", "+15550002")))!, /Lucky numbers/);
  // a refused question never costs a fortune
  assert.match((await b.handle(msg("fortune will I win the lottery", "+15550002")))!, /money/i);
  assert.match((await b.handle(msg("fortune", "+15550002")))!, /Lucky numbers/);
  // next local day resets
  day = new Date("2026-11-05T18:00:00Z");
  assert.match((await b.handle(msg("fortune")))!, /Lucky numbers/);
});

test("cap of 0 means unlimited", async () => {
  const { bot: b } = bot({ cap: 0 });
  for (let i = 0; i < 10; i++) assert.match((await b.handle(msg("fortune")))!, /Lucky numbers/);
});

test("first five users get six fortunes, and the designated phone is unlimited", async () => {
  const { bot: b } = bot({ cap: 3 });
  const unlimited = "555 010 0001";
  for (let i = 0; i < 10; i++) assert.match((await b.handle(msg("fortune", unlimited)))!, /Lucky numbers/);
  const secondUnlimited = "555 010 0002";
  for (let i = 0; i < 10; i++) assert.match((await b.handle(msg("fortune", secondUnlimited)))!, /Lucky numbers/);

  for (let user = 1; user <= 5; user++) {
    const handle = `+1555100000${user}`;
    for (let i = 0; i < 6; i++) assert.match((await b.handle(msg("fortune", handle)))!, /Lucky numbers/);
    assert.match((await b.handle(msg("fortune", handle)))!, /6 for today/);
  }

  for (let i = 0; i < 3; i++) assert.match((await b.handle(msg("fortune", "+15559999999")))!, /Lucky numbers/);
  assert.match((await b.handle(msg("fortune", "+15559999999")))!, /3 for today/);
});

test("DAILY_CAP env is read, defaults to 3, rejects junk", () => {
  assert.equal(loadConfig({}).dailyCap, 3);
  assert.equal(loadConfig({ DAILY_CAP: "5" }).dailyCap, 5);
  assert.equal(loadConfig({ DAILY_CAP: "0" }).dailyCap, 0);
  assert.throws(() => loadConfig({ DAILY_CAP: "lots" }));
});

test("stop silences the bot for that person, resume brings it back", async () => {
  const { bot: b } = bot();
  assert.match((await b.handle(msg("fortune stop")))!, /quiet/);
  assert.equal(await b.handle(msg("fortune")), null);
  assert.match((await b.handle(msg("fortune", "+15550002")))!, /🥠/); // others unaffected
  assert.match((await b.handle(msg("fortune resume")))!, /Welcome back/);
  assert.match((await b.handle(msg("fortune")))!, /🥠/);
});

test("weekly fortune only names people who opted in, and stop removes them", async () => {
  const sunday = new Date("2026-11-08T18:00:00Z");
  const { bot: b, store } = bot({ now: () => sunday });
  let seen: string[] | undefined;
  const b2 = createBot({ store, fortune: async (r) => { seen = r.names; return "🥠 weekly"; }, dailyCap: 3, now: () => sunday, cooldownMs: () => 0 });
  await b.handle(msg("fortune join Maya", "+1"));
  await b.handle(msg("fortune", "+2")); // seen but not opted in
  await b.handle(msg("fortune join Sam", "+3"));
  await b.handle(msg("fortune stop", "+3"));
  assert.equal(await b2.weekly(chat), "🥠 weekly");
  assert.deepEqual(seen, ["Maya"]);
  assert.equal(await b2.weekly(chat), null); // once per Sunday
});

test("weekly does nothing on a weekday", async () => {
  const tuesday = new Date("2026-11-03T18:00:00Z");
  const { bot: b } = bot({ now: () => tuesday });
  assert.equal(await b.weekly(chat), null);
});

test("guardrails catch health, money, legal, death and other people", () => {
  assert.equal(checkQuestion("will my cancer come back"), "health");
  assert.equal(checkQuestion("should I buy bitcoin"), "money");
  assert.equal(checkQuestion("will I win the lawsuit"), "legal");
  assert.equal(checkQuestion("when will I die"), "death");
  assert.equal(checkQuestion("does she like me"), "someone-else");
  assert.equal(checkQuestion("will I nap today"), null);
  assert.equal(checkQuestion(""), null);
});

test("house style: no em dashes or double hyphens anywhere", () => {
  assert.equal(cleanStyle("Say yes — it works -- really"), "Say yes, it works, really");
  for (let i = 0; i < 50; i++) {
    const f = offlineFortune({ kind: i % 2 ? "fortune" : "weekly", question: "" });
    assert.doesNotMatch(f, /—|--/);
  }
});

test("log and help answer, and the log records what was said", async () => {
  const { bot: b, store } = bot();
  assert.match((await b.handle(msg("fortune help")))!, /Everyone else gets up to 3 fortunes/);
  assert.match((await b.handle(msg("fortune log")))!, /Nothing yet/);
  await b.handle(msg("fortune"));
  assert.equal(store.recent(chat).length, 1);
  assert.match((await b.handle(msg("fortune log")))!, /Lucky numbers/);
});

test("ignores its own messages", async () => {
  const { bot: b } = bot();
  assert.equal(await b.handle({ chat, handle: "me", text: "fortune", fromMe: true }), null);
});

test("BlueBubbles webhook parsing", () => {
  const ev = {
    type: "new-message",
    data: { text: "fortune", isFromMe: false, handle: { address: "+15550001" }, chats: [{ guid: "iMessage;+;chat9" }] },
  };
  assert.deepEqual(parseWebhook(ev), { chat: "iMessage;+;chat9", handle: "+15550001", text: "fortune", fromMe: false, isGroup: true });
  assert.equal(parseWebhook({ type: "typing-indicator" }), null);
  assert.equal(parseWebhook(null), null);
});

test("localDate uses the configured zone", () => {
  assert.equal(localDate(new Date("2026-11-05T06:30:00Z"), "America/Los_Angeles"), "2026-11-04");
  assert.equal(localDate(new Date("2026-11-05T06:30:00Z"), "Asia/Kolkata"), "2026-11-05");
});

test("says hi once when it joins a new group", async () => {
  const store = new Store(null);
  const b = createBot({ store, fortune, dailyCap: 3, dedicated: true, cooldownMs: () => 0 });
  const g = { chat: "iMessage;+;newgroup", handle: "+1", text: "omg who added this", isGroup: true };
  assert.match((await b.handle(g))!, /I'm Fortune Cookie/);
  assert.equal(await b.handle(g), null);
});

test("private chat: intro first, then any text is a question, cap still applies", async () => {
  const store = new Store(null);
  const b = createBot({ store, fortune, dailyCap: 3, dedicated: true, cooldownMs: () => 0 });
  const dm = (text: string) => ({ chat: "iMessage;-;+1555", handle: "+1555", text, isGroup: false });
  const first = (await b.handle(dm("will saturday be fun")))!;
  assert.match(first, /Ask me anything/);
  assert.match(first, /Lucky numbers/);
  for (let i = 0; i < 5; i++) assert.match((await b.handle(dm("and sunday?")))!, /Lucky numbers/);
  assert.match((await b.handle(dm("fortune")))!, /6 for today/);
  assert.match((await b.handle(dm("should I buy bitcoin")))!, /money/);
});

test("personal account (default): never greets, never answers plain private texts", async () => {
  const store = new Store(null);
  const b = createBot({ store, fortune, dailyCap: 3, cooldownMs: () => 0 });
  assert.equal(await b.handle({ chat: "iMessage;+;g", handle: "+1", text: "hey all", isGroup: true }), null);
  assert.equal(await b.handle({ chat: "iMessage;-;+1", handle: "me", text: "hahaha told you", isGroup: false }), null);
  assert.equal(await b.handle({ chat: "iMessage;-;+1", handle: "me", text: "bana hi rahe ho", isGroup: false }), null);
  assert.match((await b.handle({ chat: "iMessage;-;+1", handle: "me", text: "fortune", isGroup: false }))!, /Lucky numbers/);
});
