import { z } from 'zod';

const platformIdSchema = z.enum(['twitch', 'youtube', 'kick', 'tiktok']);

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

export const scheduledMessageUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  message: z.string().min(1).max(500),
  intervalSeconds: z.number().int().min(5),
  randomWindowSeconds: z.number().int().min(0).max(3600),
  targetPlatforms: z.array(platformIdSchema).min(1),
  enabled: z.boolean(),
});

export const scheduledMessageDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export type SelectProfileInputSchema = z.infer<typeof selectProfileInputSchema>;
export type CreateProfileInputSchema = z.infer<typeof createProfileInputSchema>;
export type RenameProfileInputSchema = z.infer<typeof renameProfileInputSchema>;
export type CloneProfileInputSchema = z.infer<typeof cloneProfileInputSchema>;
export type DeleteProfileInputSchema = z.infer<typeof deleteProfileInputSchema>;
export type ScheduledMessageUpsertInputSchema = z.infer<typeof scheduledMessageUpsertInputSchema>;
export type ScheduledMessageDeleteInputSchema = z.infer<typeof scheduledMessageDeleteInputSchema>;
