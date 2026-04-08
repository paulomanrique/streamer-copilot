import { z } from 'zod';

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

export type SelectProfileInputSchema = z.infer<typeof selectProfileInputSchema>;
export type CreateProfileInputSchema = z.infer<typeof createProfileInputSchema>;
export type RenameProfileInputSchema = z.infer<typeof renameProfileInputSchema>;
export type CloneProfileInputSchema = z.infer<typeof cloneProfileInputSchema>;
export type DeleteProfileInputSchema = z.infer<typeof deleteProfileInputSchema>;
