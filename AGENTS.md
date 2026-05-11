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

Adding a new platform or driver must be **one entry in a registry**, not edits across N files. If you find yourself writing the string `'twitch'`, `'youtube'`, `'youtube-api'`, `'kick'` or `'tiktok'` in any file outside the platform providers themselves, stop and ask whether the data should come from a registry instead. The same applies in the main process for cross-platform plumbing (status pushes, stats merging, account routing).

### Where the registries live

- **Renderer**: `src/renderer/platforms/registry.ts` — `PlatformProvider` interface (visuals + behavior), `getPlatformProviderOrFallback(id)`, `listPlatformProviders()`, `listWizardPlatformProviders()`. Each platform self-registers from its own file (`src/renderer/platforms/<id>-provider.tsx`); side-effect imports are collected in `src/renderer/platforms/register-all.ts`.
- **Main**: `src/main/platforms/registry.ts` — `MainPlatformProvider` interface for the runtime lifecycle (`connect`, `disconnect`, `getStatus`, `purgeStores`, `onStatusChange`). Providers are instantiated and registered in `app-context.ts`.
- **Overlay (browser-injected)**: `src/main/overlay-server.ts` ships its own `PLATFORMS` map inside the chat-overlay JS string — same shape, separate copy because the overlay runs in a popup window and can't import the renderer registry.

### Rules

1. **Single platform-metadata registry per side.** Per-platform display data (label, colors, badge classes, icon, border color, accent class, `hasNativeBadgeUrls`, `authorAtPrefix`, etc.) lives in the `PlatformProvider` entries — consumed by every renderer component that needs to depict it (chat row, viewer card, live-link button, status bar, chat-log filter chips). Components do not hold their own copy.

2. **No per-platform conditionals for styling or behavior in components.** Patterns like `platform === 'twitch' ? renderBadge() : renderAvatar()`, `if (platform === 'youtube' || platform === 'youtube-api') ...`, `if (twitchStatus === 'connected') list.push('twitch')` are smells. Drive UI from registry fields (e.g. `meta.hasNativeBadgeUrls`, `meta.authorAtPrefix`) or from the data itself (`Object.keys(platformLiveStats)` instead of typing each id out).

3. **State shape symmetric across platforms.** Platform connection state and per-stream stats live in `Record<PlatformId, ...>` maps:
   - `platformStatus: Partial<Record<PlatformId, PlatformLinkStatus>>`
   - `platformPrimaryChannel: Partial<Record<PlatformId, string | null>>`
   - `platformLiveStats: Partial<Record<PlatformId, Record<string /* channel/videoId */, unknown>>>`

   Same for push channels: there is **one** `pushPlatformStatus(platformId, status, channel)` / `pushPlatformLiveStats(platformId, channelKey, stats)` pair in `state-hub.ts`. **Bad**: `pushTwitchStatus`, `pushKickStatus`, `pushTiktokStatus`. **Good**: `pushPlatformStatus('twitch', status, channel)`. The renderer subscribes once via `onPlatformStatus` / `onPlatformLiveStats` — never per platform.

4. **Each platform id is independent — no driver families.** `youtube` (scraper) and `youtube-api` (Data API) are siblings logically, but the codebase treats them as fully separate ids: independent filter chips, independent cards, independent registry entries, independent state. Do **not** introduce a `family` field, a `'youtube' | 'youtube-api'` union helper, or `isYouTube`-style aggregator predicates. If you need to do "X for every YouTube driver", iterate the registry and filter — don't hardcode the membership. **Concurrent live streams from the same provider** (e.g. YouTube horizontal + vertical) share the same `platformId` and are differentiated by the `channelId` field on each message — exactly like multi-account Twitch. Never invent a parallel id (like the retired `youtube-v`) just to give the second stream a stable session key.

5. **Multi-channel support keys by `(platform, channelId)`.** The chat-log service indexes sessions by the compound key, and every adapter must stamp `channelId` on the `ChatMessage` objects it emits (Twitch: channel name; Kick: slug; TikTok: username; YouTube: videoId). Without `channelId`, the message gets dropped from the log — there is no implicit "any session" fallback.

6. **Fallback in the registry, not in callers.** When a platform id is unknown, `getPlatformProviderOrFallback()` returns a gray fallback. Callers must not write `?? PLATFORM_META.twitch` — that quietly mis-styles the unknown platform as Twitch.

7. **Adding a platform: one entry per side + the provider file itself.** Drop one entry in `src/renderer/platforms/<new>-provider.tsx` and add a line to `register-all.ts`; instantiate a `MainPlatformProvider` in `app-context.ts`. **No edits** to `ChatFeed`, `EventBanner`, `ObsStatsPanel`, `AppHeader`, `DashboardSummary`, `StatusBar`, `ConnectedAccounts`, `store.ts`, `shared/ipc.ts`, `state-hub.ts`, or per-platform sections of `app-context.ts` should be required to surface a new chat row / card / live-link / status push.

### Anti-regression checklist (run before committing platform-touching changes)

- `grep -rn "'twitch'\|'youtube'\|'kick'\|'tiktok'\|'youtube-api'" src/` returns hits **only** in:
  - the provider files (`src/renderer/platforms/*-provider.*` and the main-side equivalents)
  - the overlay-server `PLATFORMS` map
  - DB migrations
- No new `push<Platform>Status` or `set<Platform>Status` in `state-hub.ts` / `store.ts`.
- No new `<platform>Status` / `<platform>Channel` / `<platform>LiveStatsBy*` fields in `AppStore`.
- No new `is<Platform>` predicate or `<PLATFORM>_GROUP` array constant.
- Adding a new platform would touch ≤ 3 files (provider + barrel + main provider entry).

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
