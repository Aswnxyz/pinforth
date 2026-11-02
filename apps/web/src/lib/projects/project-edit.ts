import type {
  ProjectApiOutcome,
  ProjectDetail,
  ProjectField,
  UpdateProjectInput,
} from "./api";

/**
 * Project editing validation and update preparation.
 *
 * Temporary UI rules until the shared project contracts land — they will be
 * replaced by `updateProjectSchema` from `@pinforth/shared` during
 * integration, keeping the same field bounds (name 2–180, description
 * ≤ 2000).
 *
 * Editing never touches the slug: it is immutable by contract, so a renamed
 * project keeps its URL even when the new name would not produce a valid
 * slug for a new project. The create-form's slug checks deliberately do not
 * apply here.
 */

export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 180;
export const PROJECT_DESCRIPTION_MAX = 2000;

/** The project fields this form edits. */
export interface ProjectEditValues {
  name: string;
  /** `null` means the project has no description. */
  description: string | null;
}

/** The fields the form can show an error against. */
export type ProjectFieldErrors = Partial<Record<"name" | "description", string>>;

export type ProjectEditPreparation =
  | { ok: true; changes: UpdateProjectInput }
  | { ok: false; errors: ProjectFieldErrors };

/**
 * Validates the edited values and prepares the partial update.
 *
 * Compares against the initial values so an untouched field is omitted from
 * the payload rather than resent unchanged. An empty `changes` object means
 * nothing was edited — the caller must not send an empty PATCH.
 *
 * An empty description is always normalised to `null`: typing then deleting
 * a description is a "no change" when there was none, and a clear when there
 * was one.
 */
export function prepareProjectUpdate(
  initial: ProjectEditValues,
  edited: ProjectEditValues,
): ProjectEditPreparation {
  const name = edited.name.trim();
  const description = edited.description?.trim() || null;
  const initialDescription = initial.description?.trim() || null;
  const errors: ProjectFieldErrors = {};

  if (name.length < PROJECT_NAME_MIN) {
    errors.name = `Project name must be at least ${PROJECT_NAME_MIN} characters.`;
  } else if (name.length > PROJECT_NAME_MAX) {
    errors.name = `Project name must be at most ${PROJECT_NAME_MAX} characters.`;
  }

  if ((description?.length ?? 0) > PROJECT_DESCRIPTION_MAX) {
    errors.description = `Description must be at most ${PROJECT_DESCRIPTION_MAX.toLocaleString()} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const changes: UpdateProjectInput = {};

  if (name !== initial.name.trim()) {
    changes.name = name;
  }

  if (description !== initialDescription) {
    changes.description = description;
  }

  return { ok: true, changes };
}

/**
 * What a failed `updateProject` PATCH can tell the page.
 */
export type EditProjectFailure =
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" }
  /** The project is gone or inaccessible; reload it and show its state. */
  | { kind: "gone" }
  /**
   * The request failed without an answer, so the PATCH may still have been
   * applied server-side. It must never be retried automatically — the
   * project has to be refreshed first.
   */
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string; fields?: ProjectFieldErrors };

export const UNCONFIRMED_EDIT_MESSAGE =
  "We couldn’t confirm whether your changes were saved — they may still " +
  "have gone through. Refresh the project to check before trying again.";

/** Shown when a confirmed save could not be read back. */
export const EDIT_SAVED_DETAILS_NOT_LOADED_MESSAGE =
  "Your changes were saved, but the latest project details could not be " +
  "loaded. Refresh to see them.";

/** Shown when a refresh proves the last save never landed. */
export const EDIT_NOT_SAVED_MESSAGE =
  "Your changes were not saved. Review them and try saving again.";

/**
 * Maps a failed PATCH to what the page should do. Mirrors the creation
 * helper: the switch is exhaustive so no outcome is silently dropped.
 */
export function describeEditProjectFailure(
  outcome: Exclude<
    ProjectApiOutcome<ProjectField, unknown>,
    { status: "success" }
  >,
): EditProjectFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "not-found":
      return { kind: "gone" };
    case "unavailable":
      return { kind: "refresh", message: UNCONFIRMED_EDIT_MESSAGE };
    case "rejected":
      return { kind: "message", message: outcome.message, fields: outcome.fields };
    case "forbidden":
    case "conflict":
      return { kind: "message", message: outcome.message };
  }
}

/**
 * The editing session of one project page, tied to the request key it
 * belongs to — a different key always derives as "not editing".
 */
export interface EditProjectState {
  key: string;
  phase: "editing" | "saving" | "checking";
  /** The last submitted changes, possibly unconfirmed, for comparison. */
  changes: UpdateProjectInput | null;
  /** Whether the PATCH itself was answered with success. */
  patchConfirmed: boolean;
  message: string | null;
  fields: ProjectFieldErrors | null;
  /** Offer the "Refresh project" action before saving is tried again. */
  offerRefresh: boolean;
  sessionExpired: boolean;
}

export function createEditProjectState(key: string): EditProjectState {
  return {
    key,
    phase: "editing",
    changes: null,
    patchConfirmed: false,
    message: null,
    fields: null,
    offerRefresh: false,
    sessionExpired: false,
  };
}

/**
 * Whether the submitted changes match the project the backend now returns.
 *
 * Used after a save to decide whether it landed. The comparison is the
 * exact one `prepareProjectUpdate` produced, so a trimmed rename or a
 * cleared description is recognised; an empty description on the server is
 * treated as `null` for the same reason the helper normalises it.
 */
export function changesAreLive(
  changes: UpdateProjectInput,
  project: ProjectDetail,
): boolean {
  const nameMatches =
    changes.name === undefined || changes.name === project.name;

  const descriptionMatches =
    changes.description === undefined ||
    changes.description === (project.description || null);

  return nameMatches && descriptionMatches;
}
