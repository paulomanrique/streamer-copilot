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

## Platform-agnostic UI / state (no hardcoded platform lists)

Adding a new platform or driver must be **one entry in a registry**, not edits across N files. If you find yourself writing the string `'twitch'`, `'youtube'`, `'youtube-v'`, `'youtube-api'`, `'kick'` or `'tiktok'` in renderer code, stop and ask whether the data should come from a registry instead. The same applies in the main process for cross-platform plumbing (status pushes, stats merging, account routing).

### Rules

1. **Single platform-metadata registry.** Per-platform display data (label, colors, badge bg/text classes, SVG icon path, border color, accent class) lives in **one** registry consumed by every component. Components do not hold their own copy. Today the same data is duplicated across `ChatFeed.PLATFORM_META`, `ChatFeed.PLATFORM_BADGE_META`, `EventBanner.PLATFORM_META`, `EventBanner.getBorderColor`, `ObsStatsPanel.ICONS`, `AppHeader` icon constants, `ConnectedAccounts.STATUS_STYLE`. Goal: one source of truth, imported by all of them.

2. **No per-platform conditionals for styling or behavior in components.** Patterns like `platform === 'youtube-v' ? rose : red`, `isYouTube = platform === 'youtube' || platform === 'youtube-v' || platform === 'youtube-api'`, `if (twitchStatus === 'connected') list.push('twitch')` are smells. Drive UI from the registry (colors as fields, families as a group property) or from the data itself (`connectedPlatforms` derived by iterating the platforms list, not by typing each id out).

3. **State shape symmetric across platforms.** When you find yourself adding `twitchStatus` / `kickStatus` / `tiktokStatus` / `youtubeStreams` / `kickLiveStatsByChannel` / `tiktokLiveStatsByUsername` as parallel store fields, push them into a `Record<PlatformId, ...>` instead. Same for push channels: prefer `pushPlatformStatus(platformId, payload)` over `pushTwitchStatus`, `pushKickStatus`, `pushTiktokStatus`.

4. **Each platform id is independent — no driver families.** `youtube` (scraper) and `youtube-api` (API) are siblings logically, but the codebase treats them as fully separate platforms: independent filter chips, independent cards, independent registry entries, independent state. Do **not** introduce a `family` field, a `'youtube' | 'youtube-api'` union helper, or `isYouTube`-style aggregator predicates. If you need to do "X for both youtube drivers", iterate the registry and filter — don't hardcode the membership.

5. **Fallback in the registry, not in callers.** When a platform doesn't have a custom entry (e.g. unknown id), the registry returns a generic fallback. Callers must not write `?? PLATFORM_META.twitch` — that quietly mis-styles the unknown platform as Twitch.

6. **Adding a platform: one PR, two files max.** Drop one entry in the registry; if the new platform has unique semantics, register one provider on each side (renderer `registerPlatformProvider` + main `MainPlatformProvider`). No edits to `ChatFeed`, `EventBanner`, `ObsStatsPanel`, `AppHeader`, `DashboardSummary`, `StatusBar`, store, IPC channel list, or state-hub should be required just to surface a new chat / card / live-link.

### When to refactor vs. accept the smell

- **Greenfield code or new feature**: do it registry-first. Don't introduce new per-platform store fields, switch statements, or `PLATFORM_X_META` maps.
- **Touching existing per-platform code**: if the file already has the pattern, prefer pulling the next change into the registry over copy-pasting another branch. Worst case, leave a TODO referencing this rule and the planned extraction.
- **Don't extract speculatively.** The registry exists to eliminate the duplication that already hurts (UI metadata, status/state plumbing). It is not an excuse to abstract every per-platform behavior — adapters and providers still legitimately differ per platform.

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
