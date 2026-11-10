// Tiny JSON-file store. Everything the bot remembers lives in ./data so users
// can read it (that is the point: nothing hidden).
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

interface State {
  // handle -> { date (local YYYY-MM-DD), count }
  usage: Record<string, { date: string; count: number }>;
  // handle -> first name, only people who texted "fortune join"
  optedIn: Record<string, string>;
  // handles who texted "fortune stop"
  stopped: string[];
  // chat guid -> handles seen in it
  chats: Record<string, string[]>;
  // chat guid -> local date of the last weekly drop
  lastWeekly: Record<string, string>;
}

const EMPTY: State = { usage: {}, optedIn: {}, stopped: [], chats: {}, lastWeekly: {} };

export class Store {
  private state: State;
  private logPath: string;
  private statePath: string;

  constructor(dir: string | null) {
    this.state = structuredClone(EMPTY);
    this.statePath = dir ? path.join(dir, "state.json") : "";
    this.logPath = dir ? path.join(dir, "predictions.jsonl") : "";
    if (dir) {
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.statePath)) {
        this.state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(this.statePath, "utf8")) };
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

  seen(chat: string, handle: string) {
    const list = (this.state.chats[chat] ??= []);
    if (!list.includes(handle)) {
      list.push(handle);
      this.save();
    }
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
