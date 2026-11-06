import { exchangeHandoff } from "./api";
import { readHandoffCode, scrubHandoff } from "./handoff";
import { loadSession, saveSession, sessionMatchesOrigin } from "./session";
import { mountWidget } from "./widget";

/**
 * Entry point of the embeddable script:
 *
 *   <script src="https://app.pinforth.com/widget/v1.js"></script>
 *
 * It stays invisible to ordinary visitors. It only appears for a reviewer who
 * arrived through a Pinforth review link (`#pf_handoff=…`), or who already
 * has a review session in this tab.
 */

declare global {
  interface Window {
    __pinforthWidget?: boolean;
  }
}

function apiBaseFrom(script: HTMLOrSVGScriptElement | null): string {
  const override = script instanceof HTMLScriptElement ? script.dataset.api : undefined;
  return (override || __PINFORTH_API__).replace(/\/+$/, "");
}

function whenBodyReady(run: () => void) {
  if (document.body) run();
  else document.addEventListener("DOMContentLoaded", run, { once: true });
}

function boot() {
  if (window.__pinforthWidget) return;
  window.__pinforthWidget = true;

  const apiBase = apiBaseFrom(document.currentScript);

  // Read and remove the code first, before the website's router sees it.
  const code = readHandoffCode(window.location.hash);
  if (code) scrubHandoff();

  const stored = loadSession();
  const existing = stored && sessionMatchesOrigin(stored, window.location.origin) ? stored : null;

  if (!code) {
    if (existing) whenBodyReady(() => mountWidget({ apiBase, session: existing, view: { kind: "collapsed" } }));
    return;
  }

  whenBodyReady(() => {
    const widget = mountWidget({ apiBase, session: null, view: { kind: "starting" } });

    void exchangeHandoff(apiBase, code).then((outcome) => {
      if (outcome.status === "success") {
        saveSession(outcome.session);
        widget.setSession(outcome.session);
        widget.setView({ kind: "home" });
        return;
      }
      // A used code after a reload, say, while this tab already has a session.
      if (existing && outcome.status === "denied") {
        widget.setSession(existing);
        widget.setView({ kind: "collapsed" });
        return;
      }
      widget.setView({ kind: "start-failed", outcome });
    });
  });
}

boot();
