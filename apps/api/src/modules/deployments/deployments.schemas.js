import { createDeploymentSchema } from "@pinforth/shared";
import { z } from "zod";

export { createDeploymentSchema };

export const listDeploymentsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // Malformed values are rejected by the service with BAD_REQUEST/Invalid cursor.
    cursor: z.string().trim().min(1).max(1024).optional(),
  })
  .strict();

export const deploymentIdParam = z.uuid();
