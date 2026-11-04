import type {
  CreateIssueInput,
  Issue,
  IssueApiOutcome,
  IssueFieldErrors,
  IssuePriority,
  IssueType,
  UpdateIssueInput,
} from "./api";

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 10000;

/** What the create form holds. Empty strings mean "not chosen". */
export interface IssueFormValues {
  title: string;
  description: string;
  type: IssueType;
  priority: IssuePriority;
  assigneeId: string;
  environmentId: string;
}

export const EMPTY_ISSUE_VALUES: IssueFormValues = {
  title: "",
  description: "",
  type: "BUG",
  priority: "MEDIUM",
  assigneeId: "",
  environmentId: "",
};

export function validateTitle(title: string): string | null {
  const trimmed = title.trim();

  if (trimmed.length < TITLE_MIN) {
    return `Title must be at least ${TITLE_MIN} characters.`;
  }
  if (trimmed.length > TITLE_MAX) {
    return `Title must be at most ${TITLE_MAX} characters.`;
  }
  return null;
}

export function validateDescription(description: string): string | null {
  return description.trim().length > DESCRIPTION_MAX
    ? `Description must be at most ${DESCRIPTION_MAX.toLocaleString()} characters.`
    : null;
}

export function validateIssueValues(values: IssueFormValues): IssueFieldErrors {
  const errors: IssueFieldErrors = {};

  const title = validateTitle(values.title);
  if (title) errors.title = title;

  const description = validateDescription(values.description);
  if (description) errors.description = description;

  return errors;
}

/** The POST body: trimmed, with unchosen optional fields left out. */
export function toCreateIssueInput(values: IssueFormValues): CreateIssueInput {
  const description = values.description.trim();

  return {
    title: values.title.trim(),
    type: values.type,
    priority: values.priority,
    ...(description ? { description } : {}),
    ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
    ...(values.environmentId ? { environmentId: values.environmentId } : {}),
  };
}

/**
 * The PATCH body for an inline title/description edit: only what changed,
 * and an emptied description is sent as `null` to clear it.
 */
export function prepareTextUpdate(
  issue: Pick<Issue, "title" | "description">,
  values: { title: string; description: string },
): UpdateIssueInput {
  const changes: UpdateIssueInput = {};
  const title = values.title.trim();
  const description = values.description.trim() || null;

  if (title !== issue.title) changes.title = title;
  if (description !== (issue.description ?? null)) {
    changes.description = description;
  }

  return changes;
}

/** Whether the issue the API returned carries every submitted change. */
export function issueReflects(issue: Issue, changes: UpdateIssueInput): boolean {
  return Object.entries(changes).every(([field, value]) => {
    switch (field) {
      case "assigneeId":
        return (issue.assignee?.id ?? null) === value;
      case "environmentId":
        return (issue.environment?.id ?? null) === value;
      default:
        return issue[field as keyof Issue] === value;
    }
  });
}

export const UNCONFIRMED_SAVE_MESSAGE =
  "We couldn't confirm whether this change was saved. Refresh the issue to check before trying again.";

export const UNCONFIRMED_CREATE_MESSAGE =
  "We couldn't confirm whether the issue was created. Check the issue list before trying again, so it isn't created twice.";

export const UNCONFIRMED_DELETE_MESSAGE =
  "We couldn't confirm whether the issue was deleted. Refresh the issue to check.";

/**
 * What a failed mutation means for the screen.
 *
 * `login`: the session is over. `gone`: the issue (or project) no longer
 * exists for this user. `refresh`: the outcome is unknown, so nothing may be
 * retried until the issue is read back. `message`: a definite refusal.
 */
export type IssueFailure =
  | { kind: "login" }
  | { kind: "gone" }
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string; fields?: IssueFieldErrors };

export function describeIssueFailure(
  outcome: Exclude<IssueApiOutcome<unknown>, { status: "success" }>,
  unconfirmedMessage: string,
): IssueFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "not-found":
      return { kind: "gone" };
    case "unavailable":
      return { kind: "refresh", message: unconfirmedMessage };
    case "rejected":
      return {
        kind: "message",
        message: outcome.message,
        ...(outcome.fields ? { fields: outcome.fields } : {}),
      };
    case "forbidden":
    case "conflict":
      return { kind: "message", message: outcome.message };
  }
}
