// Growth numbers from the files the bot already keeps in ./data. Counts only:
// nothing here returns a phone number, a chat name, or message text.
import type { GrowthEvent, PredictionLog } from "./store.ts";

export interface StatsInput {
  chats: Record<string, string[]>; // chat guid -> handles seen (state.json)
  predictions: PredictionLog[]; // predictions.jsonl
  events: GrowthEvent[]; // events.jsonl (only exists from the day tracking began)
  now: Date;
  timezone: string;
  days: number; // how many recent days to list
  excludeHandles?: (handle: string) => boolean; // owner and team numbers
}

export interface DayRow {
  date: string;
  newPeople: number;
  newChats: number;
  newGroups: number;
  fortunes: number;
}

export interface Stats {
  people: number;
  chats: number;
  groups: number;
  dms: number;
  askedAtLeastOnce: number;
  activationRate: number | null; // askedAtLeastOnce / people
  activeGroups: number; // groups where 2+ different people asked for a fortune
  groupActivationRate: number | null;
  returned: number; // people who asked on 2+ different days
  returnRate: number | null; // returned / askedAtLeastOnce
  arrivedViaGroup: number; // people first seen inside a group chat (tracked since events began)
  arrivedViaDm: number;
  trackingSince: string | null; // date of the first growth event
  daily: DayRow[];
}

export function dateIn(iso: string | Date, tz: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function isGroupGuid(guid: string): boolean {
  return guid.includes(";+;");
}

export function computeStats(input: StatsInput): Stats {
  const { now, timezone, days } = input;
  const skip = input.excludeHandles ?? (() => false);

  const handles = new Set<string>();
  for (const list of Object.values(input.chats)) for (const h of list) if (!skip(h)) handles.add(h);
  const chatGuids = Object.keys(input.chats).filter((g) => input.chats[g].some((h) => !skip(h)));
  const groups = chatGuids.filter(isGroupGuid);

  // Real fortune requests from real people (weekly drops belong to the chat, not a person).
  const fortunes = input.predictions.filter((p) => p.kind === "fortune" && p.who !== "me" && !skip(p.who));
  const askedDays = new Map<string, Set<string>>();
  const askersByChat = new Map<string, Set<string>>();
  for (const p of fortunes) {
    (askedDays.get(p.who) ?? askedDays.set(p.who, new Set()).get(p.who)!).add(dateIn(p.at, timezone));
    (askersByChat.get(p.chat) ?? askersByChat.set(p.chat, new Set()).get(p.chat)!).add(p.who);
  }
  const asked = askedDays.size;
  const returned = [...askedDays.values()].filter((d) => d.size >= 2).length;
  const activeGroups = groups.filter((g) => (askersByChat.get(g)?.size ?? 0) >= 2).length;

  const people = input.events.filter((e) => e.type === "new_person");
  const arrivedViaGroup = people.filter((e) => e.group === true).length;
  const arrivedViaDm = people.filter((e) => e.group === false).length;

  const rows = new Map<string, DayRow>();
  const row = (date: string): DayRow => {
    let r = rows.get(date);
    if (!r) rows.set(date, (r = { date, newPeople: 0, newChats: 0, newGroups: 0, fortunes: 0 }));
    return r;
  };
  for (let i = days - 1; i >= 0; i--) row(dateIn(new Date(now.getTime() - i * 86_400_000), timezone));
  for (const e of input.events) {
    const r = rows.get(dateIn(e.at, timezone));
    if (!r) continue;
    if (e.type === "new_person") r.newPeople++;
    else {
      r.newChats++;
      if (e.group) r.newGroups++;
    }
  }
  for (const p of fortunes) {
    const r = rows.get(dateIn(p.at, timezone));
    if (r) r.fortunes++;
  }

  const first = input.events.map((e) => e.at).sort()[0];
  return {
    people: handles.size,
    chats: chatGuids.length,
    groups: groups.length,
    dms: chatGuids.length - groups.length,
    askedAtLeastOnce: asked,
    activationRate: ratio(asked, handles.size),
    activeGroups,
    groupActivationRate: ratio(activeGroups, groups.length),
    returned,
    returnRate: ratio(returned, asked),
    arrivedViaGroup,
    arrivedViaDm,
    trackingSince: first ? dateIn(first, timezone) : null,
    daily: [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100)}%`);

export function formatStats(s: Stats): string {
  const lines = [
    "🥠 Fortune Cookie stats (counts only, no numbers or messages)",
    "",
    `People who have texted it     ${s.people}`,
    `Chats it is in                ${s.chats} (${s.groups} groups, ${s.dms} direct)`,
    `Asked for a fortune           ${s.askedAtLeastOnce} (${pct(s.activationRate)} of people)`,
    `Groups where 2+ people asked  ${s.activeGroups} (${pct(s.groupActivationRate)} of groups)`,
    `Came back on another day      ${s.returned} (${pct(s.returnRate)} of askers)`,
    `New people arrived via group  ${s.arrivedViaGroup}, via direct message ${s.arrivedViaDm}`,
    "",
    s.trackingSince
      ? `New-person and new-chat counts start on ${s.trackingSince}, when tracking began. Earlier people appear in the totals only.`
      : "No growth events yet. New people and chats are counted from the first message after this update.",
    "",
    "Date        new people  new chats  new groups  fortunes",
    ...s.daily.map(
      (d) => `${d.date}  ${String(d.newPeople).padStart(10)}  ${String(d.newChats).padStart(9)}  ${String(d.newGroups).padStart(10)}  ${String(d.fortunes).padStart(8)}`,
    ),
  ];
  return lines.join("\n");
}
