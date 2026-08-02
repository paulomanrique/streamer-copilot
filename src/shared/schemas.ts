import { z } from 'zod';

/**
 * Open shape validation: any non-empty slug-shaped string passes. Membership
 * in the set of known platforms is no longer enforced here so third-party
 * adapter modules can introduce new ids; the runtime check happens later
 * (e.g. chatService rejects sends to a platform with no registered adapter).
 */
const platformIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9-]+$/);
// Any platform id is accepted at the schema layer; which platforms can actually
// receive a scheduled/announced message is a runtime capability (provider
// `supportsScheduledSend`) enforced by the dispatch path — not a hardcoded enum.
const scheduledTargetPlatformSchema = platformIdSchema;

const permissionRoleIdSchema = z.union([
  z.enum(['everyone', 'follower', 'subscriber', 'vip', 'moderator', 'broadcaster']),
  z.string().regex(/^tier:.+$/).max(180),
]);

export const permissionEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('platform-role'),
    platform: platformIdSchema,
    role: permissionRoleIdSchema,
  }),
  z.object({
    kind: z.literal('list'),
    listId: z.string().min(1).max(120),
  }),
]);

const permissionEntriesSchema = z.array(permissionEntrySchema).min(1).max(50);
// For commands that can be schedule-only (commandEnabled=false): a scheduled
// message has no chat invoker, so an empty permission list is valid. The ≥1
// requirement is re-applied per-schema in superRefine when the chat trigger is on.
const optionalPermissionEntriesSchema = z.array(permissionEntrySchema).max(50);
const eventLogLevelSchema = z.enum(['info', 'warn', 'error']);
const raffleModeSchema = z.enum(['single-winner', 'survivor-final']);
const raffleControlActionSchema = z.enum(['open_entries', 'close_entries', 'spin', 'finalize', 'cancel', 'reset', 'start_over']);
export const appLanguageSchema = z.enum(['pt-BR', 'en-US']);

export const selectProfileInputSchema = z.object({
  profileId: z.string().min(1),
});

export const setAutoSelectActiveProfileSchema = z.object({
  autoSelect: z.boolean(),
});

export const createProfileInputSchema = z.object({
  name: z.string().min(1).max(80),
  directory: z.string().min(1),
  appLanguage: appLanguageSchema,
});

export const profileSettingsSchema = z.object({
  appLanguage: appLanguageSchema,
});

export const renameProfileInputSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1).max(80),
});

export const cloneProfileInputSchema = z.object({
  profileId: z.string().min(1),
  name: z.string().min(1).max(80),
  directory: z.string().min(1),
});

export const deleteProfileInputSchema = z.object({
  profileId: z.string().min(1),
});

export const welcomeUserOverrideSchema = z.object({
  username: z.string().min(1).max(80),
  messageTemplate: z.string().max(500).nullable(),
  soundFilePath: z.string().max(500).nullable(),
});

export const welcomeSettingsSchema = z.object({
  enabled: z.boolean(),
  messageTemplate: z.string().max(500),
  soundFilePath: z.string().max(500).nullable(),
  userOverrides: z.array(welcomeUserOverrideSchema).default([]),
});

export const generalSettingsSchema = z.object({
  startOnLogin: z.boolean(),
  minimizeToTray: z.boolean(),
  eventNotifications: z.boolean(),
  recommendationTemplate: z.string().max(500),
  diagnosticLogLevel: eventLogLevelSchema.default('info'),
  overlayServerPort: z.number().int().min(1024).max(65535).default(7842),
});

export const scheduledMessageUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  message: z.string().min(1).max(500),
  intervalSeconds: z.number().int().min(5),
  randomWindowSeconds: z.number().int().min(0).max(3600),
  targetPlatforms: z.array(scheduledTargetPlatformSchema).min(1),
  enabled: z.boolean(),
});

export const scheduledMessageDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const raffleCreateInputSchema = z.object({
  title: z.string().min(1).max(120),
  entryCommand: z.string().min(1).max(80),
  mode: raffleModeSchema,
  entryDeadlineAt: z.string().datetime().nullable(),
  acceptedPlatforms: z.array(platformIdSchema).min(1),
  staffTriggerCommand: z.string().min(1).max(80),
  openAnnouncementTemplate: z.string().max(500).default(''),
  eliminationAnnouncementTemplate: z.string().max(500).default(''),
  winnerAnnouncementTemplate: z.string().max(500).default(''),
  spinSoundFile: z.string().max(200).nullable().default(null),
  eliminatedSoundFile: z.string().max(200).nullable().default(null),
  winnerSoundFile: z.string().max(200).nullable().default(null),
  enabled: z.boolean(),
});

export const raffleUpdateInputSchema = raffleCreateInputSchema.extend({
  id: z.string().min(1),
});

export const raffleDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const raffleControlActionInputSchema = z.object({
  raffleId: z.string().min(1),
  action: raffleControlActionSchema,
});

export const voiceCommandUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  trigger: z.string().min(1).max(80),
  template: z.string().max(500).nullable(),
  language: z.string().min(2).max(200),
  permissions: permissionEntriesSchema,
  cooldownSeconds: z.number().int().min(0).max(3600),
  userCooldownSeconds: z.number().int().min(0).max(3600),
  announceUsername: z.boolean(),
  characterLimit: z.number().int().min(10).max(500),
  enabled: z.boolean(),
});

export const voiceCommandDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const voiceSpeakPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  lang: z.string().min(2).max(200),
});

export const textSettingsSchema = z.object({
  defaultCooldownSeconds: z.number().int().min(0).max(3600),
  defaultUserCooldownSeconds: z.number().int().min(0).max(3600),
});

export const textCommandUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(80),
  trigger: z.string().max(80).nullable(),
  response: z.string().min(1).max(500),
  permissions: optionalPermissionEntriesSchema,
  cooldownSeconds: z.number().int().min(0).max(3600).nullable(),
  userCooldownSeconds: z.number().int().min(0).max(3600).nullable(),
  commandEnabled: z.boolean(),
  schedule: z.object({
    intervalSeconds: z.number().int().min(5),
    randomWindowSeconds: z.number().int().min(0).max(3600),
    targetPlatforms: z.array(scheduledTargetPlatformSchema).min(1),
    enabled: z.boolean(),
  }).nullable(),
  enabled: z.boolean(),
}).superRefine((input, ctx) => {
  const trigger = input.trigger?.trim() ?? '';
  if (input.commandEnabled) {
    if (!trigger.startsWith('!')) {
      ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must start with !' });
    } else if (trigger.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must have at least one character after !' });
    }
  }
  if (input.commandEnabled && input.permissions.length < 1) {
    ctx.addIssue({ code: 'custom', path: ['permissions'], message: 'Add at least one permission for the chat command' });
  }
  if (!input.commandEnabled && !input.schedule?.enabled) {
    ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Enable a command trigger or a schedule' });
  }
});

export const textCommandDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const rendererVoiceCapabilitiesSchema = z.object({
  speechSynthesisAvailable: z.boolean(),
});

export const musicRequestSettingsSchema = z.object({
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
  maxQueueSize: z.number().int().min(1).max(100),
  maxDurationSeconds: z.number().int().min(30).max(3600),
  requestTrigger: z.string().min(1).max(80),
  skipTrigger: z.string().min(1).max(80),
  queueTrigger: z.string().min(1).max(80),
  cancelTrigger: z.string().min(1).max(80),
  requestPermissions: permissionEntriesSchema,
  skipPermissions: permissionEntriesSchema,
  cooldownSeconds: z.number().int().min(0).max(3600),
  userCooldownSeconds: z.number().int().min(0).max(3600),
});

export const musicPlayerEventSchema = z.object({
  type: z.enum(['ended', 'error']),
  itemId: z.string().min(1),
  errorCode: z.number().optional(),
  errorMessage: z.string().max(500).optional(),
});

export const soundSettingsSchema = z.object({
  defaultCooldownSeconds: z.number().int().min(0).max(3600),
  defaultUserCooldownSeconds: z.number().int().min(0).max(3600),
});

export const soundCommandUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(80),
  trigger: z.string().max(80).nullable(),
  filePath: z.string().min(1),
  permissions: optionalPermissionEntriesSchema,
  cooldownSeconds: z.number().int().min(0).max(3600).nullable(),
  userCooldownSeconds: z.number().int().min(0).max(3600).nullable(),
  commandEnabled: z.boolean(),
  schedule: z.object({
    intervalSeconds: z.number().int().min(5),
    randomWindowSeconds: z.number().int().min(0).max(3600),
    targetPlatforms: z.array(scheduledTargetPlatformSchema).default([]),
    enabled: z.boolean(),
  }).nullable(),
  enabled: z.boolean(),
}).superRefine((input, ctx) => {
  const trigger = input.trigger?.trim() ?? '';
  if (input.commandEnabled) {
    if (!trigger.startsWith('!')) {
      ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must start with !' });
    } else if (trigger.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must have at least one character after !' });
    }
  }
  if (input.commandEnabled && input.permissions.length < 1) {
    ctx.addIssue({ code: 'custom', path: ['permissions'], message: 'Add at least one permission for the chat command' });
  }
  if (!input.commandEnabled && !input.schedule?.enabled) {
    ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Enable a command trigger or a schedule' });
  }
});

export const soundCommandDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const suggestionListUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).max(120),
  trigger: z.string().min(2).max(80),
  feedbackTemplate: z.string().max(500),
  feedbackSoundPath: z.string().nullable(),
  feedbackTargetPlatforms: z.array(platformIdSchema).default([]),
  mode: z.enum(['global', 'session']),
  allowDuplicates: z.boolean(),
  permissions: permissionEntriesSchema,
  cooldownSeconds: z.number().int().min(0).max(3600),
  userCooldownSeconds: z.number().int().min(0).max(3600),
  enabled: z.boolean(),
}).superRefine((input, ctx) => {
  const trigger = input.trigger.trim();
  if (!trigger.startsWith('!')) {
    ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must start with !' });
  } else if (trigger.length < 2) {
    ctx.addIssue({ code: 'custom', path: ['trigger'], message: 'Command must have at least one character after !' });
  }
});

export const suggestionListDeleteInputSchema = z.object({
  id: z.string().min(1),
});

const pollControlActionSchema = z.enum(['start', 'cancel', 'force_close']);

const pollOptionInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1).max(120),
});

export const pollUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).max(160),
  options: z.array(pollOptionInputSchema).min(2).max(10),
  durationSeconds: z.number().int().min(10).max(3600),
  acceptedPlatforms: z.array(platformIdSchema).min(1),
  resultAnnouncementTemplate: z.string().max(800).default(''),
});

export const pollDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const pollIdInputSchema = z.object({
  id: z.string().min(1),
});

export const pollControlInputSchema = z.object({
  pollId: z.string().min(1),
  action: pollControlActionSchema,
});

export const soundPlayPayloadSchema = z.object({
  filePath: z.string().min(1),
});

export const obsConnectionSettingsSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  password: z.string().max(200),
});

export const chatSendMessageSchema = z.object({
  platform: platformIdSchema,
  content: z.string().min(1).max(500),
});

export const twitchCredentialsSchema = z.object({
  channel: z.string().min(1).max(80),
  username: z.string().min(1).max(80),
  oauthToken: z.string().min(1).max(200),
});

export const youtubeConnectSchema = z.object({
  videoId: z.string().min(1).max(200),
});

export const youtubeChannelConfigSchema = z.object({
  id: z.string(),
  handle: z.string().min(1),
  name: z.string().optional(),
  enabled: z.boolean(),
});

export const youtubeSettingsSchema = z.object({
  channels: z.array(youtubeChannelConfigSchema),
  autoConnect: z.boolean(),
  chatChannelPageId: z.string().optional(),
  chatChannelName: z.string().optional(),
});

export const youtubeApiStartOAuthSchema = z.object({
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().min(1).max(200),
});

export const tiktokConnectSchema = z.object({
  username: z.string().min(1).max(80),
});

export const tiktokSettingsSchema = z.object({
  username: z.string().max(80),
  autoConnect: z.boolean(),
});

export const kickConnectSchema = z.object({
  channelInput: z.string().min(1).max(400),
  clientId: z.string().max(200).default(''),
  clientSecret: z.string().max(200).default(''),
});

export const kickSettingsSchema = z.object({
  channelInput: z.string().max(400),
  clientId: z.string().max(200),
  clientSecret: z.string().max(200),
  autoConnect: z.boolean(),
});

export const eventLogFiltersSchema = z
  .object({
    level: z.union([eventLogLevelSchema, z.literal('all')]).optional(),
    category: z.string().max(80).optional(),
    query: z.string().max(200).optional(),
  })
  .optional();

export type SelectProfileInputSchema = z.infer<typeof selectProfileInputSchema>;
export type CreateProfileInputSchema = z.infer<typeof createProfileInputSchema>;
export type RenameProfileInputSchema = z.infer<typeof renameProfileInputSchema>;
export type CloneProfileInputSchema = z.infer<typeof cloneProfileInputSchema>;
export type DeleteProfileInputSchema = z.infer<typeof deleteProfileInputSchema>;
export type GeneralSettingsSchema = z.infer<typeof generalSettingsSchema>;
export type ScheduledMessageUpsertInputSchema = z.infer<typeof scheduledMessageUpsertInputSchema>;
export type ScheduledMessageDeleteInputSchema = z.infer<typeof scheduledMessageDeleteInputSchema>;
export type RaffleCreateInputSchema = z.infer<typeof raffleCreateInputSchema>;
export type RaffleUpdateInputSchema = z.infer<typeof raffleUpdateInputSchema>;
export type RaffleDeleteInputSchema = z.infer<typeof raffleDeleteInputSchema>;
export type RaffleControlActionInputSchema = z.infer<typeof raffleControlActionInputSchema>;
export type VoiceCommandUpsertInputSchema = z.infer<typeof voiceCommandUpsertInputSchema>;
export type VoiceCommandDeleteInputSchema = z.infer<typeof voiceCommandDeleteInputSchema>;
export type VoiceSpeakPayloadSchema = z.infer<typeof voiceSpeakPayloadSchema>;
export type TextCommandUpsertInputSchema = z.infer<typeof textCommandUpsertInputSchema>;
export type TextCommandDeleteInputSchema = z.infer<typeof textCommandDeleteInputSchema>;
export type RendererVoiceCapabilitiesSchema = z.infer<typeof rendererVoiceCapabilitiesSchema>;
export type SoundCommandUpsertInputSchema = z.infer<typeof soundCommandUpsertInputSchema>;
export type SoundCommandDeleteInputSchema = z.infer<typeof soundCommandDeleteInputSchema>;
export type SuggestionListUpsertInputSchema = z.infer<typeof suggestionListUpsertInputSchema>;
export type SuggestionListDeleteInputSchema = z.infer<typeof suggestionListDeleteInputSchema>;
export type PollUpsertInputSchema = z.infer<typeof pollUpsertInputSchema>;
export type PollDeleteInputSchema = z.infer<typeof pollDeleteInputSchema>;
export type PollIdInputSchema = z.infer<typeof pollIdInputSchema>;
export type PollControlInputSchema = z.infer<typeof pollControlInputSchema>;
export type SoundPlayPayloadSchema = z.infer<typeof soundPlayPayloadSchema>;
export type ObsConnectionSettingsSchema = z.infer<typeof obsConnectionSettingsSchema>;
export type EventLogFiltersSchema = z.infer<typeof eventLogFiltersSchema>;
export type KickConnectSchema = z.infer<typeof kickConnectSchema>;
export type KickSettingsSchema = z.infer<typeof kickSettingsSchema>;

// ── Moderation (R2) ──────────────────────────────────────────────────────────

export const moderationGetCapabilitiesSchema = platformIdSchema;

export const moderationDeleteMessageSchema = z.object({
  platform: platformIdSchema,
  messageId: z.string().min(1).max(200),
});

export const moderationBanUserSchema = z.object({
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
});

export const moderationUnbanUserSchema = z.object({
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
});

export const moderationTimeoutUserSchema = z.object({
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
  durationSeconds: z.number().int().min(1).max(1_209_600), // Twitch max: 14 days
  reason: z.string().max(500).optional(),
});

export const moderationSetModeSchema = z.object({
  platform: platformIdSchema,
  mode: z.enum(['slow', 'subscribers', 'members', 'followers', 'emote', 'unique']),
  enabled: z.boolean(),
  value: z.number().int().min(0).max(86_400).optional(),
});

export const moderationManageRoleSchema = z.object({
  platform: platformIdSchema,
  role: z.enum(['mod', 'vip']),
  action: z.enum(['add', 'remove']),
  userId: z.string().min(1).max(200),
});

export const moderationRaidSchema = z.object({
  platform: platformIdSchema,
  targetChannel: z.string().min(1).max(200),
});

export const moderationShoutoutSchema = z.object({
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
});

// ── Overlay preferences ───────────────────────────────────────────────────────

const overlayIdSchema = z.enum(['chat-overlay', 'chat-dock', 'now-playing', 'raffles', 'polls', 'highlight-message']);
const highlightPositionSchema = z.enum(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']);

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Permissive font-key shape — the canonical whitelist lives in
// `OVERLAY_FONTS` (constants.ts) and the renderer enforces it visually,
// but the IPC layer just rejects clearly-malformed values.
const fontKeySchema = z.string().min(1).max(40).regex(/^[a-z0-9-]+$/);

export const overlayVisualStyleSchema = z.object({
  backgroundColor: hexColorSchema.optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
  borderRadius: z.number().int().min(0).max(48).optional(),
  borderColor: hexColorSchema.optional(),
  borderWidth: z.number().int().min(0).max(12).optional(),
  fontFamily: fontKeySchema.optional(),
  fontColor: hexColorSchema.optional(),
  fontSize: z.number().int().min(8).max(48).optional(),
  accentColor: hexColorSchema.optional(),
});

export const overlayDefaultsSchema = overlayVisualStyleSchema.strict();

export const overlayPreferencesSchema = overlayVisualStyleSchema.extend({
  /** Legacy single-knob field kept for older profile files. */
  opacity: z.number().min(0).max(1).optional(),
  /** Highlight-message overlay: card width in px. */
  maxWidthPx: z.number().int().min(320).max(1600).optional(),
  /** Highlight-message overlay: anchor corner. */
  position: highlightPositionSchema.optional(),
  /** Highlight-message overlay: auto-dismiss timer, 0 = manual only. */
  autoHideSeconds: z.number().int().min(0).max(120).optional(),
}).strict();

export const overlayPreferencesSetInputSchema = z.object({
  id: overlayIdSchema,
  prefs: overlayPreferencesSchema,
});

// ── Live outputs ─────────────────────────────────────────────────────────────

const liveOutputIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const liveOutputRelativePathSchema = z.string().min(1).max(500).refine((value) => {
  if (/^(?:[A-Za-z]:|[\\/])/.test(value)) return false;
  const segments = value.split(/[\\/]+/);
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}, 'Path must stay inside the active profile');
const liveOutputTimeZoneSchema = z.string().min(1).max(100);

const liveOutputDestinationSchema = z.object({
  file: z.object({
    enabled: z.boolean(),
    relativePath: liveOutputRelativePathSchema,
  }).strict(),
  browser: z.object({
    enabled: z.boolean(),
    style: overlayVisualStyleSchema.strict(),
  }).strict(),
}).strict();

const liveOutputBaseShape = {
  id: liveOutputIdSchema,
  enabled: z.boolean(),
  startOnProfileLoad: z.boolean(),
  destinations: liveOutputDestinationSchema,
};

const completionEffectShape = {
  doneText: z.string().max(500),
  playSound: z.boolean(),
  soundPath: liveOutputRelativePathSchema.nullable(),
};

export const timeLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('time'),
  format: z.string().min(1).max(500),
  use24Hour: z.boolean(),
  removeLeadingHourZero: z.boolean(),
  timeZone: liveOutputTimeZoneSchema,
}).strict();

export const dateLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('date'),
  template: z.string().min(1).max(500),
  dateFormat: z.string().min(1).max(200),
  locale: z.union([z.literal('system'), appLanguageSchema]),
  timeZone: liveOutputTimeZoneSchema,
}).strict();

export const countdownLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  ...completionEffectShape,
  kind: z.literal('countdown'),
  format: z.string().min(1).max(500),
  targetAt: z.string().datetime(),
  useTodayOnProfileLoad: z.boolean(),
  doubleDigits: z.boolean(),
  omitLeadingZeroUnits: z.boolean(),
  timeZone: liveOutputTimeZoneSchema,
}).strict();

export const chronoDownLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  ...completionEffectShape,
  kind: z.literal('chrono-down'),
  format: z.string().min(1).max(500),
  initialSeconds: z.number().int().min(0).max(315_576_000),
  adjustmentMinutes: z.number().int().min(1).max(10_080),
  doubleDigits: z.boolean(),
  omitLeadingZeroUnits: z.boolean(),
  startChronoUpOnComplete: z.boolean(),
}).strict();

export const chronoUpLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('chrono-up'),
  format: z.string().min(1).max(500),
  initialSeconds: z.number().int().min(0).max(315_576_000),
  adjustmentMinutes: z.number().int().min(1).max(10_080),
  useDays: z.boolean(),
  resetOnStart: z.boolean(),
}).strict();

const liveOutputTextLineSchema = z.object({
  id: liveOutputIdSchema,
  text: z.string().max(2_000),
  enabled: z.boolean(),
  allowEmpty: z.boolean(),
}).strict().superRefine((line, ctx) => {
  if (!line.allowEmpty && line.text.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['text'], message: 'Empty lines must be explicitly allowed' });
  }
});

export const textRotatorLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('text-rotator'),
  intervalSeconds: z.number().int().min(1).max(86_400),
  order: z.enum(['sequential', 'shuffle']),
  loop: z.boolean(),
  lines: z.array(liveOutputTextLineSchema).max(1_000),
}).strict();

export const systemInfoLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('system-info'),
  format: z.string().min(1).max(1_000),
  sampleIntervalSeconds: z.number().int().min(1).max(60),
  networkEnabled: z.boolean(),
  networkInterfaceId: z.string().min(1).max(200).nullable(),
  roundRamUsedPercent: z.boolean(),
  roundRamAvailablePercent: z.boolean(),
}).strict();

export const platformLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('platform-live'),
  platformId: platformIdSchema,
  accountId: z.string().min(1).max(120),
  channelId: z.string().min(1).max(400),
  metricId: z.string().min(1).max(80),
  format: z.string().min(1).max(500),
  refreshSeconds: z.number().int().min(1).max(300),
}).strict();

export const playingNowLiveOutputConfigSchema = z.object({
  ...liveOutputBaseShape,
  kind: z.literal('playing-now'),
  format: z.string().min(1).max(1_000),
  noMediaText: z.string().max(500),
  sourceMode: z.enum(['auto', 'pinned']),
  sourceId: z.string().min(1).max(200).nullable(),
  fallbackToSystemSession: z.boolean(),
  truncate: z.object({
    artist: z.number().int().min(0).max(1_000),
    song: z.number().int().min(0).max(1_000),
    album: z.number().int().min(0).max(1_000),
  }).strict(),
  writeSeparateFiles: z.boolean(),
  writeJson: z.boolean(),
  writeArtwork: z.boolean(),
  overlayLayout: z.enum(['compact', 'artwork-left', 'artwork-right']),
  showProgress: z.boolean(),
  spotifyEnrichmentEnabled: z.boolean(),
}).strict().superRefine((settings, ctx) => {
  if (settings.sourceMode === 'pinned' && !settings.sourceId) {
    ctx.addIssue({ code: 'custom', path: ['sourceId'], message: 'Pinned mode requires a source' });
  }
});

export const liveOutputConfigSchema = z.discriminatedUnion('kind', [
  timeLiveOutputConfigSchema,
  dateLiveOutputConfigSchema,
  countdownLiveOutputConfigSchema,
  chronoDownLiveOutputConfigSchema,
  chronoUpLiveOutputConfigSchema,
  textRotatorLiveOutputConfigSchema,
  systemInfoLiveOutputConfigSchema,
  platformLiveOutputConfigSchema,
  playingNowLiveOutputConfigSchema,
]);

const liveOutputHotkeyActionSchema = z.enum([
  'chrono-down.toggle',
  'chrono-down.stop',
  'chrono-down.increment',
  'chrono-down.decrement',
  'chrono-up.toggle',
  'chrono-up.stop',
  'chrono-up.increment',
  'chrono-up.decrement',
]);

export const liveOutputHotkeyBindingSchema = z.object({
  action: liveOutputHotkeyActionSchema,
  accelerator: z.string().min(1).max(120).nullable(),
}).strict();

const platformStreamMetadataPresetSchema = z.object({
  id: liveOutputIdSchema,
  platformId: platformIdSchema,
  name: z.string().min(1).max(120),
  title: z.string().max(500),
  categoryId: z.string().max(120),
  categoryName: z.string().max(200),
}).strict();

export const liveOutputsSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  hotkeysEnabled: z.boolean(),
  hotkeys: z.array(liveOutputHotkeyBindingSchema).max(8),
  outputs: z.array(liveOutputConfigSchema).max(200),
  metadataPresets: z.array(platformStreamMetadataPresetSchema).max(500),
}).strict();

export const liveOutputControlInputSchema = z.object({
  id: liveOutputIdSchema,
  action: z.enum(['start', 'pause', 'resume', 'stop', 'reset', 'previous', 'next', 'shuffle', 'adjust', 'play']),
  amountSeconds: z.number().int().min(-31_557_600).max(31_557_600).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.action === 'adjust' && input.amountSeconds === undefined) {
    ctx.addIssue({ code: 'custom', path: ['amountSeconds'], message: 'Adjust requires amountSeconds' });
  }
});

export const liveOutputIdInputSchema = z.object({
  id: liveOutputIdSchema,
}).strict();

export const liveOutputArtifactInputSchema = z.object({
  id: liveOutputIdSchema,
  artifact: z.string().min(1).max(120).optional(),
}).strict();

export const playingNowSourceInputSchema = z.object({
  sourceId: z.string().min(1).max(200),
}).strict();

export const playingNowCredentialsSchema = z.object({
  clientId: z.string().min(1).max(300),
  clientSecret: z.string().min(1).max(500),
}).strict();

export const platformStreamTargetInputSchema = z.object({
  platformId: platformIdSchema,
  accountId: z.string().min(1).max(120),
  channelId: z.string().min(1).max(400),
}).strict();

export const platformCategorySearchInputSchema = platformStreamTargetInputSchema.extend({
  query: z.string().min(1).max(120),
}).strict();

export const platformStreamMetadataUpdateInputSchema = platformStreamTargetInputSchema.extend({
  title: z.string().max(500).optional(),
  categoryId: z.string().max(120).optional(),
}).strict().refine((input) => input.title !== undefined || input.categoryId !== undefined, {
  message: 'At least one metadata field is required',
});

/**
 * Payload accepted by the `highlightChatMessage` IPC handler. The message
 * mirrors `ChatMessage` from `shared/types` — only the fields the highlight
 * overlay actually needs are validated here so a malformed `contentParts`
 * entry doesn't reject the whole highlight. Pass `null` to clear.
 */
const chatMessageContentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string().max(2000) }),
  z.object({
    type: z.literal('emote'),
    name: z.string().max(200),
    imageUrl: z.string().max(1000).optional(),
  }),
]);

export const highlightMessageInputSchema = z.object({
  message: z.object({
    id: z.string().min(1).max(200),
    platform: platformIdSchema,
    author: z.string().min(1).max(200),
    content: z.string().max(2000),
    contentParts: z.array(chatMessageContentPartSchema).max(200).optional(),
    color: z.string().max(40).optional(),
    avatarUrl: z.string().max(1000).optional(),
    badges: z.array(z.string().max(120)).max(40).optional(),
    badgeUrls: z.array(z.string().max(1000)).max(40).optional(),
  }).nullable(),
});

// ── User lists ────────────────────────────────────────────────────────────────

export const userListMemberInputSchema = z.object({
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(120),
});

export const userListCreateInputSchema = z.object({
  name: z.string().min(1).max(80),
});

export const userListRenameInputSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
});

export const userListIdInputSchema = z.object({
  id: z.string().min(1).max(120),
});

export const userListAddMemberInputSchema = z.object({
  listId: z.string().min(1).max(120),
  member: userListMemberInputSchema,
});

export const userListRemoveMemberInputSchema = z.object({
  listId: z.string().min(1).max(120),
  platform: platformIdSchema,
  userId: z.string().min(1).max(200),
});

// ── Subscriber tiers ──────────────────────────────────────────────────────────

const subscriberTierSourceSchema = z.enum(['builtin', 'scraped', 'api']);

export const subscriberTierEntrySchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  order: z.number().int().min(0).max(10_000),
  source: subscriberTierSourceSchema,
});

export const subscriberTiersReplaceInputSchema = z.object({
  platform: platformIdSchema,
  entries: z.array(subscriberTierEntrySchema).max(50),
});

export type SubscriberTiersReplaceInputSchema = z.infer<typeof subscriberTiersReplaceInputSchema>;

// ── Accounts (R6) ─────────────────────────────────────────────────────────────

export const accountCreateInputSchema = z.object({
  providerId: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  channel: z.string().min(1).max(400),
  enabled: z.boolean(),
  autoConnect: z.boolean(),
  providerData: z.record(z.string(), z.unknown()),
});

export const accountUpdateInputSchema = accountCreateInputSchema.extend({
  id: z.string().min(1).max(120),
});

export const accountIdInputSchema = z.object({
  id: z.string().min(1).max(120),
});

// ── Read-side IPC payloads that previously reached services unvalidated ──────

/** Bare id/handle passed as the raw IPC arg (poll/raffle snapshot, live check).
 *  Length-bounded and degrades to '' on a non-string, matching the prior
 *  `String(raw ?? '')` coercion while rejecting unexpected shapes. */
export const lookupStringInputSchema = z.string().max(200).catch('');

export const rafflesSoundsPreviewInputSchema = z.object({
  event: z.enum(['spinning', 'eliminated', 'winner']),
  // No path separators — the filename is joined onto a bundled sounds dir, so a
  // value like "../../secret" must never get through.
  filename: z.string().min(1).max(120).regex(/^[A-Za-z0-9._ -]+$/, 'Unsafe sound filename'),
});

export const chatLogGetMessagesOptsSchema = z
  .object({
    limit: z.number().int().positive().max(100_000).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .optional();

/** Twitch login/id lists for avatar/badge lookups — bounded; degrades to [] on
 *  malformed input to preserve the handlers' graceful "empty result" behavior. */
export const twitchLoginListSchema = z.array(z.string().min(1).max(80)).max(200).catch([]);
export const twitchBadgeIdListSchema = z.array(z.string().min(1).max(160)).max(500).catch([]);
