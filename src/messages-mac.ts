// Built-in macOS connector: no BlueBubbles, no extra app.
// Reads new messages from the Messages database (~/Library/Messages/chat.db)
// and replies through the Messages app with AppleScript.
// Needs: a Mac signed into iMessage, and Full Disk Access for the app that
// runs this (Terminal, iTerm, etc.) so it can read chat.db.
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { Incoming } from "./bot.ts";

export const CHAT_DB = path.join(os.homedir(), "Library/Messages/chat.db");

// Newer macOS often leaves message.text empty and stores the words in
// attributedBody (an Apple "typedstream" blob). The string sits right after
// the "NSString" class name: a few marker bytes, a length, then UTF-8 text.
export function decodeAttributedBody(blob: Uint8Array | null | undefined): string | null {
  if (!blob) return null;
  const buf = Buffer.from(blob);
  // The class can be NSString or NSMutableString; after it come a few marker
  // bytes ending in "+" (0x2b), then the length.
  let at = buf.indexOf("NSString");
  let name = "NSString";
  if (at < 0) { at = buf.indexOf("NSMutableString"); name = "NSMutableString"; }
  if (at < 0) return null;
  const plus = buf.indexOf(0x2b, at + name.length);
  if (plus < 0 || plus - (at + name.length) > 12) return null;
  let i = plus + 1;
  let len = buf[i];
  i += 1;
  if (len === 0x81) { len = buf.readUInt16LE(i); i += 2; }
  else if (len === 0x82) { len = buf.readUInt32LE(i); i += 4; }
  if (!len || i + len > buf.length) return null;
  return buf.subarray(i, i + len).toString("utf8");
}

interface Row {
  rowid: number;
  text: string | null;
  body: Uint8Array | null;
  from_me: number;
  handle: string | null;
  chat: string;
}

export class MacMessages {
  private db: DatabaseSync;
  private last: number;
  // Texts the bot itself sent, so it never answers its own 🔮 replies.
  private sent = new Map<string, number>();

  constructor(dbPath = CHAT_DB) {
    try {
      this.db = new DatabaseSync(dbPath, { readOnly: true });
      const row = this.db.prepare("SELECT MAX(ROWID) AS m FROM message").get() as { m: number | null };
      this.last = row.m ?? 0; // start from now, never replay old history
    } catch (err) {
      throw new Error(
        `Cannot read ${dbPath} (${(err as Error).message}).\n` +
          "Give your terminal app Full Disk Access: System Settings > Privacy & Security > Full Disk Access, turn it on, then restart the terminal.",
      );
    }
  }

  // New messages since the last call.
  poll(): Incoming[] {
    const rows = this.db
      .prepare(
        `SELECT m.ROWID AS rowid, m.text AS text, m.attributedBody AS body, m.is_from_me AS from_me,
                h.id AS handle, c.guid AS chat
           FROM message m
           JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
           JOIN chat c ON c.ROWID = cmj.chat_id
           LEFT JOIN handle h ON h.ROWID = m.handle_id
          WHERE m.ROWID > ?
          ORDER BY m.ROWID`,
      )
      .all(this.last) as unknown as Row[];
    const out: Incoming[] = [];
    for (const r of rows) {
      this.last = Math.max(this.last, r.rowid);
      const text = (r.text ?? decodeAttributedBody(r.body) ?? "").trim();
      if (!text) continue;
      if (r.from_me) {
        // The Mac's own Apple ID. Skip what the bot sent; treat the rest as the owner talking.
        if (this.wasSentByBot(text)) continue;
        out.push({ chat: r.chat, handle: "me", text, fromMe: true, isGroup: r.chat.includes(";+;") });
      } else {
        out.push({ chat: r.chat, handle: r.handle ?? "unknown", text, isGroup: r.chat.includes(";+;") });
      }
    }
    return out;
  }

  private wasSentByBot(text: string): boolean {
    const now = Date.now();
    for (const [t, at] of this.sent) if (now - at > 10 * 60_000) this.sent.delete(t);
    if (this.sent.has(text)) { this.sent.delete(text); return true; }
    return false;
  }

  send(chatGuid: string, message: string): Promise<void> {
    this.sent.set(message.trim(), Date.now());
    const script = [
      "on run argv",
      '  tell application "Messages"',
      "    send (item 1 of argv) to chat id (item 2 of argv)",
      "  end tell",
      "end run",
    ].join("\n");
    return new Promise((resolve, reject) => {
      execFile("osascript", ["-e", script, message, chatGuid], (err, _out, stderr) =>
        err ? reject(new Error(`Messages send failed: ${stderr || err.message}`)) : resolve(),
      );
    });
  }

  // Group chats with a name, newest first, to help people find theirs.
  groups(limit = 15): Array<{ guid: string; name: string }> {
    return this.db
      .prepare(
        `SELECT c.guid AS guid, COALESCE(NULLIF(c.display_name, ''), c.chat_identifier) AS name
           FROM chat c JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
          WHERE c.guid LIKE '%;+;%'
          GROUP BY c.ROWID ORDER BY MAX(cmj.message_date) DESC LIMIT ?`,
      )
      .all(limit).map((r: any) => ({ guid: String(r.guid), name: String(r.name) }));
  }
}
