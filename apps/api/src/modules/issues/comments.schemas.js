import { z } from "zod";

export const timelineQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const commentIdParam = z.uuid();
