# Streamer Copilot

Desktop app for streamers — unified chat, sound/voice commands, scheduled messages, and OBS stats. Supports Twitch, YouTube, and Kick simultaneously.

## Features (MVP)

- **Unified Chat**: Real-time chat from Twitch, YouTube, and Kick in a single feed
- **Sound Commands**: `!command` triggers an MP3, with configurable permissions
- **Voice Commands**: `!voice <text>` speaks via TTS, configurable language and permissions
- **Scheduled Messages**: Auto-send messages on a timer (fixed or random window)
- **OBS Stats**: Live streaming stats via OBS WebSocket

## Development

### Phase 1 — Mockup

Open `mockup/index.html` directly in a browser. No build step required.

### Phase 2 — Electron App

```bash
npm install
npm run dev       # development
npm run build     # production build
npm run package   # create installers
npm test          # unit tests
npm run test:e2e  # e2e tests
```

## Platforms

- **Twitch**: IRC via tmi.js + OAuth
- **YouTube**: Live Chat API polling via googleapis
- **Kick**: Pusher WebSocket (public)

## Requirements

- OBS Studio 28+ with WebSocket Server enabled (Tools → WebSocket Server Settings)
- Node.js 20+
