/**
 * URL safety for website environments.
 *
 * An environment points at a website a reviewer will open, but the URL comes
 * from user input. This is the single check for "is this a normal, openable
 * website address": both the environment list (deciding whether a URL may be
 * shown as a link) and the environment form (deciding whether input is
 * acceptable) use it, so there is only one set of URL rules.
 *
 * Only `http`/`https` with a hostname and no embedded credentials pass:
 * an `href` with a scheme like `javascript:` or `data:` would execute code
 * when followed, and credentials in a URL leak secrets into the page.
 *
 * This only validates the string's shape — it never fetches or inspects the
 * website.
 */
export function safeWebsiteUrl(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  // Some valid URLs parse with no host at all (e.g. "https:///path").
  if (parsed.hostname === "") {
    return null;
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }

  return parsed.toString();
}
