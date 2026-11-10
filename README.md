# Fortune Cookie 🥠

Your group chat's fortune cookie. An open-source iMessage bot: add it to a group chat, text `fortune`, and it cracks open a happy fortune with lucky numbers. 6 a day each, just for fun.

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
   Approve the prompt that lets Terminal control Messages. `npm run mac` keeps the Mac awake with `caffeinate` while it runs and lets it sleep again when you stop it (`KEEP_AWAKE=0` turns this off).

`BOT_ACCOUNT=personal` (the default) is for running it on your own Apple ID: it answers messages containing a fortune trigger and never greets groups or replies to ordinary texts.

Apple controls how this identity appears on each recipient's device. Recipients may see the phone number until they accept the shared contact photo, have the bot saved as a contact, or enable name and photo sharing; the bot cannot force every iPhone to replace a number with “Fortune Cookie.”

## Daily cap and guardrails

- Everyone gets `DAILY_CAP` fortunes per day (default 6); `0` means unlimited. Each person keeps the cap they started with (saved in `data/state.json`), so changing `DAILY_CAP` later only affects new people. Numbers listed in `UNLIMITED_PHONES` in `.env` skip the cap, and `LEARNING_PHONE` is the one number whose `fortune like` and `fortune dislike` ratings are remembered. Both stay private in `.env`.
- Each user has a randomized 5–10 second cooldown between generated fortunes, and every reply waits 1–2 seconds before sending so it reads like someone typing.
- Seven custom fortunes are served once each, in order, before the configured AI (or built-in deck) takes over. The shared deck position persists in `data/state.json`.
- The designated learning account can reply `fortune like` or `fortune dislike` after a fortune to tune future category choices; `fortune forget` clears that profile. This records explicit category feedback, not conversation text.
- Fortunes are always positive. Health, money, legal and death questions get a kind refusal before any AI call.
- It only names people who texted `fortune join`. `fortune stop` works for anyone.
- Everything it says is logged to `data/predictions.jsonl` on your Mac.

**Apple's terms.** iCloud's terms ban accessing the service "through any automated means" and unsolicited messages. A bot that only replies to friends who added it is low risk, but it is still automation on an Apple ID. Use a spare Apple ID and never use it for marketing.

## AI fortunes (optional)

Without a key it uses a built-in deck of happy fortunes. Set `ANTHROPIC_API_KEY` in `.env` to have Claude write them. Any model error falls back to the deck.

## Keep it running

`npm run mac` stops when you close Terminal. To run it in the background instead, starting at login and restarting if it crashes:

1. System Settings > Privacy & Security > Full Disk Access > **+**, press Cmd+Shift+G and add your `node` binary (`readlink -f $(which node)` prints it). Re-add it after upgrading Node.
2. `npm run service:install`

`npm run service:status`, `service:restart` (after editing `.env`) and `service:uninstall` manage it. Output goes to `data/bot.log`. Keep the Mac plugged in, awake and signed in to Messages.

## Troubleshooting

`npm run doctor` (in a terminal with Full Disk Access) shows the last 8 messages the Mac received and whether the bot would answer each one, or why not. If your texts are missing from that list, they are not reaching this Mac: check Messages > Settings > iMessage and that you are texting an address listed there.

## Other setups

- **BlueBubbles:** `npm start` runs a webhook server for [BlueBubbles](https://bluebubbles.app). `scripts/verify-bluebubbles.ts` checks the connection.

## Measure your own bot

```bash
npm run stats            # last 14 days
npm run stats -- --days 30
npm run stats -- --json
```

It reads `data/` on your Mac and prints counts only: people who texted it, chats (groups versus direct), how many asked for a fortune, groups where two or more people asked, and who came back on another day. Numbers in `UNLIMITED_PHONES` are left out so your own testing does not inflate it.

New people and new chats are counted from the first message after you update. The bot writes one line per first sighting to `data/events.jsonl`, using hashes keyed with a random secret kept on your Mac, instead of phone numbers. Nothing leaves your Mac, and there is no telemetry.

Apple gives bots no "was added to a group" event. A person or chat counts once they use a trigger (on a personal Apple ID the bot records nothing about chats that never do).

## Tests

```bash
npm test
```

## License

Apache-2.0
