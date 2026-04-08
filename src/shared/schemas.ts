import { z } from 'zod';

export const selectProfileInputSchema = z.object({
  profileId: z.string().min(1),
});

export type SelectProfileInputSchema = z.infer<typeof selectProfileInputSchema>;
