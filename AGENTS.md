# AGENTS.md

Guide for AI agents working in this repository.

## Project

- **Name**: Streamer Copilot
- **Type**: Electron desktop app for stream automation
- **Purpose**: Unified chat (Twitch + YouTube + Kick), sound/voice commands, scheduled messages, OBS stats
- **Current phase**: Electron + React renderer with runtime integrations

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron ^35 |
| UI (Phase 2) | React 19 + TypeScript |
| Build | Vite + @vitejs/plugin-react |
| Styles | Tailwind CSS |
| Database | better-sqlite3 (SQLite) |
| State | Zustand |
| Validation | Zod |
| Twitch chat | tmi.js |
| YouTube chat | googleapis (polling) |
| Kick chat | pusher-js |
| OBS stats | obs-websocket-js v5 |
| Audio | Web Audio API (native) |
| TTS | Web Speech API + OS fallback |
| Packaging | electron-builder |
| Tests | Vitest + Playwright |

---

## Folder Structure

```
streamer-copilot/
├── src/                       ← Electron + React
│   ├── main/                  ← Electron main process
│   │   ├── index.ts           ← BrowserWindow, lifecycle
│   │   ├── app-context.ts     ← Service wiring + IPC handlers
│   │   └── state-hub.ts       ← State push to renderer
│   ├── preload/
│   │   └── index.ts           ← contextBridge → window.copilot
│   ├── shared/
│   │   ├── types.ts           ← All shared TypeScript types
│   │   ├── ipc.ts             ← CopilotApi interface + IPC_CHANNELS map
│   │   ├── schemas.ts         ← Zod schemas for IPC validation
│   │   └── constants.ts
│   ├── db/
│   │   ├── database.ts        ← SQLite init, path resolution
│   │   └── migrations.ts      ← Versioned SQL migration array
│   ├── modules/
│   │   ├── chat/              ← ChatService: aggregates adapters, emits events
│   │   ├── sounds/            ← SoundService: match, permission, cooldown
│   │   ├── voice/             ← VoiceService: match, permission, TTS
│   │   ├── scheduled/         ← SchedulerService: loop, jitter
│   │   ├── obs/               ← ObsService: obs-websocket-js, reconnect
│   │   └── settings/          ← SettingsService
│   ├── platforms/
│   │   ├── base.ts            ← PlatformChatAdapter interface
│   │   ├── twitch/adapter.ts  ← tmi.js
│   │   ├── youtube/adapter.ts ← googleapis polling
│   │   └── kick/adapter.ts    ← pusher-js
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx            ← Shell with sidebar navigation
│       ├── store.ts           ← Zustand root store
│       ├── pages/             ← Dashboard, SoundCommands, VoiceCommands, etc.
│       └── components/        ← ChatFeed, ObsStatsPanel, PermissionPicker, etc.
│
├── tests/
│   ├── unit/                  ← Vitest
│   └── e2e/                   ← Playwright
│
├── AGENTS.md                  ← This file
└── README.md
```

---

## Architecture Rules (Phase 2)

1. **IPC is the only bridge** between main process and renderer. Never import main process modules in the renderer.
2. **All IPC channels** are declared in `src/shared/ipc.ts`. Add there first, then implement both sides.
3. **All IPC inputs** from the renderer are validated with Zod (`src/shared/schemas.ts`) before being processed in the main process.
4. **Platform adapters** implement the `PlatformChatAdapter` interface from `src/platforms/base.ts`. Never call platform APIs directly from services.
5. **Sound files** live in `app.getPath('userData')/sounds/`. Never bundle user media in the app package.
6. **Tokens** are encrypted with `electron.safeStorage`. Never store them in plain text in SQLite.
7. The renderer **never accesses the filesystem directly**. Use IPC to request paths (dialog) and file contents.
8. **All configuration (commands, raffles, suggestions, platforms, OBS, etc.) is saved as per-profile JSON**, inside the profile directory. SQLite is used only for diagnostic logs and chat sessions. The goal is full portability — the streamer can copy the profile folder to another machine and everything works.

---

## Electron Runtime Notes

- Clear `ELECTRON_RUN_AS_NODE` in dev and start scripts.
- `better-sqlite3` must be recompiled for the Electron ABI: `npm run rebuild:native`.
- Vite dev server: `127.0.0.1:5174` with `strictPort: true`.
- OBS WebSocket must be enabled: Tools → WebSocket Server Settings.

---

## Platform Notes

### Twitch
- Uses tmi.js IRC over WebSocket.
- OAuth scopes: `chat:read`, `chat:edit`, `channel:read:subscriptions`, `moderator:read:followers`.
- Follower status requires a Helix API call; cache per session.
- Badges (`isModerator`, `isSubscriber`) available directly on the tmi.js message.

### YouTube
- Uses `googleapis` `youtube.liveChatMessages.list` with polling.
- Respect `pollingIntervalMillis` from the API response to avoid quota exhaustion.
- OAuth requires a Google Cloud project with YouTube Data API v3 enabled.
- Redirect URI: `http://127.0.0.1:PORT` (loopback, captured by Electron).
- "Follower" on YouTube = channel member (subscription level).

### Kick
- Uses pusher-js with Kick's public app key.
- No authentication required for reading public chat.
- Pusher channel: `chatrooms.{chatroomId}.v2`.
- Channel ID resolved via: `https://kick.com/api/v2/channels/{slug}`.
- **Warning**: unofficial API; may break without notice.
- No native "follower" concept; treat as "everyone".

### OBS
- Uses obs-websocket-js v5 (OBS WebSocket v5 protocol, OBS 28+).
- Stats collected: `GetStreamStatus`, `GetStats`, `GetCurrentProgramScene`.
- Reconnect with exponential backoff (max 30s).

---

## Permission System

```typescript
type PermissionLevel = 'everyone' | 'follower' | 'subscriber' | 'moderator' | 'broadcaster';

interface CommandPermission {
  allowedLevels: PermissionLevel[];  // e.g. ['subscriber', 'moderator']
  cooldownSeconds: number;           // global command cooldown
  userCooldownSeconds: number;       // per-user cooldown
}
```

Resolution order (highest level wins):
1. `broadcaster` — always allowed
2. `moderator`
3. `subscriber`
4. `follower`
5. `everyone`

Cooldowns tracked in memory in the main process: `Map<commandId, lastUsed>` and `Map<commandId:userId, lastUsed>`.

---

## Commands

```bash
npm install
npm run dev          # Electron in development mode
npm run build        # production build
npm run package      # generate installers
npm test             # unit tests (Vitest)
npm run test:e2e     # e2e tests (Playwright)
npm run lint         # ESLint
npm run rebuild:native  # recompile native modules for Electron
```

---

## GitHub Project

Issues and milestones: https://github.com/users/paulomanrique/projects/4

Milestones:
- **M0**: Foundations (Electron + React + TS setup)
- **M1**: Initial UI Prototype
- **M2**: Platform Chat Connections
- **M3**: Sound Commands
- **M4**: Voice Commands
- **M5**: Scheduled Messages
- **M6**: OBS Stats Panel
- **M7**: Polish & Release

---

## Commits

After every code change, a commit and push must be made.
