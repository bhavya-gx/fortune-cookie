import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decodeAttributedBody, MacMessages } from "../src/messages-mac.ts";

function blob(text: string): Uint8Array {
  const t = Buffer.from(text, "utf8");
  const len = t.length < 0x80 ? Buffer.from([t.length]) : Buffer.concat([Buffer.from([0x81]), Buffer.from([t.length & 0xff, t.length >> 8])]);
  return Buffer.concat([Buffer.from("\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString", "latin1"), Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]), len, t, Buffer.from([0x86])]);
}

test("decodes attributedBody text, short and long", () => {
  assert.equal(decodeAttributedBody(blob("fortune 🔮")), "fortune 🔮");
  const long = "fortune " + "a".repeat(300);
  assert.equal(decodeAttributedBody(blob(long)), long);
  assert.equal(decodeAttributedBody(null), null);
  assert.equal(decodeAttributedBody(Buffer.from("nothing here")), null);
});

test("polls only new messages, reads both text forms, skips its own replies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-"));
  const file = path.join(dir, "chat.db");
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE message (ROWID INTEGER PRIMARY KEY, text TEXT, attributedBody BLOB, is_from_me INT, handle_id INT);
           CREATE TABLE handle (ROWID INTEGER PRIMARY KEY, id TEXT);
           CREATE TABLE chat (ROWID INTEGER PRIMARY KEY, guid TEXT, chat_identifier TEXT, display_name TEXT);
           CREATE TABLE chat_message_join (chat_id INT, message_id INT, message_date INT);
           INSERT INTO handle VALUES (1, '+15550001');
           INSERT INTO chat VALUES (1, 'iMessage;+;chat42', 'chat42', 'Besties');
           INSERT INTO message VALUES (1, 'old message', NULL, 0, 1);
           INSERT INTO chat_message_join VALUES (1, 1, 1);`);
  const mac = new MacMessages(file);
  assert.deepEqual(mac.poll(), []); // history is not replayed
  const add = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)");
  const join = db.prepare("INSERT INTO chat_message_join VALUES (1, ?, ?)");
  add.run(2, "fortune", null, 0, 1); join.run(2, 2);
  add.run(3, null, blob("fortune will it rain"), 0, 1); join.run(3, 3);
  add.run(4, "fortune from the owner", null, 1, 0); join.run(4, 4);
  (mac as any).sent.set("🔮 reply", Date.now());
  add.run(5, "🔮 reply", null, 1, 0); join.run(5, 5);
  assert.deepEqual(mac.poll(), [
    { chat: "iMessage;+;chat42", handle: "+15550001", text: "fortune", isGroup: true },
    { chat: "iMessage;+;chat42", handle: "+15550001", text: "fortune will it rain", isGroup: true },
    { chat: "iMessage;+;chat42", handle: "me", text: "fortune from the owner", fromMe: true, isGroup: true },
  ]);
  assert.deepEqual(mac.poll(), []);
  assert.deepEqual(mac.groups(), [{ guid: "iMessage;+;chat42", name: "Besties" }]);
});
