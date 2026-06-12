# AGENTS.md

Guide for AI agents working in this repository.

## Project

- **Name**: Streamer Copilot
- **Type**: Electron desktop app for stream automation
- **Purpose**: Unified chat (Twitch + YouTube + Kick + TikTok), sound/voice/text commands, scheduled messages, raffles, polls, music requests, suggestions, welcome messages, OBS overlays and stats

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Electron ^41 (ceiling — better-sqlite3 cannot build against Electron 42's V8) |
| UI | React 19 + TypeScript |
| Build | Vite + @vitejs/plugin-react |
| Styles | Tailwind CSS v4 (@tailwindcss/vite) |
| Database | better-sqlite3 (SQLite) |
| State | Zustand |
| Validation | Zod |
| Twitch chat | tmi.js |
| YouTube chat | two drivers: youtubei.js scraper + googleapis Data API (polling) |
| Kick chat | hidden BrowserWindow scraping the popout chat; sending via popout DOM or @nekiro/kick-api |
| TikTok chat | tiktok-live-connector (read-only) |
| OBS stats | obs-websocket-js v5 |
| Audio | Web Audio API (native) |
| TTS | Web Speech API + Google TTS fallback (@sefinek/google-tts-api) |
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
│   │   ├── state-hub.ts       ← State push to renderer
│   │   ├── overlay-server.ts  ← Local HTTP server for OBS overlays
│   │   ├── adapter-factory.ts ← Builds platform adapters from settings
│   │   ├── music-player.ts / music-stream-resolver.ts ← Music requests
│   │   ├── updater.ts         ← electron-updater wiring
│   │   └── platforms/registry.ts ← MainPlatformProvider registry
│   ├── preload/
│   │   └── index.cts          ← contextBridge → window.copilot
│   ├── shared/
│   │   ├── types.ts           ← All shared TypeScript types
│   │   ├── ipc.ts             ← CopilotApi interface + IPC_CHANNELS map
│   │   ├── schemas.ts         ← Zod schemas for IPC validation
│   │   ├── platform.ts        ← PlatformId, PlatformRole
│   │   ├── moderation.ts      ← ModerationApi, PlatformCapabilities
│   │   └── constants.ts
│   ├── db/
│   │   ├── database.ts        ← SQLite init, path resolution
│   │   ├── json-store.ts      ← Atomic JSON file persistence
│   │   └── migrations.ts      ← Versioned SQL migration array
│   ├── modules/               ← One folder per backend service
│   │   ├── base/              ← JsonSettingsStore<T> base class
│   │   ├── chat/              ← ChatService: aggregates adapters, emits events
│   │   ├── chat-log/          ← Per-session chat persistence
│   │   ├── commands/          ← Permission resolution (permission-utils)
│   │   ├── sounds/ voice/ text/ scheduled/ welcome/
│   │   ├── raffles/ polls/ suggestions/ music/
│   │   ├── subscriber-tiers/ user-lists/ accounts/
│   │   ├── overlays/          ← Overlay defaults + preferences stores
│   │   ├── obs/               ← ObsService: obs-websocket-js, reconnect
│   │   ├── logs/ settings/
│   ├── platforms/
│   │   ├── base.ts            ← PlatformChatAdapter interface
│   │   ├── secret-storage.ts  ← safeStorage-encrypted credential files
│   │   ├── twitch/            ← tmi.js adapter + moderation + multi-account
│   │   ├── youtube/           ← scraper-adapter (youtubei.js) + api-adapter (Data API)
│   │   ├── kick/              ← popout-chat scraper + OAuth send
│   │   └── tiktok/            ← tiktok-live-connector (read-only)
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx            ← Shell with sidebar navigation
│       ├── store.ts           ← Zustand root store
│       ├── pages/             ← SoundCommands, Raffles, Polls, Overlays, etc.
│       ├── components/        ← ChatFeed, ObsStatsPanel, PermissionPicker, etc.
│       ├── platforms/         ← PlatformProvider registry (see below)
│       ├── modules/           ← RendererSettingsModule registry (see below)
│       ├── hooks/             ← useAudioQueue, etc.
│       └── i18n/              ← pt-BR / en-US UI strings
│
├── tests/
│   ├── unit/                  ← Vitest
│   └── e2e/                   ← Playwright
│
├── AGENTS.md                  ← This file
└── README.md
```

---

## Architecture Rules

1. **IPC is the only bridge** between main process and renderer. Never import main process modules in the renderer.
2. **All IPC channels** are declared in `src/shared/ipc.ts`. Add there first, then implement both sides.
3. **All IPC inputs** from the renderer are validated with Zod (`src/shared/schemas.ts`) before being processed in the main process.
4. **Platform adapters** implement the `PlatformChatAdapter` interface from `src/platforms/base.ts`. Never call platform APIs directly from services.
5. **Sound files** live in the active profile directory (fallback: `app.getPath('userData')/sounds/` when no profile is active). Never bundle user media in the app package. **Media references stored in profile configs must be relative to the profile root** — absolute paths break the moment the folder is copied to another machine/drive. Resolution goes through `resolveProfileMediaPath` in `app-context.ts` (which also rescues legacy absolute paths by basename).
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

## Module-agnostic settings UI (renderer)

Like platforms, each user-facing module (sounds, polls, raffles, suggestions, text/music/welcome/overlays/obs/...) registers itself with a renderer module registry — `SettingsWorkspace` reads the registry to populate the sidebar and dispatch page renders.

### Where the registry lives

- `src/renderer/modules/registry.ts` — `RendererSettingsModule` interface (id, group, labelKey?, fallbackLabel, icon, SettingsPage), `registerRendererModule(...)`, `listRendererModules()`.
- `src/renderer/modules/<name>-settings-module.tsx` — one tiny file per module that calls `registerRendererModule({...})`. Each module imports the corresponding page component from `src/renderer/pages/`.
- `src/renderer/modules/register-all.ts` — side-effect barrel listing every entry file. `SettingsWorkspace` imports this barrel; nothing else does.

### Rules

1. **One registration file per module.** A module's settings module entry lives next to its peers in `src/renderer/modules/`. Adding a new module = one new file + one line in `register-all.ts`. No edits to `SettingsWorkspace`, no new branch in the sidebar/dispatch.

2. **Page components must be props-free.** Anything a module needs (settings blob, store state, callbacks) comes from `useAppStore` and `window.copilot` directly. The registry can only render `ComponentType` (no props) — keeps `SettingsWorkspace` from leaking module-specific data through props.

3. **Persistence inherits `JsonSettingsStore<T>`.** Per-profile JSON settings stores live in `src/modules/<name>/<name>-settings-store.ts` and extend `JsonSettingsStore<T>` from `src/modules/base/settings-store.ts`. Subclasses declare `defaults()`, `parse(raw)`, and optionally `normalize(input)`. Don't reimplement the readFile + JSON.parse + mkdir + writeFile dance — that's exactly what the base owns.

4. **Hardcoded entries are temporary.** Today the App group (General, Chat Logs, Event Log, Profiles), the Platforms entry, and the Voice page stay hardcoded inside `SettingsWorkspace` because each still needs ambient props from `App.tsx`. New modules should not extend this list — make them props-free and route through the registry.

5. **No new per-module enumeration outside the registry.** Patterns like `const SETTINGS_VIEWS = ['sound', 'polls', ...]` or `if (view === 'polls')` are smells. Iterate `listRendererModules()` instead.

### Main-process modules: still hardcoded, watch for the smell

The main process keeps its module wiring (service instantiation + IPC handler registration) hardcoded inside `app-context.ts`. A parallel `MainModuleRegistry` hasn't been built yet, so adding a backend module still touches `app-context.ts`, `shared/ipc.ts`, and the module's own service files. When you do touch this area, lean toward registering the next module behind a uniform interface rather than copy-pasting another `ipcMain.handle(...)` block — even before the registry exists.

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
- OAuth scopes (see `app-context.ts`): `chat:read`, `chat:edit`, plus moderation scopes (`moderator:manage:banned_users`, `moderator:manage:chat_messages`, `moderator:manage:chat_settings`, `moderator:manage:shoutouts`, `channel:manage:raids`, `channel:manage:moderators`, `channel:manage:vips`).
- Badges (`isModerator`, `isSubscriber`) available directly on the tmi.js message.

### YouTube
Two independent drivers (separate platform ids — see the platform-agnostic rules below):
- **`youtube` (scraper)**: `youtubei.js` — no API key or OAuth needed; reads live chat and can send via the logged-in session.
- **`youtube-api` (Data API)**: `googleapis` `youtube.liveChatMessages.list` with polling.
  - Respect `pollingIntervalMillis` from the API response to avoid quota exhaustion.
  - OAuth requires a Google Cloud project with YouTube Data API v3 enabled; scopes `youtube.force-ssl` + `youtube.readonly` (see `api-auth.ts`).
  - Redirect URI: `http://127.0.0.1:33020` (loopback, captured by a local HTTP server).
- "Follower" on YouTube = channel member (subscription level).

### Kick
- Reads chat by loading the popout chat (`kick.com/popout/{slug}/chat`) in a hidden `BrowserWindow` and scraping the DOM (no pusher-js).
- Sends messages through the popout DOM when the user is logged in; falls back to the official OAuth API via `@nekiro/kick-api` (`id.kick.com`, scopes per https://docs.kick.com/getting-started/scopes).
- **Warning**: DOM scraping is unofficial; may break without notice.
- No native "follower" concept; treat as "everyone".

### TikTok
- Uses `tiktok-live-connector` with EulerStream signing.
- **Read-only**: `sendMessage` throws by design; chat send is not supported.

### OBS
- Uses obs-websocket-js v5 (OBS WebSocket v5 protocol, OBS 28+).
- Stats collected: `GetStreamStatus`, `GetStats`, `GetCurrentProgramScene`.
- Reconnect with exponential backoff (max 30s).

---

## Permission System

```typescript
type PermissionRoleId =
  | 'everyone' | 'follower' | 'subscriber' | 'vip' | 'moderator' | 'broadcaster'
  | `tier:${string}`;  // exact subscriber-tier match, no hierarchy

type PermissionEntry =
  | { kind: 'platform-role'; platform: PlatformId; role: PermissionRoleId }
  | { kind: 'list'; listId: string };  // membership in a custom user list

interface CommandPermission {
  entries: PermissionEntry[];  // OR evaluation: user passes if ANY entry matches
  cooldownSeconds: number;     // global command cooldown
  userCooldownSeconds: number; // per-user cooldown
}
```

- **Hierarchy** (for `platform-role` entries, via `PERMISSION_RANK` in `src/modules/commands/permission-utils.ts`): `everyone(0) < follower(1) < subscriber(2) < vip(3) < moderator(4) < broadcaster(5)`. Selecting `vip` admits VIP, Moderator, and Broadcaster.
- **`tier:<id>` is exact-match**, not hierarchical — selecting Tier 2 does NOT grant Tier 3; the streamer adds every tier they want to allow.
- **`list` entries** match against user lists (`(platform, userId)` pairs) managed in the User Lists module.

Cooldowns tracked in memory in the main process: `Map<commandId, lastUsed>` and `Map<commandId:userId, lastUsed>`, cleared on profile switch.

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
npm run validate:ipc # check IPC channel/schema/preload sync
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

After every relevant code change, a commit and push **must** be made — **without asking for permission**. This includes:

- New features, bug fixes, refactors, dependency updates, schema changes, test additions.
- Any change that leaves the working tree in a coherent state (tsc/lint/tests OK).

Do **not** batch unrelated changes into one commit. If a session produced multiple logically-separate changes (e.g. bug fix + new feature), commit them separately, in order. The default cadence is "one focused chunk = one commit + push".

Skip the commit only when:
- The work is incomplete and would leave the tree broken (tsc errors, failing tests).
- The user is mid-conversation about the design and the change is exploratory.

Do not ask "posso commitar?" / "want me to commit?" — just commit and push, and report the SHA in the response.
