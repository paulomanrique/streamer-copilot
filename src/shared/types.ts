import type { PlatformRole, ChatMessageMetadata } from './platform.js';

export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
}

export interface GeneralSettings {
  startOnLogin: boolean;
  minimizeToTray: boolean;
  eventNotifications: boolean;
  recommendationTemplate: string;
  diagnosticLogLevel: EventLogLevel;
  /** R3: HTTP/WS port for the overlay server (browser sources, /now-playing, etc.). */
  overlayServerPort: number;
}

export type AppLanguage = 'pt-BR' | 'en-US';

export interface ProfileSettings {
  appLanguage: AppLanguage;
}

export type PermissionLevel = 'everyone' | 'follower' | 'subscriber' | 'vip' | 'moderator' | 'broadcaster';

/**
 * Hierarchical platform role id. `tier:<id>` is a special case that matches
 * exactly when `message.role?.subscriberTier === id` — no hierarchy
 * (selecting Tier 2 does NOT implicitly grant Tier 3; the streamer adds
 * every tier they want to allow).
 *
 * The remaining values (everyone/follower/vip/moderator/broadcaster)
 * follow the `PERMISSION_RANK` hierarchy in `permission-utils.ts`:
 * selecting `vip` admits VIP, Moderator and Broadcaster.
 */
export type PermissionRoleId =
  | 'everyone'
  | 'follower'
  | 'subscriber'
  | 'vip'
  | 'moderator'
  | 'broadcaster'
  | `tier:${string}`;

/**
 * Single entry inside a permission list. Can be:
 *  - A platform-specific role (`platform-role`): `{ kind, platform, role }`.
 *  - A reference to a user list (`list`): `{ kind, listId }`.
 *
 * OR evaluation: the user passes if ANY entry matches.
 */
export type PermissionEntry =
  | { kind: 'platform-role'; platform: PlatformId; role: PermissionRoleId }
  | { kind: 'list'; listId: string };

export interface CommandPermission {
  entries: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
}

/** Tier entry for a channel's paid-membership catalog. `order` is
 *  increasing (1 = lowest). Still used by the catalog + UI; `order` no
 *  longer influences the permission gate (the new UI picks individual
 *  tiers) but remains useful for ordered display in settings. */
export interface SubscriberTierEntry {
  id: string;
  label: string;
  order: number;
  source: 'builtin' | 'scraped' | 'api';
}

export interface SubscriberTierCatalog {
  byPlatform: Partial<Record<PlatformId, SubscriberTierEntry[]>>;
}

/** Member of a user list — pair of (platform, native userId).
 *  `displayName` is cached for the UI but doesn't participate in matching. */
export interface UserListMember {
  platform: PlatformId;
  userId: string;
  displayName: string;
  /** ISO timestamp de quando foi adicionado. */
  addedAt: string;
}

export interface UserList {
  id: string;
  name: string;
  members: UserListMember[];
  createdAt: string;
  updatedAt: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
}

/**
 * Open enum: TS still autocompletes known platforms in IDEs, switch statements
 * over the known set keep working, but the type accepts any string so adapter
 * modules (including third-party plugins) can declare their own platformId
 * without editing the core type. Validation at the IPC boundary is shape-only
 * (`z.string()` + slug regex), not membership in this list.
 */
export type PlatformId = 'twitch' | 'youtube' | 'youtube-api' | 'kick' | 'tiktok' | (string & {});

/**
 * Unified link status for every platform connection. Per-platform unions
 * (TwitchConnectionStatus, KickConnectionStatus, TikTokConnectionStatus) are
 * legacy and being phased out — new code consumes this single union via the
 * symmetric `platformStatus: Record<PlatformId, PlatformLinkStatus>` state
 * field. Keep the union open enough to cover platform-specific states
 * (TikTok's 'captcha') so the core plumbing never has to special-case.
 */
export type PlatformLinkStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'captcha';

/** Snapshot row returned by the unified `platformsGetStatuses` IPC. */
export interface PlatformLinkSnapshot {
  status: PlatformLinkStatus;
  primaryChannel: string | null;
}

export type ChatBadge = 'moderator' | 'subscriber' | 'member' | 'vip' | 'broadcaster' | (string & {});
export type ChatMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'emote'; name: string; imageUrl?: string };

export interface ChatMessage {
  id: string;
  platform: PlatformId;
  author: string;
  content: string;
  contentParts?: ChatMessageContentPart[];
  badges: ChatBadge[];
  timestampLabel: string;
  color?: string;
  avatarUrl?: string;
  badgeUrls?: string[];
  streamLabel?: string;
  /** True for messages that were already in chat when the adapter connected — commands and welcome messages are skipped for these. */
  isHistory?: boolean;
  /** Plug-and-play platform role, populated incrementally by adapters (R1). */
  role?: PlatformRole;
  /** Permission level pre-resolved by the adapter (R1). */
  unifiedLevel?: PermissionLevel;
  /** Rich event metadata (superchat amount, sub tier, gift count, etc). */
  metadata?: ChatMessageMetadata;
  /** R6: id of the PlatformAccount this message came from. Lets the UI
   *  disambiguate when more than one account from the same platform is connected. */
  accountId?: string;
  /** Platform-native user id of the author. Required for per-message moderation
   *  (ban/timeout) since most platform APIs key off user id, not username. */
  userId?: string;
  /** Platform-native message id, used by moderation APIs (delete). The local
   *  `id` field is generated by the renderer/adapter and is *not* portable
   *  across systems; this one is. */
  platformMessageId?: string;
  /** Per-stream identifier the chat-log service uses to route this message
   *  to the right `(platform, channel)` session. For most platforms this is
   *  the channel/slug/username; for YouTube scrape it's the videoId so
   *  concurrent live streams each get their own log row. Optional only for
   *  back-compat — adapters should always populate it. */
  channelId?: string;
}

export interface TwitchLiveStats {
  viewerCount: number;
  followerCount: number;
  isLive: boolean;
  hypeTrain?: {
    level: number;
    progress: number;
    goal: number;
    expiry: string; // ISO timestamp
  } | null;
}

export interface TikTokLiveStats {
  viewerCount: number;
}

export interface KickLiveStats {
  viewerCount: number;
  followerCount: number | null;
  subscriberCount: number | null;
  isLive: boolean;
}

export type StreamEventType = 'subscription' | 'superchat' | 'raid' | 'cheer' | 'follow' | 'gift';

export interface StreamEvent {
  id: string;
  platform: PlatformId;
  type: StreamEventType;
  author: string;
  amount?: number;
  message?: string;
  timestampLabel: string;
  streamLabel?: string;
}

export interface YouTubeStreamInfo {
  videoId: string;
  /** Which YouTube driver produced this stream — the scraper emits
   *  'youtube' for every concurrent live, the Data API driver emits
   *  'youtube-api'. The renderer uses this to pick the right viewer-card
   *  color and to surface a per-driver filter chip. */
  platform: 'youtube' | 'youtube-api';
  channelHandle: string | null;
  label: string;
  viewerCount: number | null;
  subscriberCount: number | null;
  liveUrl: string;
}

export interface PlatformConnectionStatus {
  platform: PlatformId;
  label: string;
  connected: boolean;
}

export interface ObsStatusSnapshot {
  connected: boolean;
  sceneName: string;
  uptimeLabel: string;
}

export interface ObsStatsSnapshot extends ObsStatusSnapshot {
  bitrateKbps: number;
  fps: number;
  cpuPercent: number;
  ramMb: number;
  droppedFrames: number;
  droppedFramesRender: number;
}

export interface ObsConnectionSettings {
  host: string;
  port: number;
  password: string;
}

export type EventLogLevel = 'info' | 'warn' | 'error';

export interface EventLogEntry {
  id: number;
  level: EventLogLevel;
  category: string;
  message: string;
  metadataJson: string | null;
  createdAt: string;
}

export interface EventLogFilters {
  level?: EventLogLevel | 'all';
  category?: string;
  query?: string;
}

export interface ScheduledMessage {
  id: string;
  message: string;
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
  lastSentAt: string | null;
}

export interface ScheduledMessageUpsertInput {
  id?: string;
  message: string;
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
}

export interface ScheduledMessageDeleteInput {
  id: string;
}

export interface ScheduledStatusItem {
  id: string;
  nextFireAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastResult: 'sent' | 'skipped' | 'failed' | null;
  lastResultDetail: string | null;
  effectiveTargets: PlatformId[];
}

export interface ScheduledAvailableTargets {
  supported: PlatformId[];
  connected: PlatformId[];
}

export interface CommandSchedule {
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
  lastSentAt: string | null;
}

export interface CommandScheduleUpsertInput {
  intervalSeconds: number;
  randomWindowSeconds: number;
  targetPlatforms: PlatformId[];
  enabled: boolean;
}

export interface VoiceCommand {
  id: string;
  trigger: string;
  template: string | null;
  language: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  announceUsername: boolean;
  characterLimit: number;
  enabled: boolean;
}

export interface VoiceCommandUpsertInput {
  id?: string;
  trigger: string;
  template: string | null;
  language: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  announceUsername: boolean;
  characterLimit: number;
  enabled: boolean;
}

export interface VoiceCommandDeleteInput {
  id: string;
}

export interface VoiceSpeakPayload {
  text: string;
  lang: string;
}

export interface TextSettings {
  defaultCooldownSeconds: number;
  defaultUserCooldownSeconds: number;
}

export interface TextCommand {
  id: string;
  name: string;
  trigger: string | null;
  response: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number | null;
  userCooldownSeconds: number | null;
  commandEnabled: boolean;
  schedule: CommandSchedule | null;
  enabled: boolean;
}

export interface TextCommandUpsertInput {
  id?: string;
  name: string;
  trigger: string | null;
  response: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number | null;
  userCooldownSeconds: number | null;
  commandEnabled: boolean;
  schedule: CommandScheduleUpsertInput | null;
  enabled: boolean;
}

export interface TextCommandDeleteInput {
  id: string;
}

export interface TextCommandResponsePayload {
  platform: PlatformId;
  content: string;
}

export interface RendererVoiceCapabilities {
  speechSynthesisAvailable: boolean;
}

export interface WelcomeUserOverride {
  username: string;
  messageTemplate: string | null;
  soundFilePath: string | null;
}

export interface WelcomeSettings {
  enabled: boolean;
  messageTemplate: string;
  soundFilePath: string | null;
  userOverrides: WelcomeUserOverride[];
}

export interface MusicRequestSettings {
  enabled: boolean;
  volume: number;
  maxQueueSize: number;
  maxDurationSeconds: number;
  requestTrigger: string;
  skipTrigger: string;
  queueTrigger: string;
  cancelTrigger: string;
  requestPermissions: PermissionEntry[];
  skipPermissions: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
}

export interface MusicQueueItem {
  id: string;
  videoId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  requestedBy: string;
  platform: PlatformId;
  requestedAt: string;
}

export interface MusicPlayerState {
  currentItem: MusicQueueItem | null;
  queue: MusicQueueItem[];
  isPlaying: boolean;
  /** R4: streamable audio URL resolved on the main side via youtubei.js. */
  streamUrl: string | null;
  /** R4: 0..1 volume the browser source should apply. */
  volume: number;
  /** R4: true when at least one /now-playing OBS browser source is connected via WS. */
  browserSourceConnected: boolean;
}

export interface MusicPlayCommand {
  itemId: string;
  videoId: string;
  title: string;
  volume: number;
  /** R4: optional metadata for the /now-playing browser source. */
  thumbnailUrl?: string | null;
  requestedBy?: string | null;
  durationSeconds?: number;
}

export interface MusicPlayerEvent {
  type: 'ended' | 'error';
  itemId: string;
  errorCode?: number;
  /** Mensagem humana com a causa do erro — propagada pro event log pra
   *  diagnosticar falhas de stream resolver (ytdl), CSP do OBS browser
   *  source, autoplay blocked, etc. Without it the event log only shows
   *  `errorCode: -1` with no hint at what actually failed. */
  errorMessage?: string;
}

export interface SoundSettings {
  defaultCooldownSeconds: number;
  defaultUserCooldownSeconds: number;
}

export interface SoundCommand {
  id: string;
  name: string;
  trigger: string | null;
  filePath: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number | null;
  userCooldownSeconds: number | null;
  commandEnabled: boolean;
  schedule: CommandSchedule | null;
  enabled: boolean;
}

export interface SoundCommandUpsertInput {
  id?: string;
  name: string;
  trigger: string | null;
  filePath: string;
  permissions: PermissionEntry[];
  cooldownSeconds: number | null;
  userCooldownSeconds: number | null;
  commandEnabled: boolean;
  schedule: CommandScheduleUpsertInput | null;
  enabled: boolean;
}

export interface SoundCommandDeleteInput {
  id: string;
}

export interface SoundPlayPayload {
  filePath: string;
}

export type RaffleMode = 'single-winner' | 'survivor-final';
export type RaffleStatus = 'draft' | 'collecting' | 'ready_to_spin' | 'spinning' | 'paused_top2' | 'completed' | 'cancelled';
export type RaffleControlAction = 'open_entries' | 'close_entries' | 'spin' | 'finalize' | 'cancel' | 'reset';
export type RaffleRoundActionType = 'spin' | 'finalize';
export type RaffleRoundResultType = 'winner' | 'eliminated';

export interface Raffle {
  id: string;
  title: string;
  entryCommand: string;
  mode: RaffleMode;
  status: RaffleStatus;
  entryDeadlineAt: string | null;
  acceptedPlatforms: PlatformId[];
  staffTriggerCommand: string;
  openAnnouncementTemplate: string;
  eliminationAnnouncementTemplate: string;
  winnerAnnouncementTemplate: string;
  spinSoundFile: string | null;
  eliminatedSoundFile: string | null;
  winnerSoundFile: string | null;
  winnerEntryId: string | null;
  top2EntryIds: string[];
  entriesCount: number;
  activeEntriesCount: number;
  lastSpinAt: string | null;
  currentRound: number;
  overlaySessionId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RaffleEntry {
  id: string;
  raffleId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  sourceMessageId: string | null;
  enteredAt: string;
  isEliminated: boolean;
  eliminationOrder: number | null;
  isWinner: boolean;
}

export interface RaffleAnimationConfig {
  targetEntryId: string | null;
  targetRotationDeg: number;
  durationMs: number;
  startedAt: string | null;
}

export interface RaffleOverlayState {
  raffleId: string;
  title: string;
  mode: RaffleMode;
  status: RaffleStatus;
  sessionId: string | null;
  totalEntries: number;
  activeEntries: Array<{
    id: string;
    label: string;
  }>;
  highlightedEntryId: string | null;
  highlightedEntryLabel: string | null;
  top2EntryIds: string[];
  top2Labels: string[];
  round: number;
  animation: RaffleAnimationConfig;
  updatedAt: string;
}

export interface RaffleRoundResult {
  id: string;
  raffleId: string;
  roundNumber: number;
  actionType: RaffleRoundActionType;
  selectedEntryId: string;
  selectedEntryName: string;
  resultType: RaffleRoundResultType;
  participantCountBefore: number;
  participantCountAfter: number;
  animationSeedJson: string | null;
  createdAt: string;
}

export interface RaffleCreateInput {
  title: string;
  entryCommand: string;
  mode: RaffleMode;
  entryDeadlineAt: string | null;
  acceptedPlatforms: PlatformId[];
  staffTriggerCommand: string;
  openAnnouncementTemplate: string;
  eliminationAnnouncementTemplate: string;
  winnerAnnouncementTemplate: string;
  spinSoundFile: string | null;
  eliminatedSoundFile: string | null;
  winnerSoundFile: string | null;
  enabled: boolean;
}

export interface RaffleUpdateInput extends RaffleCreateInput {
  id: string;
}

export interface RaffleDeleteInput {
  id: string;
}

export interface RaffleControlActionInput {
  raffleId: string;
  action: RaffleControlAction;
}

export interface RaffleOverlayInfo {
  overlayUrl: string;
  stateUrl: string;
}

export interface ChatOverlayInfo {
  /** URL with defaults tuned for OBS Browser Source (transparent + ~1.5x scale). */
  overlayUrl: string;
  /** URL with defaults tuned for OBS Custom Dock (opaque, 1x scale). */
  dockUrl: string;
  stateUrl: string;
}

/**
 * Identifier of an overlay surface that can carry user preferences. The set
 * is closed (vs. PlatformId's open shape) because each overlay's customization
 * model is bespoke — the renderer registry of customization options is keyed
 * on these literals.
 */
export type OverlayId = 'chat-overlay' | 'chat-dock' | 'now-playing' | 'raffles' | 'polls' | 'highlight-message';

/** Anchor corner of the highlight-message card on the OBS scene. */
export type HighlightMessagePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Streamer-tunable visual style — shared between the global defaults
 * (`OverlayDefaults`, applied to every overlay surface) and the per-overlay
 * override slot (`OverlayPreferences`).
 *
 * Every field is optional. Resolution at the overlay client is:
 *   per-overlay-prefs[field] ?? global-defaults[field] ?? CSS fallback.
 *
 * Persisted per profile and pushed live over WebSocket so a connected OBS
 * Browser Source updates without reload.
 */
export interface OverlayVisualStyle {
  /** "#RRGGBB" hex. */
  backgroundColor?: string;
  /** 0..1; controls the backdrop alpha, not the text. */
  backgroundOpacity?: number;
  /** px; 0 = square corners, higher = more rounded. */
  borderRadius?: number;
  /** "#RRGGBB" hex. */
  borderColor?: string;
  /** px; 0 = no visible border. */
  borderWidth?: number;
  /** Key from `OVERLAY_FONTS` in `src/shared/constants.ts`. */
  fontFamily?: string;
  /** "#RRGGBB" hex for body text. */
  fontColor?: string;
  /** px base font size (overlay-internal scale still applies on top). */
  fontSize?: number;
  /** "#RRGGBB" hex for highlight elements (command names, links, badges). */
  accentColor?: string;
}

/** Global visual defaults applied to every overlay. */
export type OverlayDefaults = OverlayVisualStyle;

/**
 * Per-overlay overrides. Each field, when set, supersedes the matching
 * `OverlayDefaults` value for that overlay only. Legacy field `opacity` is
 * kept for backward compatibility — old `overlay-preferences.json` files
 * stored only this single slider and still apply to the backdrop alpha.
 */
export interface OverlayPreferences extends OverlayVisualStyle {
  /** Legacy alias for `backgroundOpacity` — older profiles persisted only this field. */
  opacity?: number;
  /** Highlight-message overlay: max width of the message card, in px. */
  maxWidthPx?: number;
  /** Highlight-message overlay: corner of the OBS scene where the card sits. */
  position?: HighlightMessagePosition;
  /** Highlight-message overlay: seconds before the card auto-dismisses. `0`
   *  keeps the card visible until a new highlight or a manual clear. */
  autoHideSeconds?: number;
}

export type OverlayPreferencesMap = Partial<Record<OverlayId, OverlayPreferences>>;

export interface RaffleSnapshot {
  raffle: Raffle;
  entries: RaffleEntry[];
  activeEntries: RaffleEntry[];
  overlay: RaffleOverlayState | null;
  history: RaffleRoundResult[];
}

export type TwitchConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TwitchCredentials {
  channel: string;
  username: string;
  oauthToken: string;
}

export interface YouTubeChannelConfig {
  id: string; // Internal ID
  handle: string; // @handle or channel ID
  name?: string;
  enabled: boolean;
}

export interface YouTubeChatChannel {
  pageId: string;
  name: string;
  handle: string;
  isSelected: boolean;
}

export interface YouTubeSettings {
  channels: YouTubeChannelConfig[];
  autoConnect: boolean;
  chatChannelPageId?: string;
  chatChannelName?: string;
}

export type TikTokConnectionStatus = 'disconnected' | 'connecting' | 'captcha' | 'connected' | 'error';

export interface TikTokSettings {
  username: string;
  autoConnect: boolean;
}

export type KickConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface KickSettings {
  channelInput: string;
  clientId: string;
  clientSecret: string;
  autoConnect: boolean;
}

export interface KickAuthStatus {
  channelSlug: string | null;
  expiresAt: number | null;
  scope: string | null;
  isAuthorized: boolean;
}

/**
 * R6: A connected platform account. The wizard creates these; adapters are
 * instantiated from them via the per-providerId factory in adapter-factory.ts.
 *
 * `providerData` is opaque to the core — each provider stores its own
 * credentials/settings shape there (OAuth tokens for Twitch/Kick, etc.).
 */
export interface PlatformAccount {
  id: string;
  providerId: string;
  label: string;
  channel: string;
  enabled: boolean;
  autoConnect: boolean;
  createdAt: string;
  providerData: Record<string, unknown>;
}

export type PlatformAccountConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'captcha' | 'watching';

export interface PlatformAccountStatus {
  accountId: string;
  status: PlatformAccountConnectionStatus;
  detail?: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  directory: string;
  lastUsedAt: string;
  appLanguage: AppLanguage;
}

export interface ProfilesSnapshot {
  activeProfileId: string;
  profiles: ProfileSummary[];
  /** When true, the boot picker auto-selects `activeProfileId` instead of
   *  prompting. The flag is set by the picker's "don't ask again" checkbox
   *  and reset whenever the user switches profiles from settings. */
  autoSelectActiveProfile: boolean;
}

export interface SelectProfileInput {
  profileId: string;
}

export interface CreateProfileInput {
  name: string;
  directory: string;
  appLanguage: AppLanguage;
}

export interface RenameProfileInput {
  profileId: string;
  name: string;
}

export interface CloneProfileInput {
  profileId: string;
  name: string;
  directory: string;
}

export interface DeleteProfileInput {
  profileId: string;
}

// --- Suggestions ---

export type SuggestionListMode = 'global' | 'session';

export interface SuggestionList {
  id: string;
  title: string;
  trigger: string;
  feedbackTemplate: string;
  feedbackSoundPath: string | null;
  feedbackTargetPlatforms: PlatformId[];
  mode: SuggestionListMode;
  allowDuplicates: boolean;
  permissions: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
  entryCount: number;
}

export interface SuggestionEntry {
  id: string;
  listId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export interface SuggestionListUpsertInput {
  id?: string;
  title: string;
  trigger: string;
  feedbackTemplate: string;
  feedbackSoundPath: string | null;
  feedbackTargetPlatforms: PlatformId[];
  mode: SuggestionListMode;
  allowDuplicates: boolean;
  permissions: PermissionEntry[];
  cooldownSeconds: number;
  userCooldownSeconds: number;
  enabled: boolean;
}

export interface SuggestionListDeleteInput {
  id: string;
}

export interface SuggestionSnapshot {
  list: SuggestionList;
  entries: SuggestionEntry[];
}

// --- Polls ---

export type PollStatus = 'draft' | 'active' | 'closed' | 'cancelled';
export type PollControlAction = 'start' | 'cancel' | 'force_close';

export interface PollOption {
  id: string;
  index: number;
  label: string;
}

export interface Poll {
  id: string;
  title: string;
  options: PollOption[];
  durationSeconds: number;
  acceptedPlatforms: PlatformId[];
  resultAnnouncementTemplate: string;
  status: PollStatus;
  startedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PollVote {
  pollId: string;
  optionId: string;
  platform: PlatformId;
  userKey: string;
  displayName: string;
  votedAt: string;
}

export interface PollTallyEntry {
  optionId: string;
  index: number;
  label: string;
  votes: number;
  percent: number;
}

export interface PollSnapshot {
  poll: Poll;
  totalVotes: number;
  tally: PollTallyEntry[];
  /** Filled only when status === 'closed'. Null on a tie. */
  winner: PollTallyEntry | null;
}

export interface PollOverlayState {
  pollId: string;
  title: string;
  status: PollStatus;
  totalVotes: number;
  tally: PollTallyEntry[];
  winner: PollTallyEntry | null;
  closesAt: string | null;
  updatedAt: string;
}

export interface PollOverlayInfo {
  overlayUrl: string;
  stateUrl: string;
}

export interface PollOptionInput {
  id?: string;
  label: string;
}

export interface PollUpsertInput {
  id?: string;
  title: string;
  options: PollOptionInput[];
  durationSeconds: number;
  acceptedPlatforms: PlatformId[];
  resultAnnouncementTemplate: string;
}

export interface PollDeleteInput {
  id: string;
}

export interface PollControlInput {
  pollId: string;
  action: PollControlAction;
}

export interface PollIdInput {
  id: string;
}
