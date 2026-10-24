import { slugify, SLUG_PATTERN } from "@pinforth/shared";

/**
 * Project URL preview helpers.
 *
 * These are display logic only, not validation contracts: the authoritative
 * project schemas live in `@pinforth/shared` once the backend contracts land.
 *
 * The preview reuses the shared slug rules the organization slug uses
 * (3–60 characters, `SLUG_PATTERN`) so the shown URL is one the backend could
 * actually return.
 */

// shortcut: duplicated from the backend's reserved-slug list; replaced by the
// shared RESERVED_PROJECT_SLUGS export when the project contracts land.
// A reserved slug can never be stored, so previewing one would be a dead URL,
// and the preview must not invent the suffix the backend will add.
const RESERVED_PROJECT_SLUGS = ["new"];

/**
 * What this name means for the project URL.
 *
 * - `slug`: a usable slug exists, so it can be previewed.
 * - `reserved`: the name maps to a reserved address. The name is still valid —
 *   the backend will generate a suffixed slug on creation — but no URL can be
 *   previewed.
 * - `none`: no acceptable slug can be derived, so the name needs changing.
 */
export type ProjectSlugPreview =
  | { kind: "slug"; slug: string }
  | { kind: "reserved" }
  | { kind: "none" };

export function projectSlugPreview(name: string): ProjectSlugPreview {
  const slug = slugify(name);

  if (slug.length < 3 || slug.length > 60 || !SLUG_PATTERN.test(slug)) {
    return { kind: "none" };
  }

  if (RESERVED_PROJECT_SLUGS.includes(slug)) return { kind: "reserved" };

  return { kind: "slug", slug };
}
