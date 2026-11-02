import type {
  Environment,
  EnvironmentField,
  ProjectApiOutcome,
  ProjectDetail,
} from "./api";
import type {
  EnvironmentFieldErrors,
  EnvironmentValues,
} from "./environment-validation";

/**
 * Environment-creation logic.
 *
 * Temporary until the shared project contracts land (see `api.ts`). The
 * module mirrors `project-edit.ts`: a failure mapper and the creation state,
 * kept free of React so the branching is unit-testable.
 */

/**
 * What a failed `createEnvironment` POST can tell the page.
 */
export type EnvironmentCreateFailure =
  /** The session is over; the page may send the user to sign in. */
  | { kind: "login" }
  /** The project is gone or inaccessible; reload it and show its state. */
  | { kind: "gone" }
  /**
   * The request failed without an answer, so the POST may still have been
   * applied server-side. It must never be retried automatically — the
   * environment list has to be refreshed first.
   */
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string; fields?: EnvironmentFieldErrors };

export const UNCONFIRMED_CREATE_MESSAGE =
  "We couldn’t confirm whether the environment was added — it may still " +
  "have gone through. Refresh the project to check the list before trying " +
  "again.";

/** Shown when a confirmed creation is missing from the refreshed details. */
export const ENVIRONMENT_CREATED_NOT_SHOWN_MESSAGE =
  "Your environment was created, but the latest project details do not " +
  "show it yet. Refresh to check again.";

/**
 * Shown when a confirmed creation could not be read back at all — the GET
 * failed. Distinct from the environment simply not being listed yet: here
 * nothing is known about the refreshed state.
 */
export const ENVIRONMENT_CREATED_DETAILS_NOT_LOADED_MESSAGE =
  "Your environment was created, but the latest project details could not " +
  "be loaded. Refresh to see them.";

/**
 * The message a confirmed-or-unconfirmed creation deserves once its
 * read-back has resolved, and whether that read-back succeeded.
 */
export function describeCreationFollowUp(
  postConfirmed: boolean,
  check: "listed-missing" | "unreadable",
): string {
  if (!postConfirmed) return UNCONFIRMED_CREATE_MESSAGE;

  return check === "listed-missing"
    ? ENVIRONMENT_CREATED_NOT_SHOWN_MESSAGE
    : ENVIRONMENT_CREATED_DETAILS_NOT_LOADED_MESSAGE;
}

/**
 * Maps a failed POST to what the page should do. Mirrors the edit helper:
 * the switch is exhaustive so no outcome is silently dropped.
 */
export function describeEnvironmentCreateFailure(
  outcome: Exclude<
    ProjectApiOutcome<EnvironmentField, Environment>,
    { status: "success" }
  >,
): EnvironmentCreateFailure {
  switch (outcome.status) {
    case "unauthorized":
      return { kind: "login" };
    case "not-found":
      return { kind: "gone" };
    case "unavailable":
      return { kind: "refresh", message: UNCONFIRMED_CREATE_MESSAGE };
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
 * The creation session of one project page, tied to the request key it
 * belongs to — a different key always derives as "not creating".
 */
export interface EnvironmentCreationState {
  key: string;
  /** `filling` is idle; `creating` the POST; `checking` the read-back. */
  phase: "filling" | "creating" | "checking";
  /** The submitted values, kept while an uncertain creation is reconciled. */
  values: EnvironmentValues | null;
  /** Whether the POST itself was answered with success. */
  postConfirmed: boolean;
  /** The created environment's id, when the POST was confirmed. */
  createdId: string | null;
  message: string | null;
  fields: EnvironmentFieldErrors | null;
  /** Offer the "Refresh project" action before saving is tried again. */
  offerRefresh: boolean;
  sessionExpired: boolean;
}

export function createEnvironmentCreationState(
  key: string,
): EnvironmentCreationState {
  return {
    key,
    phase: "filling",
    values: null,
    postConfirmed: false,
    createdId: null,
    message: null,
    fields: null,
    offerRefresh: false,
    sessionExpired: false,
  };
}

/**
 * Whether the created environment appears in the refreshed list.
 *
 * The conclusive check: a confirmed POST returns the environment's backend
 * id, and the refreshed details either contain that id or they do not.
 */
export function environmentListed(
  id: string,
  project: ProjectDetail,
): boolean {
  return project.environments.some((environment) => environment.id === id);
}

/**
 * Whether an environment with these exact values appears in the refreshed
 * list.
 *
 * Used only for an *unconfirmed* creation, where no id exists. Equal name
 * and URL suggest but never prove which request created such an environment,
 * so this match closes the form on the visible list rather than claiming a
 * success the client cannot verify.
 */
export function environmentMatches(
  values: EnvironmentValues,
  project: ProjectDetail,
): boolean {
  return project.environments.some(
    (environment) =>
      environment.name === values.name && environment.url === values.url,
  );
}
