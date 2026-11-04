import { Router } from "express";
import { notFound } from "../../lib/errors.js";
import { getAuth } from "../../middleware/require-auth.js";
import { getMembership, requireMembershipRole } from "../../middleware/require-org-role.js";
import { getProject } from "../../middleware/require-project.js";
import { requireVerifiedEmail } from "../../middleware/require-verified-email.js";
import {
  createIssueSchema,
  issueNumberParam,
  listIssuesQuerySchema,
  updateIssueSchema,
} from "./issues.schemas.js";
import {
  createIssue,
  deleteIssue,
  getIssue,
  listIssues,
  updateIssue,
} from "./issues.service.js";

const router = Router({ mergeParams: true });

function parseNumber(numberParam) {
  const parsed = issueNumberParam.safeParse(numberParam);
  if (!parsed.success) {
    throw notFound("Issue not found");
  }
  return parsed.data;
}

router.post("/", requireVerifiedEmail, async (req, res) => {
  const input = createIssueSchema.parse(req.body);
  const issue = await createIssue(
    getMembership(req).organizationId,
    getProject(req).id,
    getAuth(req).userId,
    input
  );

  res.status(201).json({ success: true, data: { issue } });
});

router.get("/", async (req, res) => {
  const query = listIssuesQuerySchema.parse(req.query);
  const result = await listIssues(
    getMembership(req).organizationId,
    getProject(req).id,
    getMembership(req).id,
    query
  );

  res.status(200).json({ success: true, data: result });
});

router.get("/:number", async (req, res) => {
  const number = parseNumber(req.params.number);
  const issue = await getIssue(getProject(req).id, number);

  res.status(200).json({ success: true, data: { issue } });
});

router.patch("/:number", async (req, res) => {
  const number = parseNumber(req.params.number);
  const input = updateIssueSchema.parse(req.body);
  const issue = await updateIssue(
    getMembership(req).organizationId,
    getProject(req).id,
    number,
    input
  );

  res.status(200).json({ success: true, data: { issue } });
});

router.delete("/:number", requireMembershipRole("OWNER", "ADMIN"), async (req, res) => {
  const number = parseNumber(req.params.number);
  const result = await deleteIssue(getProject(req).id, number);

  res.status(200).json({ success: true, data: result });
});

export default router;
