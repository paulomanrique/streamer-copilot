import { z } from 'zod';

const platformIdSchema = z.enum(['twitch', 'youtube', 'youtube-v', 'kick', 'tiktok']);
const scheduledTargetPlatformSchema = z.enum(['twitch', 'youtube']);
const permissionLevelSchema = z.enum(['everyone', 'follower', 'subscriber', 'moderator', 'broadcaster']);
const eventLogLevelSchema = z.enum(['info', 'warn', 'error']);
const raffleModeSchema = z.enum(['single-winner', 'survivor-final']);
const raffleControlActionSchema = z.enum(['open_entries', 'close_entries', 'spin', 'finalize', 'cancel', 'reset']);

export const selectProfileInputSchema = z.object({
  profileId: z.string().min(1),
});

export const createProfileInputSchema = z.object({
  name: z.string().min(1).max(80),
  directory: z.string().min(1),
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

export const generalSettingsSchema = z.object({
  startOnLogin: z.boolean(),
  minimizeToTray: z.boolean(),
  eventNotifications: z.boolean(),
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
  language: z.string().min(2).max(20),
  permissions: z.array(permissionLevelSchema).min(1),
  cooldownSeconds: z.number().int().min(0).max(3600),
  enabled: z.boolean(),
});

export const voiceCommandDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const voiceSpeakPayloadSchema = z.object({
  text: z.string().min(1).max(500),
  lang: z.string().min(2).max(200),
});

export const textCommandUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  trigger: z.string().max(80).nullable(),
  response: z.string().min(1).max(500),
  permissions: z.array(permissionLevelSchema).min(1),
  cooldownSeconds: z.number().int().min(0).max(3600),
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

export const soundCommandUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  trigger: z.string().max(80).nullable(),
  filePath: z.string().min(1),
  permissions: z.array(permissionLevelSchema).min(1),
  cooldownSeconds: z.number().int().min(0).max(3600),
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
  if (!input.commandEnabled && !input.schedule?.enabled) {
    ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Enable a command trigger or a schedule' });
  }
});

export const soundCommandDeleteInputSchema = z.object({
  id: z.string().min(1),
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
});

export const tiktokConnectSchema = z.object({
  username: z.string().min(1).max(80),
});

export const tiktokSettingsSchema = z.object({
  username: z.string().max(80),
  signApiKey: z.string().max(200),
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
export type SoundPlayPayloadSchema = z.infer<typeof soundPlayPayloadSchema>;
export type ObsConnectionSettingsSchema = z.infer<typeof obsConnectionSettingsSchema>;
export type EventLogFiltersSchema = z.infer<typeof eventLogFiltersSchema>;
