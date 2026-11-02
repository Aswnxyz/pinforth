import { safeWebsiteUrl } from "./urls";

/**
 * Environment form validation.
 *
 * Temporary UI rules until the shared project contracts land — they will be
 * replaced by `createEnvironmentSchema`/`updateEnvironmentSchema` from
 * `@pinforth/shared` during integration, keeping the same field bounds
 * (name 2–100, URL ≤ 2048, http/https only, hostname required, no
 * credentials).
 */

export const ENVIRONMENT_NAME_MIN = 2;
export const ENVIRONMENT_NAME_MAX = 100;
export const ENVIRONMENT_URL_MAX = 2048;

/** What the environment form collects — the same shape in both modes. */
export interface EnvironmentValues {
  name: string;
  url: string;
}

/** The fields the form can show an error against. */
export type EnvironmentFieldErrors = Partial<Record<"name" | "url", string>>;

export type EnvironmentValidation =
  | { ok: true; values: EnvironmentValues }
  | { ok: false; errors: EnvironmentFieldErrors };

/**
 * Validates and normalises the form input.
 *
 * Trims both fields; on success the returned values are what should be sent
 * to the API. Identical for create and edit — the mode only changes what the
 * form starts with, never what counts as valid.
 */
export function validateEnvironmentValues(input: {
  name: string;
  url: string;
}): EnvironmentValidation {
  const name = input.name.trim();
  const url = input.url.trim();
  const errors: EnvironmentFieldErrors = {};

  if (name.length < ENVIRONMENT_NAME_MIN) {
    errors.name = `Environment name must be at least ${ENVIRONMENT_NAME_MIN} characters.`;
  } else if (name.length > ENVIRONMENT_NAME_MAX) {
    errors.name = `Environment name must be at most ${ENVIRONMENT_NAME_MAX} characters.`;
  }

  if (url.length === 0) {
    errors.url = "Website URL is required.";
  } else if (url.length > ENVIRONMENT_URL_MAX) {
    errors.url = `Website URL must be at most ${ENVIRONMENT_URL_MAX.toLocaleString()} characters.`;
  } else if (safeWebsiteUrl(url) === null) {
    errors.url =
      "Enter a valid website URL starting with http:// or https:// — " +
      "with a hostname and no username or password.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, values: { name, url } };
}
