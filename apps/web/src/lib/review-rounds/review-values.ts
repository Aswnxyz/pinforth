import type { CreateGuestLinkInput, GuestLinkField, ReviewApiOutcome } from "./api";

// Match createGuestLinkSchema in @pinforth/shared.
export const REVIEWER_NAME_MAX = 160;
export const REVIEWER_EMAIL_MAX = 320;
export const LINK_EXPIRY_DAYS = [1, 3, 7, 14, 30, 90] as const;
export const DEFAULT_LINK_EXPIRY_DAYS = 7;

export interface GuestLinkValues {
  reviewerName: string;
  reviewerEmail: string;
  expiresInDays: number;
}

export const EMPTY_GUEST_LINK_VALUES: GuestLinkValues = {
  reviewerName: "",
  reviewerEmail: "",
  expiresInDays: DEFAULT_LINK_EXPIRY_DAYS,
};

// Deliberately loose: the API is the authority, this only catches typos.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGuestLink(
  values: GuestLinkValues,
): Partial<Record<GuestLinkField, string>> {
  const errors: Partial<Record<GuestLinkField, string>> = {};
  const name = values.reviewerName.trim();
  const email = values.reviewerEmail.trim();

  if (name.length > REVIEWER_NAME_MAX) {
    errors.reviewerName = `Name must be at most ${REVIEWER_NAME_MAX} characters.`;
  }
  if (email && (email.length > REVIEWER_EMAIL_MAX || !EMAIL_PATTERN.test(email))) {
    errors.reviewerEmail = "Enter a valid email address, or leave it empty.";
  }
  if (!(LINK_EXPIRY_DAYS as readonly number[]).includes(values.expiresInDays)) {
    errors.expiresInDays = "Choose how long the link works.";
  }
  return errors;
}

export function toCreateGuestLinkInput(values: GuestLinkValues): CreateGuestLinkInput {
  const reviewerName = values.reviewerName.trim();
  const reviewerEmail = values.reviewerEmail.trim();
  return {
    expiresInDays: values.expiresInDays,
    ...(reviewerName ? { reviewerName } : {}),
    ...(reviewerEmail ? { reviewerEmail } : {}),
  };
}

export const UNCONFIRMED_LINK_MESSAGE =
  "We couldn't confirm whether the link was created. If it was, it can't be shown again: create a new one. Unused links expire on their own.";

export const UNCONFIRMED_REVOKE_MESSAGE =
  "We couldn't confirm the link was revoked. Revoking again is safe.";

/**
 * What a failed mutation means for the screen. `gone`: the project or its
 * review round no longer exists for this user. `refresh`: the outcome is
 * unknown.
 */
export type ReviewFailure<Field extends string> =
  | { kind: "login" }
  | { kind: "gone" }
  | { kind: "refresh"; message: string }
  | { kind: "message"; message: string; fields?: Partial<Record<Field, string>> };

export function describeReviewFailure<Field extends string>(
  outcome: Exclude<ReviewApiOutcome<Field, unknown>, { status: "success" }>,
  unconfirmedMessage: string,
): ReviewFailure<Field> {
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
