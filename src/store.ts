// Tiny JSON-file store. Everything the bot remembers lives in ./data so users
// can read it (that is the point: nothing hidden).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface PredictionLog {
  at: string; // ISO time
  chat: string;
  who: string; // handle (phone or email) or "group"
  kind: "fortune" | "weekly";
  question: string;
  text: string;
}

// One line per first sighting, written to data/events.jsonl. Powers `npm run stats`.
// Chat and person IDs are one-way hashes, so the file holds no phone numbers.
export interface GrowthEvent {
  at: string; // ISO time
  type: "new_chat" | "new_person";
  id: string; // hash of the chat guid or the handle
  group: boolean | null; // null when unknown
  via?: string; // new_person only: hash of the chat they first appeared in
}

export function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

interface State {
  // handle -> { date (local YYYY-MM-DD), count }
  usage: Record<string, { date: string; count: number }>;
  // handle -> daily cap assigned the first time they asked (their cohort)
  capCohort: Record<string, number>;
  customFortuneIndex: number;
  // handle -> fortune category -> last explicit rating
  categoryFeedback: Record<string, Record<string, boolean>>;
  // handle -> first name, only people who texted "fortune join"
  optedIn: Record<string, string>;
  // handles who texted "fortune stop"
  stopped: string[];
  // chat guid -> handles seen in it
  chats: Record<string, string[]>;
  // chat guid -> local date of the last weekly drop
  lastWeekly: Record<string, string>;
}

const EMPTY: State = { usage: {}, capCohort: {}, customFortuneIndex: 0, categoryFeedback: {}, optedIn: {}, stopped: [], chats: {}, lastWeekly: {} };

export class Store {
  private state: State;
  private logPath: string;
  private statePath: string;
  private eventsPath: string;

  constructor(dir: string | null) {
    this.state = structuredClone(EMPTY);
    this.statePath = dir ? path.join(dir, "state.json") : "";
    this.logPath = dir ? path.join(dir, "predictions.jsonl") : "";
    this.eventsPath = dir ? path.join(dir, "events.jsonl") : "";
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.statePath)) {
        this.state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(this.statePath, "utf8")) };
      }
      if (fs.existsSync(this.logPath)) {
        for (const line of fs.readFileSync(this.logPath, "utf8").split(/\r?\n/)) {
          if (!line) continue;
          try {
            const entry = JSON.parse(line) as PredictionLog;
            if (typeof entry.chat === "string" && typeof entry.text === "string") this.memoryLog.push(entry);
          } catch {
            continue;
          }
        }
      }
    }
  }

  private save() {
    if (this.statePath) fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  // How many fortunes this person has used today.
  used(handle: string, today: string): number {
    const u = this.state.usage[handle];
    return u && u.date === today ? u.count : 0;
  }

  bump(handle: string, today: string) {
    this.state.usage[handle] = { date: today, count: this.used(handle, today) + 1 };
    this.save();
  }

  // The cap this person joined with. Changing DAILY_CAP later only affects new people.
  capFor(handle: string, defaultCap: number): number {
    const cap = this.state.capCohort[handle];
    if (cap !== undefined) return cap;
    this.state.capCohort[handle] = defaultCap;
    this.save();
    return defaultCap;
  }

  takeCustomFortune(fortunes: readonly string[]): string | null {
    const fortune = fortunes[this.state.customFortuneIndex];
    if (fortune === undefined) return null;
    this.state.customFortuneIndex++;
    this.save();
    return fortune;
  }

  latestFortune(handle: string, chat: string): PredictionLog | null {
    return [...this.memoryLog].reverse().find((entry) => entry.kind === "fortune" && entry.who === handle && entry.chat === chat) ?? null;
  }

  rateCategory(handle: string, category: string, liked: boolean) {
    (this.state.categoryFeedback[handle] ??= {})[category] = liked;
    this.save();
  }

  categoryPreferences(handle: string): { liked: string[]; disliked: string[] } {
    const feedback = this.state.categoryFeedback[handle] ?? {};
    return {
      liked: Object.keys(feedback).filter((category) => feedback[category]),
      disliked: Object.keys(feedback).filter((category) => !feedback[category]),
    };
  }

  forgetCategoryPreferences(handle: string) {
    delete this.state.categoryFeedback[handle];
    this.save();
  }

  optIn(handle: string, name: string) {
    this.state.optedIn[handle] = name;
    this.state.stopped = this.state.stopped.filter((h) => h !== handle);
    this.save();
  }

  stop(handle: string) {
    if (!this.state.stopped.includes(handle)) this.state.stopped.push(handle);
    delete this.state.optedIn[handle];
    this.save();
  }

  isStopped(handle: string): boolean {
    return this.state.stopped.includes(handle);
  }

  resume(handle: string) {
    this.state.stopped = this.state.stopped.filter((h) => h !== handle);
    this.save();
  }

  optedInNames(chat: string): string[] {
    const members = this.state.chats[chat] ?? [];
    return members.map((h) => this.state.optedIn[h]).filter((n): n is string => Boolean(n));
  }

  knowsChat(chat: string): boolean {
    return chat in this.state.chats;
  }

  seen(chat: string, handle: string, isGroup?: boolean) {
    const newChat = !(chat in this.state.chats);
    const newPerson = !Object.values(this.state.chats).some((list) => list.includes(handle));
    const list = (this.state.chats[chat] ??= []);
    if (!list.includes(handle)) {
      list.push(handle);
      this.save();
    }
    const group = isGroup ?? (chat.includes(";+;") ? true : chat.includes(";-;") ? false : null);
    const at = new Date().toISOString();
    if (newChat) this.growth({ at, type: "new_chat", id: shortHash(chat), group });
    if (newPerson) this.growth({ at, type: "new_person", id: shortHash(handle), group, via: shortHash(chat) });
  }

  private growth(event: GrowthEvent) {
    if (this.eventsPath) fs.appendFileSync(this.eventsPath, JSON.stringify(event) + "\n");
  }

  chatGuids(): string[] {
    return Object.keys(this.state.chats);
  }

  weeklyDone(chat: string, date: string): boolean {
    return this.state.lastWeekly[chat] === date;
  }

  markWeekly(chat: string, date: string) {
    this.state.lastWeekly[chat] = date;
    this.save();
  }

  log(entry: PredictionLog) {
    if (this.logPath) fs.appendFileSync(this.logPath, JSON.stringify(entry) + "\n");
    this.memoryLog.push(entry);
  }

  memoryLog: PredictionLog[] = [];

  recent(chat: string, n = 5): PredictionLog[] {
    return this.memoryLog.filter((e) => e.chat === chat).slice(-n);
  }
}
