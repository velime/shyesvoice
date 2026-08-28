# shyesvoice — Local Discord TTS Bot

A self-hosted Discord bot + dashboard that speaks text-to-speech into a voice
channel. It runs entirely on **your own machine** with **your own Discord
bot** — nothing is hosted or shared. Anyone can clone this repo, plug in
their own bot token through the dashboard, and have it running in a few
minutes, no code editing required.

**Features**

- Type a message in the dashboard → the bot speaks it in Discord (via
  Microsoft Edge's neural TTS, 400+ voices/languages)
- Auto-follow: the bot joins whenever a chosen Discord user enters a voice
  channel, and leaves when they do
- Manual control: pick any voice channel from the dashboard and Join/Leave
  on demand — no auto-follow required
- Repeat last message, clear the queue, live speech-rate slider, auto-speak
  on typing pause
- One-time setup screen in the dashboard — paste your bot token, no `.env`
  editing needed
- Auto-generated invite link so you (or anyone) can add the bot to a server

## Requirements

- Python 3.11+
- [FFmpeg](https://ffmpeg.org/download.html) installed and on your `PATH`
  (needed to play audio into Discord voice channels)
- Node.js 18+ (only if you want to build/dev the dashboard yourself)

## Quick start

One-time setup:

```bash
pip install -r requirements.txt
cd discord-tts-dashboard-ui && npm install && npm run build && cd ..
```

Then, every time you want to run it, one command:

```bash
python main.py
```

Open **http://127.0.0.1:5000** in your browser — Flask serves the built
dashboard itself, so there's no separate dev server to start. On first run
it drops you straight into **Bot Setup** — that's where you connect your own
bot (see below).

(If you're actively editing the dashboard's source, `cd
discord-tts-dashboard-ui && npm run dev` gives you hot-reload on
`http://localhost:5173` instead — talks to the same `python main.py` API.)

## Getting your own Discord bot (5 minutes)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**. Give it any name.
2. Open the **Bot** tab → **Reset Token** → copy the token. Treat it like a
   password — anyone with it can control your bot.
3. On the same **Bot** tab, scroll to **Privileged Gateway Intents** and
   enable **Server Members Intent** and **Voice State** related settings if
   listed. (Message Content is not needed.)
4. Open the dashboard → click the gear icon → paste the token into
   **Discord Bot Token** → **Save Settings**. The bot connects immediately —
   no restart needed.
5. Once saved, the Setup screen shows an **Invite Your Bot** link (built
   automatically from your token). Only a server's owner (or someone with
   *Manage Server*) can actually use it to add the bot — so if you're
   sending this link to someone else, they need that role. Open it, pick a
   server, and authorize.

### What the invite link asks for — and what it doesn't

The link only ever requests these three permissions:

| Permission | Why the bot needs it |
|---|---|
| **View Channels** | see the server's voice channels, so there's something to join |
| **Connect** | join a voice channel |
| **Speak** | play the generated TTS audio into it |

It does **not** request message access, server management, kicking/banning,
or Administrator — Discord's authorize screen will show the exact same
three permissions above, nothing more, so there's nothing to just take on
faith before clicking Authorize.

### Auto-follow a specific person (optional)

In Discord, enable **Developer Mode** (User Settings → Advanced), then
right-click the person you want the bot to follow and **Copy User ID**.
Paste that into **Target User ID** in Setup. Leave it empty if you'd rather
just pick channels manually from the dashboard's **Voice Channels** panel.

## Configuration storage

Settings you enter in the dashboard are saved to `config.json` in the
project root. That file is git-ignored — never commit it, since it holds
your bot token. A legacy `.env` file is still supported and auto-migrated
into `config.json` on first run if present.

## Security model

This is a single-user, localhost-only tool — there is no login screen
because the API isn't meant to be reachable by anyone but you:

- The local API (port 5000 by default) binds to `127.0.0.1` only. It is
  never reachable from other devices on your network, and `/config` — which
  returns your raw bot token so the Setup screen can show it — would be a
  real risk if it were.
- CORS only allows the dashboard's own known origins (itself, and the Vite
  dev server on `:5173`) — not arbitrary websites.
- There is no other authentication. Anyone with access to *this machine's*
  browser, or to a process running on it, can control the bot and read the
  token from `config.json`. Don't run this on a shared or multi-user
  computer with untrusted other users.
- Don't reverse-proxy or port-forward this API to the internet. If you ever
  need remote access, put real authentication in front of it first — this
  project doesn't provide any.

## Running on multiple servers

One bot can be a member of as many Discord servers as you invite it to —
just reuse the same invite link for each one. The dashboard's **Voice
Channels** list and auto-follow both already work across every server the
bot is in (channels are grouped by server name in the list; auto-follow
triggers no matter which of the bot's servers the target user joins a
channel in).

The one limit: the bot can only be **actively connected to one voice
channel at a time**, across all servers combined — same as a person only
being in one voice call at once. If it's speaking in Server A and you (or
the auto-follow target) join a channel in Server B, it leaves A and joins
B; it can't speak in both simultaneously. Running two fully independent,
simultaneous voice connections in two different servers would need a
separate bot process (a second token, a second `config.json`) rather than
one instance doing both at once.

## Troubleshooting

- **"FFmpeg not found" / no audio in voice channel** — install FFmpeg and
  make sure `ffmpeg` works from a terminal.
- **Bot won't come online / `PrivilegedIntentsRequired` error in the
  console** — enable the intents in step 3 above, then re-save the token in
  Setup to reconnect.
- **Bot online but never joins a channel** — either set a Target User ID in
  Setup, or use the **Voice Channels** panel on the dashboard to Join
  manually.
- **Dashboard shows "System Offline" but console says the bot connected** —
  give the dashboard a few seconds; it polls status every 5 seconds.

## License

MIT — see [LICENSE](LICENSE).
