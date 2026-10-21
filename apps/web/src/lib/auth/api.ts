import {
  fieldErrorsFrom,
  loginSchema,
  registerSchema,
  type AuthField,
  type LoginValues,
  type RegisterValues,
} from "./validation";

/**
 * The authentication seam.
 *
 * These two functions are the only place in the frontend that will ever talk to
 * the authentication service. The endpoint, method, and response shape are not
 * settled yet, so nothing is sent: both functions report `unavailable` and the
 * UI shows that plainly. The backend developer replaces the bodies below and
 * nothing above them has to change.
 *
 * Never store credentials, tokens, or session state in browser storage. The
 * session is expected to arrive as an HttpOnly cookie.
 */

export type { AuthField };

export type AuthOutcome =
  /** The credentials were accepted. */
  | { status: "success" }
  /** The credentials were refused; `fields` carries per-field messages. */
  | { status: "rejected"; message: string; fields?: Partial<Record<AuthField, string>> }
  /** The request could not be made at all (service missing, offline, timeout). */
  | { status: "unavailable"; message: string };

/**
 * Where a signed-in user lands. The first protected route does not exist yet;
 * update this when the workspace routes are added.
 */
export const POST_AUTH_REDIRECT = "/";

const NOT_CONNECTED_MESSAGE =
  "This is not connected to the Pinforth API yet, so nothing was sent. The authentication service still has to be in place before sign-in works.";

const NOT_CONNECTED_REGISTER_MESSAGE =
  "This is not connected to the Pinforth API yet, so nothing was sent. The authentication service still has to be in place before accounts can be created.";

export async function signInWithPassword(
  values: LoginValues,
): Promise<AuthOutcome> {
  const result = loginSchema.safeParse(values);

  if (!result.success) {
    return {
      status: "rejected",
      message: "Some of the details you entered need attention.",
      fields: fieldErrorsFrom(result.error.issues),
    };
  }

  return { status: "unavailable", message: NOT_CONNECTED_MESSAGE };
}

export async function registerWithPassword(
  values: RegisterValues,
): Promise<AuthOutcome> {
  const result = registerSchema.safeParse(values);

  if (!result.success) {
    return {
      status: "rejected",
      message: "Some of the details you entered need attention.",
      fields: fieldErrorsFrom(result.error.issues),
    };
  }

  return { status: "unavailable", message: NOT_CONNECTED_REGISTER_MESSAGE };
}
