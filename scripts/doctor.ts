// Shows what the bot sees for your latest Messages, to debug "it didn't answer".
//   npm run doctor
// Run it in the same terminal app that has Full Disk Access. Read-only.
import { DatabaseSync } from "node:sqlite";
import { parseTrigger } from "../src/bot.ts";
import { CHAT_DB, decodeAttributedBody } from "../src/messages-mac.ts";

const db = new DatabaseSync(CHAT_DB, { readOnly: true });
const rows = db
  .prepare(
    `SELECT m.ROWID AS rowid, m.text AS text, m.attributedBody AS body, m.is_from_me AS from_me,
            m.service AS service, datetime(m.date / 1000000000 + 978307200, 'unixepoch', 'localtime') AS at,
            c.guid AS chat
       FROM message m
       LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
       LEFT JOIN chat c ON c.ROWID = cmj.chat_id
      ORDER BY m.ROWID DESC LIMIT 8`,
  )
  .all() as any[];

for (const r of rows.reverse()) {
  const decoded = decodeAttributedBody(r.body);
  const text = (r.text ?? decoded ?? "").trim();
  const reasons = [];
  if (!r.chat) reasons.push("no chat row (bot query drops it)");
  if (!text) reasons.push("no readable text");
  if (r.from_me) reasons.push("sent by this Mac's Apple ID (ignored)");
  if (text && !parseTrigger(text)) reasons.push("no trigger word");
  console.log(
    `#${r.rowid} ${r.at} ${r.service ?? "?"} ${r.chat ? (String(r.chat).includes(";+;") ? "group" : "1:1") : "no-chat"}` +
      ` text:${r.text == null ? "null" : "yes"} body:${r.body ? "yes" : "no"} decoded:${decoded == null ? "no" : "yes"}`,
  );
  console.log(`   "${text.slice(0, 60)}" -> ${reasons.length ? reasons.join("; ") : "bot should answer"}`);
  if (r.body && decoded == null) {
    const buf = Buffer.from(r.body);
    console.log(`   body bytes: ${buf.subarray(0, 160).toString("hex")}`);
  }
}
