import type {
  Environment,
  EnvironmentField,
  ProjectApiOutcome,
} from "./api";
import type {
  EnvironmentFieldErrors,
  EnvironmentValues,
} from "./environment-validation";

/**
 * Environment-editing logic.
 *
 * Temporary until the shared project contracts land (see `api.ts`). The
 * module mirrors `project-edit.ts` and `environment-create.ts`: a partial
 * update preparer, a failure mapper and the editing state, kept free of
 * React so the branching is unit-testable.
 */

/**
 * The partial update sent to `updateEnvironment`.
 *
 * Only changed fields; the environment id, slug and project identity are
 * never part of the body — the id addresses the request, not its payload.
 */
export interface EnvironmentUpdateInput {
  name?: string;
  url?: string;
}

/**
 * Computes the partial update for an environment edit.
 *
 * Both sides are trimmed before comparison, so a value that only gained
 * whitespace is not a change. An empty result means there is nothing to
 * PATCH and the caller must not issue one.
 */
export function prepareEnvironmentUpdate(
  initial: EnvironmentValues,
  values: EnvironmentValues,
): EnvironmentUpdateInput {
  const name = values.name.trim();
  const url = values.url.trim();
  const changes: EnvironmentUpdateInput = {};

  if (name !== initial.name.trim()) {
    changes.name = name;
  }

  if (url !== initial.url.trim()) {
    changes.url = url;
  }

  return changes;
}

/**
 * Whether the submitted changes match the environment the backend now
 * returns.
 *
 * The conclusive reconciliation check after a PATCH: only the fields that
 * were actually sent are compared. Like its project counterpart this proves
 * the values are live, not which request put them there — under concurrent
 * edits the caller keeps its refresh offer rather than claiming causality.
 */
export function environmentChangesAreLive(
  changes: EnvironmentUpdateInput,
  environment: Environment,
): boolean {
  const nameLive =
    changes.name === undefined || changes.name === environment.name;

  const urlLive = changes.url === undefined || changes.url === environment.url;

  return nameLive && urlLive;
}

/**
 * What a failed `updateEnvironment` PATCH can tell the page.
 */
export type EnvironmentEditFailure =
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" }
  /** The project or environment is gone; reload and show its state. */
  | { kind: "gone" }
  /**
   * The request failed without an answer, so the PATCH may still have been
   * applied server-side. It must never be retried automatically — the
   * project has to be refreshed first.
   */
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string; fields?: EnvironmentFieldErrors };

export const UNCONFIRMED_ENVIRONMENT_EDIT_MESSAGE =
  "We couldn’t confirm whether your changes were saved — they may still " +
  "have gone through. Refresh the project to check before trying again.";

/** Shown when a confirmed save could not be read back. */
export const ENVIRONMENT_SAVED_DETAILS_NOT_LOADED_MESSAGE =
  "Your changes were saved, but the latest project details could not be " +
  "loaded. Refresh to see them.";

/**
 * Shown when a confirmed save is read back but the refreshed environment
 * still shows the previous values. It never claims the PATCH failed — the
 * read may simply be behind.
 */
export const ENVIRONMENT_NOT_REFLECTED_MESSAGE =
  "Your changes were saved, but the refreshed details still show the " +
  "previous values. Refresh again to check.";

/**
 * Maps a failed PATCH to what the page should do. Mirrors the other failure
 * mappers: the switch is exhaustive so no outcome is silently dropped.
 */
export function describeEnvironmentEditFailure(
  outcome: Exclude<
    ProjectApiOutcome<EnvironmentField, Environment>,
    { status: "success" }
  >,
): EnvironmentEditFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "not-found":
      return { kind: "gone" };
    case "unavailable":
      return { kind: "refresh", message: UNCONFIRMED_ENVIRONMENT_EDIT_MESSAGE };
    case "rejected":
      return {
        kind: "message",
        message: outcome.message,
        fields: outcome.fields,
      };
    case "forbidden":
    case "conflict":
      return { kind: "message", message: outcome.message };
  }
}

/**
 * The editing session of one environment, tied to the request key it belongs
 * to and to the environment's backend id — a different key, or an id that is
 * no longer in the refreshed list, derives as "not editing".
 */
export interface EnvironmentEditState {
  key: string;
  environmentId: string;
  /** `editing` is idle; `saving` the PATCH; `checking` the read-back. */
  phase: "editing" | "saving" | "checking";
  /** The last submitted changes, possibly unconfirmed, for comparison. */
  changes: EnvironmentUpdateInput | null;
  /** Whether the PATCH itself was answered with success. */
  patchConfirmed: boolean;
  message: string | null;
  fields: EnvironmentFieldErrors | null;
  /** Offer the "Refresh project" action before saving is tried again. */
  offerRefresh: boolean;
  sessionExpired: boolean;
}

export function createEnvironmentEditState(
  key: string,
  environmentId: string,
): EnvironmentEditState {
  return {
    key,
    environmentId,
    phase: "editing",
    changes: null,
    patchConfirmed: false,
    message: null,
    fields: null,
    offerRefresh: false,
    sessionExpired: false,
  };
}
