import { slugify, SLUG_PATTERN } from "@pinforth/shared";

/**
 * Project URL preview helpers.
 *
 * These are display logic only, never validation contracts: the backend owns
 * slug generation (including its fallback and uniqueness suffix), so nothing
 * here may block a name the backend accepts. The preview reuses the shared
 * `slugify`/`SLUG_PATTERN` so the shown URL is one the backend could actually
 * return.
 */

// shortcut: duplicated from the backend's RESERVED_PROJECT_SLUGS in
// apps/api/projects.schemas.js; replaced by a shared export when the project
// contracts land. A reserved slug is never stored, so previewing one would be
// a dead URL, and the preview must not invent the suffix the backend will add.
const RESERVED_PROJECT_SLUGS = ["new", "settings", "environments"];

/**
 * What this name means for the project URL.
 *
 * - `slug`: a derivable slug exists, so it can be previewed (informational —
 *   the backend derives the authoritative slug at creation).
 * - `reserved`: the name maps to a reserved address. The name is still valid —
 *   the backend will generate a suffixed slug on creation — but no URL can be
 *   previewed.
 * - `none`: the name has no letters or numbers, so no slug can be shown. The
 *   name remains valid; the backend generates one on creation.
 */
export type ProjectSlugPreview =
  | { kind: "slug"; slug: string }
  | { kind: "reserved" }
  | { kind: "none" };

export function projectSlugPreview(name: string): ProjectSlugPreview {
  const slug = slugify(name);

  // The shared slugify already bounds the length at 60; the pattern check
  // only rejects the empty slug, which happens for punctuation-only names.
  if (slug.length > 60 || !SLUG_PATTERN.test(slug)) {
    return { kind: "none" };
  }

  if (RESERVED_PROJECT_SLUGS.includes(slug)) return { kind: "reserved" };

  return { kind: "slug", slug };
}
