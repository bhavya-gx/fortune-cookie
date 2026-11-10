// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeStats, formatStats } from "../src/stats.ts";
import { Store, type GrowthEvent, type PredictionLog } from "../src/store.ts";

const tz = "America/Los_Angeles";
const now = new Date("2026-11-10T20:00:00Z");
const fortune = (who: string, chat: string, at: string): PredictionLog => ({ at, chat, who, kind: "fortune", question: "", text: "🥠" });

const chats = {
  "iMessage;+;g1": ["a", "b", "owner"],
  "iMessage;+;g2": ["c"],
  "iMessage;-;a": ["a"],
};

test("activation, group activation and return rate", () => {
  const s = computeStats({
    chats,
    predictions: [
      fortune("a", "iMessage;+;g1", "2026-11-09T18:00:00Z"),
      fortune("b", "iMessage;+;g1", "2026-11-09T19:00:00Z"),
      fortune("a", "iMessage;-;a", "2026-11-10T18:00:00Z"),
      fortune("owner", "iMessage;+;g2", "2026-11-10T18:00:00Z"),
    ],
    events: [],
    now,
    timezone: tz,
    days: 3,
    excludeHandles: (h) => h === "owner",
  });
  assert.equal(s.people, 3); // a, b, c (owner excluded)
  assert.equal(s.groups, 2);
  assert.equal(s.dms, 1);
  assert.equal(s.askedAtLeastOnce, 2);
  assert.equal(s.activeGroups, 1); // g1 has two askers, g2 only the excluded owner
  assert.equal(s.returned, 1); // a asked on two days
  assert.equal(s.returnRate, 0.5);
  assert.equal(s.daily.length, 3);
});

test("daily rows count new people and groups from events", () => {
  const events: GrowthEvent[] = [
    { at: "2026-11-10T17:00:00Z", type: "new_chat", id: "x", group: true },
    { at: "2026-11-10T17:00:00Z", type: "new_person", id: "p1", group: true, via: "x" },
    { at: "2026-11-10T18:00:00Z", type: "new_person", id: "p2", group: false, via: "y" },
  ];
  const s = computeStats({ chats: {}, predictions: [], events, now, timezone: tz, days: 1 });
  assert.deepEqual(s.daily[0], { date: "2026-11-10", newPeople: 2, newChats: 1, newGroups: 1, fortunes: 0 });
  assert.equal(s.arrivedViaGroup, 1);
  assert.equal(s.arrivedViaDm, 1);
  assert.equal(s.trackingSince, "2026-11-10");
});

test("empty data does not divide by zero", () => {
  const s = computeStats({ chats: {}, predictions: [], events: [], now, timezone: tz, days: 1 });
  assert.equal(s.activationRate, null);
  assert.match(formatStats(s), /No growth events yet/);
});

test("store records first sightings as hashes, never phone numbers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fc-"));
  const store = new Store(dir);
  store.seen("iMessage;+;g1", "+15551234567", true);
  store.seen("iMessage;+;g1", "+15551234567", true); // repeat: nothing new
  store.seen("iMessage;+;g1", "+15557654321", true); // new person, existing chat
  const raw = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8");
  const events = raw.trim().split("\n").map((l) => JSON.parse(l) as GrowthEvent);
  assert.deepEqual(events.map((e) => e.type), ["new_chat", "new_person", "new_person"]);
  assert.ok(!raw.includes("5551234567") && !raw.includes("g1"));
  fs.rmSync(dir, { recursive: true });
});
