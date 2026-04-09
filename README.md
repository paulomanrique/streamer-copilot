# Streamer Copilot

Desktop Electron app for stream automation: unified chat, sound and voice commands, scheduled messages, OBS stats, tray behavior, startup preferences, packaging, and update delivery.

## Status

- Mockup and app shell are implemented.
- Runtime integrations for Twitch, YouTube, Kick, OBS, sounds, voice, scheduled messages, tray, startup, packaging, and auto-updates are in the repo.
- The only remaining open tracker item is visual approval of the mockup screens.

## Features

- Unified chat feed for Twitch, YouTube, and Kick
- Sound commands with permissions and cooldowns
- Voice commands with language selection and TTS playback
- Raffles with chat entry commands, staff triggers, and OBS wheel overlay
- Scheduled messages with interval and random window
- OBS WebSocket stats panel
- Profile selector and profile-scoped JSON storage
- Activity log
- Tray support and start-on-login preferences
- Electron Builder packaging for macOS, Windows, and Linux
- Auto-updater via GitHub releases

## Requirements

- Node.js 20+
- npm 10+
- OBS Studio 28+ with WebSocket enabled
- `better-sqlite3` rebuilt for Electron: `npm run rebuild:native`

## Development

```bash
npm install
npm run rebuild:native
npm run dev
```

Other commands:

```bash
npm run build
npm test
npm run test:e2e
npm run package
npm run package:mac
npm run package:win
npm run package:linux
```

## Mockup

Open `mockup/index.html` directly in a browser.

## Raffle Overlay

- Create a raffle from `Settings -> Raffles`
- Use `Open entries` to start collecting chat signups
- Add an OBS `Browser Source` and paste the overlay URL shown in the raffle page
- The app serves the wheel overlay on `127.0.0.1` and updates it live while the raffle runs
- `single-winner` picks one winner in a single spin
- `survivor-final` eliminates one entrant per spin until the top 2, then requires a final trigger

## Environment

Copy `.env.example` to `.env` and fill only what you need.

Platform adapters are intentionally tolerant of partial setup:

- Twitch can read chat and send messages only when credentials and channel are present.
- YouTube can poll/send only when `liveChatId` and auth are present.
- Kick can read public chat with slug/chatroom metadata and can send only when developer-app bot credentials are present.
- If a platform is not ready, scheduled dispatch skips it and logs the reason.

### Twitch

- `TWITCH_CHANNEL` or `TWITCH_CHANNELS`
- `TWITCH_USERNAME`
- `TWITCH_OAUTH_TOKEN`

### YouTube

- `YOUTUBE_LIVE_CHAT_ID`
- `YOUTUBE_ACCESS_TOKEN`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `YOUTUBE_CHANNEL_TITLE`

### Kick

- `KICK_CHANNEL_SLUG`
- `KICK_CHATROOM_ID`
- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

## Packaging And Updates

- Packaging config lives in `electron-builder.yml`
- CI packaging workflow lives in `.github/workflows/package.yml`
- Auto-updater is enabled only in packaged builds
- GitHub release publishing metadata is configured for `paulomanrique/streamer-copilot`

## Repository Structure

```text
mockup/                 Interactive HTML mockup
src/main/               Electron main process
src/preload/            IPC bridge
src/shared/             Shared types, schemas, IPC contracts
src/modules/            Domain services and repositories
src/platforms/          Twitch, YouTube, Kick adapters
src/renderer/           React renderer
tests/unit/             Vitest
tests/e2e/              Playwright
```
