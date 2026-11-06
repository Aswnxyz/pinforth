import { Router } from "express";
import {
  createGuestLinkSchema,
  createReviewRoundSchema,
  reviewRoundStatusSchema,
} from "@pinforth/shared";
import { z } from "zod";
import { getAuth } from "../../middleware/require-auth.js";
import { requireMembershipRole } from "../../middleware/require-org-role.js";
import { getProject } from "../../middleware/require-project.js";
import {
  createGuestLink,
  createReviewRound,
  listReviewRounds,
  revokeGuestLink,
} from "./review-rounds.service.js";

const listReviewRoundsQuerySchema = z.object({
  status: reviewRoundStatusSchema.optional(),
});

// Mounted under /organizations/:orgId/projects/:projectSlug/review-rounds
// with requireAuth and requireProject already applied.
const router = Router({ mergeParams: true });
const canManage = requireMembershipRole("OWNER", "ADMIN");

router.post("/", canManage, async (req, res) => {
  const input = createReviewRoundSchema.parse(req.body);
  const project = getProject(req);
  const auth = getAuth(req);

  const reviewRound = await createReviewRound(project.id, auth.userId, input);

  res.status(201).json({ success: true, data: { reviewRound } });
});

router.get("/", async (req, res) => {
  const query = listReviewRoundsQuerySchema.parse(req.query);
  const project = getProject(req);

  const reviewRounds = await listReviewRounds(project.id, query);

  res.status(200).json({ success: true, data: { reviewRounds } });
});

router.post("/:roundId/guest-links", canManage, async (req, res) => {
  const input = createGuestLinkSchema.parse(req.body);
  const project = getProject(req);
  const auth = getAuth(req);

  const result = await createGuestLink(project.id, req.params.roundId, auth.userId, input);

  res.status(201).json({ success: true, data: result });
});

router.delete("/:roundId/guest-links/:linkId", canManage, async (req, res) => {
  const project = getProject(req);

  const result = await revokeGuestLink(project.id, req.params.roundId, req.params.linkId);

  res.status(200).json({ success: true, data: result });
});

export default router;
