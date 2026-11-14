/**
 * What a website needs to run the feedback widget. The web app serves the
 * script at `/widget/v1.js` (built from `packages/widget`); the script talks
 * to the API directly.
 */

export const WIDGET_SCRIPT_PATH = "/widget/v1.js";

/** The origin of a URL, or null when it isn't an http(s) address. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * The tag to paste into the website's `<head>`. No `async`/`defer`: it has to
 * read the review handoff before a client-side router rewrites the URL.
 */
export function widgetSnippet(webOrigin: string): string {
  return `<script src="${webOrigin}${WIDGET_SCRIPT_PATH}"></script>`;
}

/** The CSP sources a site with a Content Security Policy must allow. */
export function widgetCspSources(webOrigin: string, apiUrl: string): { scriptSrc: string; connectSrc: string } {
  return {
    scriptSrc: `script-src ${webOrigin}`,
    connectSrc: `connect-src ${originOf(apiUrl) ?? apiUrl}`,
  };
}
