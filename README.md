# Fortune Cookie 🥠

Your group chat's fortune cookie. An open-source iMessage bot: add it to a group chat, text `fortune`, and it cracks open a happy fortune with lucky numbers. 3 a day each, just for fun.

**Try it on any phone:** https://bhavya-gx.github.io/fortune-cookie/

## How it works

Apple has no bot API for iMessage. So Fortune Cookie runs on a Mac that is signed into its own Apple ID and phone number, and it shows up in Messages like any other contact. Friends just text it or add it to a group from their iPhone. They install nothing.

| Who | Needs |
| --- | --- |
| Friends using it | Any iPhone with iMessage. Nothing to install. |
| You, hosting it | A Mac that stays on, a spare Apple ID, Node 22.18+ |
| Its own phone number (optional) | A spare iPhone with a SIM, signed into the same Apple ID |

## Try it in 10 seconds (no Mac setup, no key)

```bash
git clone https://github.com/bhavya-gx/fortune-cookie.git
cd fortune-cookie
npm install
npm run chat
```

Type `fortune will saturday be fun?`. Use `/as maya` to switch person and `/quit` to leave.

## Commands

| Text | What happens |
| --- | --- |
| `fortune`, `fotune`, `@Fortune`, or `🥠` | A happy fortune, even when the trigger appears inside a message |
| `tell me my fortune` or a trigger plus a question | A fortune about your question |
| `fortune join <name>` | You are included in the Sunday group fortune |
| `fortune log` | The last 5 things it said in this chat |
| `fortune stop` / `fortune resume` | It goes quiet for you, or comes back |
| `fortune help` | This list |

## Run it for real

1. **Make an Apple ID for the bot** at account.apple.com, for example `yourcookie@icloud.com`.
2. **Sign the Mac's Messages app into it.** Messages > Settings > iMessage. If you sign out your own account, your texts stop arriving on that Mac, so a spare Mac or a second macOS user is best.
3. **Set the sender identity.** In Messages > Settings > General > Share Name and Photo, set the name to **Fortune Cookie**, choose `brand/logo.png` (the square cookie avatar on white), and turn on name and photo sharing. Use the bot's dedicated Apple ID so the identity is consistent across its chats.
4. **Allow Terminal to read Messages.** System Settings > Privacy & Security > Full Disk Access > turn on Terminal, then reopen Terminal.
5. **Configure and start:**
   ```bash
   cp .env.example .env
   ```
   Set `BOT_ACCOUNT=dedicated` in `.env` (only when the Mac is signed into the bot's own Apple ID). Then:
   ```bash
   npm install && npm run mac
   ```
   Approve the prompt that lets Terminal control Messages. Keep the Mac awake with `caffeinate -s &`.

`BOT_ACCOUNT=personal` (the default) is for running it on your own Apple ID: it answers messages containing a fortune trigger and never greets groups or replies to ordinary texts.

Apple controls how this identity appears on each recipient's device. Recipients may see the phone number until they accept the shared contact photo, have the bot saved as a contact, or enable name and photo sharing; the bot cannot force every iPhone to replace a number with “Fortune Cookie.”

## Daily cap and guardrails

- The first five people to request a fortune get up to 6 per day. Other users follow `DAILY_CAP` (default 3); `0` means unlimited for everyone. Two designated phone numbers are always unlimited.
- Each user has a randomized 5–10 second cooldown between generated fortunes.
- Seven custom fortunes are served once each, in order, before the configured AI (or built-in deck) takes over. The shared deck position persists in `data/state.json`.
- The designated learning account can reply `fortune like` or `fortune dislike` after a fortune to tune future category choices; `fortune forget` clears that profile. This records explicit category feedback, not conversation text.
- Fortunes are always positive. Health, money, legal and death questions get a kind refusal before any AI call.
- It only names people who texted `fortune join`. `fortune stop` works for anyone.
- Everything it says is logged to `data/predictions.jsonl` on your Mac.

**Apple's terms.** iCloud's terms ban accessing the service "through any automated means" and unsolicited messages. A bot that only replies to friends who added it is low risk, but it is still automation on an Apple ID. Use a spare Apple ID and never use it for marketing.

## AI fortunes (optional)

Without a key it uses a built-in deck of happy fortunes. Set `ANTHROPIC_API_KEY` in `.env` to have Claude write them. Any model error falls back to the deck.

## Other setups

- **BlueBubbles:** `npm start` runs a webhook server for [BlueBubbles](https://bluebubbles.app). `scripts/verify-bluebubbles.ts` checks the connection.

## Tests

```bash
npm test
```

## License

Apache-2.0
