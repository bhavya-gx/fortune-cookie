// BlueBubbles adapter. Everything BlueBubbles-specific lives here so the rest of
// the bot stays transport-agnostic.
//
// Shapes checked against the BlueBubbles docs and community examples on
// 4 Nov 2026 (webhook {type:"new-message", data:{text, handle.address, chats[].guid,
// isFromMe}}, POST /api/v1/message/text with chatGuid/tempGuid/message), but not
// yet against a live server. Run scripts/verify-bluebubbles.ts on your Mac first.
import type { Incoming } from "./bot.ts";

export function parseWebhook(body: any): Incoming | null {
  if (!body || body.type !== "new-message") return null;
  const m = body.data;
  if (!m || typeof m.text !== "string") return null;
  // Chat identity: some server versions put it in chats[0].guid, some in a
  // top-level chatGuid, and some group payloads only carry chats[0]["[auth-key]"].
  const first = Array.isArray(m.chats) ? m.chats[0] : undefined;
  const guid: unknown = first?.guid ?? m.chatGuid ?? first?.["[auth-key]"];
  if (typeof guid !== "string" || !guid) return null;
  const handle: string | undefined = m.handle?.address;
  if (!handle && !m.isFromMe) return null;
  return {
    chat: guid,
    handle: handle ?? "me",
    text: m.text,
    fromMe: Boolean(m.isFromMe),
    // group chat guids look like "iMessage;+;chat123...", 1:1 look like "iMessage;-;+1555..."
    isGroup: guid.includes(";+;"),
  };
}

export class BlueBubbles {
  private url: string;
  private password: string;
  private method: string;
  // method: "apple-script" (default, works on any Mac) or "private-api"
  // (needs the BlueBubbles Private API helper, adds reactions and typing).
  constructor(url: string, password: string, method = "apple-script") {
    this.url = url;
    this.password = password;
    this.method = method;
  }

  async send(chatGuid: string, message: string): Promise<void> {
    const res = await fetch(`${this.url}/api/v1/message/text?password=${encodeURIComponent(this.password)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chatGuid,
        tempGuid: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        method: this.method,
      }),
    });
    if (!res.ok) throw new Error(`BlueBubbles send failed: HTTP ${res.status}`);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/v1/ping?password=${encodeURIComponent(this.password)}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
