/**
 * The one-time handoff code arrives in the fragment: `#pf_handoff=pf_hc_…`.
 * Fragments are never sent to the website's server, and the code is removed
 * from the address bar as soon as it is read.
 */

const HANDOFF_KEY = "pf_handoff";
const CODE_PATTERN = /^pf_hc_[A-Za-z0-9_-]{16,128}$/;

export function readHandoffCode(hash: string): string | null {
  const code = new URLSearchParams(hash.replace(/^#/, "")).get(HANDOFF_KEY)?.trim();
  return code && CODE_PATTERN.test(code) ? code : null;
}

/** The fragment without the handoff code; other fragment content is kept. */
export function fragmentWithoutHandoff(hash: string): string {
  const raw = hash.replace(/^#/, "");
  if (!raw.includes(`${HANDOFF_KEY}=`)) return hash;

  const rest = new URLSearchParams(raw);
  rest.delete(HANDOFF_KEY);
  const remaining = rest.toString();
  return remaining ? `#${remaining}` : "";
}

/** Removes the code from the address bar and history, keeping the page. */
export function scrubHandoff(win: Window = window): void {
  const { pathname, search, hash } = win.location;
  const next = fragmentWithoutHandoff(hash);
  if (next === hash) return;

  try {
    win.history.replaceState(win.history.state, "", `${pathname}${search}${next}`);
  } catch {
    // A sandboxed page may refuse; the code is single-use anyway.
  }
}
