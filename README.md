# Fortune Cookie 🥠

Your group chat's fortune cookie. An open-source iMessage bot: add it to a group chat, text `fortune`, and it cracks open a happy fortune with lucky numbers. 3 a day each, just for fun.

**Try it on any phone:** https://bhavya-in-sf.github.io/fortune-cookie/

## How it works

Apple has no bot API for iMessage. So Fortune Cookie runs on a Mac that is signed into its own Apple ID and phone number, and it shows up in Messages like any other contact. Friends just text it or add it to a group from their iPhone. They install nothing.

| Who | Needs |
| --- | --- |
| Friends using it | Any iPhone with iMessage. Nothing to install. |
| You, hosting it | A Mac that stays on, a spare Apple ID, Node 22.18+ |
| Its own phone number (optional) | A spare iPhone with a SIM, signed into the same Apple ID |

## Try it in 10 seconds (no Mac setup, no key)

```bash
git clone https://github.com/bhavya-in-sf/fortune-cookie.git
cd fortune-cookie
npm install
npm run chat
```

Type `fortune will saturday be fun?`. Use `/as maya` to switch person and `/quit` to leave.

## Commands

| Text | What happens |
| --- | --- |
| `fortune` or `🥠` | A happy fortune |
| `fortune <question>` | A fortune about your question |
| `fortune join <name>` | You are included in the Sunday group fortune |
| `fortune log` | The last 5 things it said in this chat |
| `fortune stop` / `fortune resume` | It goes quiet for you, or comes back |
| `fortune help` | This list |

## Run it for real

1. **Make an Apple ID for the bot** at account.apple.com, for example `yourcookie@icloud.com`.
2. **Sign the Mac's Messages app into it.** Messages > Settings > iMessage. If you sign out your own account, your texts stop arriving on that Mac, so a spare Mac or a second macOS user is best.
3. **Give it a name and photo.** Messages > Settings > General > Share Name and Photo. Name: Fortune Cookie. Photo: `brand/logo.png`.
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

`BOT_ACCOUNT=personal` (the default) is for running it on your own Apple ID: it then only answers messages that start with `fortune` or 🥠, and never greets groups or replies to ordinary texts.

## Daily cap and guardrails

- 3 fortunes per person per day. `DAILY_CAP` changes it, `0` means unlimited.
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
