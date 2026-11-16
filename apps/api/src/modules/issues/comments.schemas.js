import { z } from "zod";

export const timelineQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // Malformed values are rejected by the service with BAD_REQUEST/Invalid cursor.
    cursor: z.string().trim().min(1).max(1024).optional(),
  })
  .strict();

export const commentIdParam = z.uuid();
