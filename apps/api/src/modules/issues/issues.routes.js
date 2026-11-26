import { Router } from "express";
import { createCommentSchema, updateCommentSchema } from "@pinforth/shared";
import { notFound } from "../../lib/errors.js";
import { getAuth } from "../../middleware/require-auth.js";
import { getMembership, requireMembershipRole } from "../../middleware/require-org-role.js";
import { getProject } from "../../middleware/require-project.js";
import { requireVerifiedEmail } from "../../middleware/require-verified-email.js";
import { commentIdParam, timelineQuerySchema } from "./comments.schemas.js";
import {
  createComment,
  deleteComment,
  getIssueTimeline,
  updateComment,
} from "./comments.service.js";
import {
  createFixSubmissionSchema,
  createIssueSchema,
  createVerificationSchema,
  issueNumberParam,
  listIssuesQuerySchema,
  updateIssueSchema,
} from "./issues.schemas.js";
import {
  createFixSubmission,
  createIssue,
  createVerification,
  deleteIssue,
  getIssue,
  listAttempts,
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

function parseCommentId(commentIdParamValue) {
  const parsed = commentIdParam.safeParse(commentIdParamValue);
  if (!parsed.success) {
    throw notFound("Comment not found");
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

router.get("/:number/timeline", async (req, res) => {
  const number = parseNumber(req.params.number);
  const query = timelineQuerySchema.parse(req.query);
  const timeline = await getIssueTimeline(getProject(req).id, number, query);

  res.status(200).json({ success: true, data: timeline });
});

router.get("/:number/attempts", async (req, res) => {
  const number = parseNumber(req.params.number);
  const attempts = await listAttempts(getProject(req).id, number);

  res.status(200).json({ success: true, data: { attempts } });
});

router.post("/:number/fixes", requireVerifiedEmail, async (req, res) => {
  const number = parseNumber(req.params.number);
  const input = createFixSubmissionSchema.parse(req.body);
  const result = await createFixSubmission(
    getProject(req).id,
    number,
    getAuth(req).userId,
    input
  );

  res.status(result.created ? 201 : 200).json({
    success: true,
    data: { fix: result.fix, issue: result.issue },
  });
});

router.post("/:number/verifications", requireVerifiedEmail, async (req, res) => {
  const number = parseNumber(req.params.number);
  const input = createVerificationSchema.parse(req.body);
  const result = await createVerification(
    getMembership(req).organizationId,
    getProject(req).id,
    number,
    getAuth(req).userId,
    input
  );

  res.status(result.created ? 201 : 200).json({
    success: true,
    data: { verification: result.verification, issue: result.issue },
  });
});

router.post("/:number/comments", requireVerifiedEmail, async (req, res) => {
  const number = parseNumber(req.params.number);
  const input = createCommentSchema.parse(req.body);
  const comment = await createComment(
    getProject(req).id,
    number,
    getAuth(req).userId,
    input
  );

  res.status(201).json({ success: true, data: { comment } });
});

router.patch("/:number/comments/:commentId", async (req, res) => {
  const number = parseNumber(req.params.number);
  const commentId = parseCommentId(req.params.commentId);
  const input = updateCommentSchema.parse(req.body);
  const comment = await updateComment(
    getProject(req).id,
    number,
    commentId,
    getAuth(req).userId,
    input
  );

  res.status(200).json({ success: true, data: { comment } });
});

router.delete("/:number/comments/:commentId", async (req, res) => {
  const number = parseNumber(req.params.number);
  const commentId = parseCommentId(req.params.commentId);
  const result = await deleteComment(
    getProject(req).id,
    number,
    commentId,
    getAuth(req).userId,
    getMembership(req).role
  );

  res.status(200).json({ success: true, data: result });
});

router.patch("/:number", async (req, res) => {
  const number = parseNumber(req.params.number);
  const input = updateIssueSchema.parse(req.body);
  const issue = await updateIssue(
    getMembership(req).organizationId,
    getProject(req).id,
    number,
    getAuth(req).userId,
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
