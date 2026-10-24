import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  mongo: z.literal('up'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
