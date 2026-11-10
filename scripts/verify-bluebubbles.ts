// Checks your BlueBubbles server before you wire up the bot.
//   BB_URL=http://localhost:1234 BB_PASSWORD=xxx node scripts/verify-bluebubbles.ts
//   add --register https://your-public-url/  to register the webhook
//   add --send "<chatGuid>"                   to send a test fortune to that chat
import { loadConfig } from "../src/config.ts";

const cfg = loadConfig();
const q = `password=${encodeURIComponent(cfg.bbPassword)}`;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${cfg.bbUrl}${path}${path.includes("?") ? "&" : "?"}${q}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

const ping = await call("GET", "/api/v1/ping");
console.log(`ping: ${ping.ok ? "ok" : `HTTP ${ping.status}`}`);
if (!ping.ok) {
  console.log("Fix BB_URL / BB_PASSWORD first. Server > API & Webhooks shows both.");
  process.exit(1);
}

const info = await call("GET", "/api/v1/server/info");
if (info.json?.data) {
  const d = info.json.data;
  console.log(`server: v${d.server_version ?? "?"}, macOS ${d.os_version ?? "?"}, private api: ${d.private_api ?? "?"}`);
}

const chats = await call("POST", "/api/v1/chat/query", { limit: 25, sort: "lastmessage", with: ["participants"] });
const list: any[] = chats.json?.data ?? [];
console.log(`\nchats (${list.length}, newest first). Group chats have ";+;" in the guid:`);
for (const c of list) {
  const names = (c.participants ?? []).map((p: any) => p.address).join(", ");
  console.log(`  ${c.guid}  ${c.displayName || ""}  [${names}]`);
}

const hooks = await call("GET", "/api/v1/webhook");
console.log(`\nwebhooks:`, (hooks.json?.data ?? []).map((h: any) => `${h.url} (${h.events})`));

const reg = flag("--register");
if (reg) {
  const r = await call("POST", "/api/v1/webhook", { url: reg, events: ["new-message"] });
  console.log(`register ${reg}: ${r.ok ? "ok" : `HTTP ${r.status} ${r.text}`}`);
}

const to = flag("--send");
if (to) {
  const r = await call("POST", "/api/v1/message/text", {
    chatGuid: to,
    tempGuid: `verify-${Date.now()}`,
    message: "🥠 Fortune Cookie is connected. Text \"fortune\" to try me. ✨",
    method: process.env.BB_SEND_METHOD ?? "apple-script",
  });
  console.log(`send: ${r.ok ? "ok" : `HTTP ${r.status} ${r.text}`}`);
}
