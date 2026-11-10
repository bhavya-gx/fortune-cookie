// Run with: npm run stats          (add --days 30, or --json)
// Reads ./data (or DATA_DIR). Prints counts only. Your own and team numbers
// (UNLIMITED_PHONES) are left out so testing does not inflate the numbers.
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { computeStats, formatStats } from "../src/stats.ts";
import type { GrowthEvent, PredictionLog } from "../src/store.ts";

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      continue;
    }
  }
  return out;
}

const cfg = loadConfig(process.env);
const args = process.argv.slice(2);
const daysIndex = args.indexOf("--days");
const days = daysIndex >= 0 ? Math.max(1, Number.parseInt(args[daysIndex + 1] ?? "14", 10) || 14) : 14;

const statePath = path.join(cfg.dataDir, "state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {};
const digits = (h: string) => h.replace(/\D/g, "");
const team = new Set(cfg.unlimitedPhones.map(digits).filter(Boolean));

const stats = computeStats({
  chats: state.chats ?? {},
  predictions: readJsonl<PredictionLog>(path.join(cfg.dataDir, "predictions.jsonl")),
  events: readJsonl<GrowthEvent>(path.join(cfg.dataDir, "events.jsonl")),
  now: new Date(),
  timezone: cfg.timezone,
  days,
  excludeHandles: (h) => team.has(digits(h)),
});

console.log(args.includes("--json") ? JSON.stringify(stats, null, 2) : formatStats(stats));
