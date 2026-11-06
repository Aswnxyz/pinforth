/**
 * The widget's styles, scoped to its shadow root. `:host { all: initial }`
 * stops the website's inherited font and colour from leaking in. Colours are
 * Pinforth's brand tokens, light and dark.
 */
export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

/* The website's rules still win on the host element itself, and inherited
   values (letter-spacing, colour, text-transform…) would flow in from it. */
.root {
  all: initial;
  display: block;
  --pf-surface: #FFFFFF;
  --pf-surface-muted: #EEF3ED;
  --pf-foreground: #24352B;
  --pf-muted: #53685A;
  --pf-border: #D9E3D9;
  --pf-border-strong: #859789;
  --pf-accent: #365B47;
  --pf-accent-hover: #294738;
  --pf-accent-foreground: #FFFFFF;
  --pf-danger: #B84A39;
  --pf-success: #2E7D4E;
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--pf-foreground);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .root {
    --pf-surface: #1A241E;
    --pf-surface-muted: #222E27;
    --pf-foreground: #F0F4F1;
    --pf-muted: #9FB3A5;
    --pf-border: #2B3B30;
    --pf-border-strong: #637F6C;
    --pf-accent: #5E9E7A;
    --pf-accent-hover: #53926E;
    --pf-accent-foreground: #0E1611;
    --pf-danger: #E06853;
    --pf-success: #54B07B;
  }
}

/* Popover UA styles reset: these layers place themselves. */
[popover] { inset: auto; margin: 0; padding: 0; border: 0; background: transparent; overflow: visible; color: inherit; }

.dock {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
  max-width: calc(100vw - 32px);
}

.launcher {
  display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px;
  border: 0; border-radius: 999px; cursor: pointer;
  background: var(--pf-accent); color: var(--pf-accent-foreground);
  font: 600 14px/1 inherit; font-family: inherit;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
}
.launcher:hover { background: var(--pf-accent-hover); }
.launcher svg { width: 16px; height: 16px; fill: currentColor; }

.panel {
  width: min(380px, calc(100vw - 32px)); max-height: min(640px, calc(100vh - 92px)); overflow: auto;
  background: var(--pf-surface); border: 1px solid var(--pf-border); border-radius: 12px;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.22); padding: 16px;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.title { margin: 0; font-size: 15px; font-weight: 600; }
.sub { margin: 2px 0 0; color: var(--pf-muted); font-size: 13px; overflow-wrap: anywhere; }
.note { margin: 12px 0 0; color: var(--pf-muted); font-size: 12px; }
.stack > * + * { margin-top: 12px; }

.icon-btn {
  flex: none; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: 0; border-radius: 6px; background: transparent; color: var(--pf-muted); cursor: pointer;
}
.icon-btn:hover { background: var(--pf-surface-muted); color: var(--pf-foreground); }
.icon-btn svg { width: 16px; height: 16px; fill: currentColor; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 0 16px;
  border-radius: 6px; font: 600 14px/1.2 inherit; font-family: inherit; cursor: pointer;
  border: 1px solid var(--pf-border-strong); background: var(--pf-surface); color: var(--pf-foreground);
}
.btn:hover { background: var(--pf-surface-muted); }
.btn.primary { border-color: transparent; background: var(--pf-accent); color: var(--pf-accent-foreground); }
.btn.primary:hover { background: var(--pf-accent-hover); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.row { display: flex; gap: 8px; }
.row > * { flex: 1; }
.gap-top { margin-top: 12px; }

.link {
  padding: 0; border: 0; background: none; color: var(--pf-accent); cursor: pointer;
  font: 500 13px/1.4 inherit; font-family: inherit; text-decoration: underline; text-underline-offset: 3px;
}

.picked {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px;
  border: 1px dashed var(--pf-border-strong); border-radius: 6px; background: var(--pf-surface-muted); font-size: 13px;
}
.picked span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 4px; }
.req { color: var(--pf-danger); }
input, textarea, select {
  display: block; width: 100%; padding: 8px 10px; border: 1px solid var(--pf-border-strong); border-radius: 6px;
  background: var(--pf-surface); color: var(--pf-foreground); font: 14px/1.4 inherit; font-family: inherit;
}
textarea { resize: vertical; min-height: 88px; }
input[aria-invalid="true"], textarea[aria-invalid="true"] { border-color: var(--pf-danger); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.err { margin: 4px 0 0; color: var(--pf-danger); font-size: 12px; }
.alert {
  margin: 0; padding: 8px 10px; border: 1px solid var(--pf-danger); border-radius: 6px;
  color: var(--pf-danger); font-size: 13px; background: color-mix(in srgb, var(--pf-danger) 8%, transparent);
}
.ok { color: var(--pf-success); font-weight: 600; }

:focus-visible { outline: 2px solid var(--pf-accent); outline-offset: 2px; }

.highlight {
  position: fixed; z-index: 2147483646; pointer-events: none; border: 2px solid #E8743B; border-radius: 3px;
  background: rgb(232 116 59 / 0.12); transition: all 60ms ease-out; display: none;
}
.highlight-label {
  position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; max-width: 280px; padding: 2px 6px;
  border-radius: 4px; background: #E8743B; color: #fff; font: 600 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.banner {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 24px); padding: 8px 8px 8px 14px;
  border-radius: 999px; background: var(--pf-foreground); color: var(--pf-surface); font-size: 13px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
}
.banner button {
  border: 0; border-radius: 999px; padding: 6px 12px; background: var(--pf-surface); color: var(--pf-foreground);
  font: 600 13px/1 inherit; font-family: inherit; cursor: pointer;
}
.spin {
  display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 50%; animation: pf-spin 0.7s linear infinite; vertical-align: -2px;
}
@keyframes pf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation-duration: 2s; } .highlight { transition: none; } }
@media (max-width: 480px) { .grid { grid-template-columns: 1fr; } }
`;

/**
 * Attaches the styles. A constructable stylesheet is not subject to the
 * website's `style-src` CSP; a `<style>` tag is the fallback for browsers
 * without `adoptedStyleSheets`.
 */
export function applyStyles(root: ShadowRoot): void {
  try {
    if ("adoptedStyleSheets" in root && typeof CSSStyleSheet === "function") {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
      return;
    }
  } catch {
    // Fall through to the style tag.
  }
  const style = document.createElement("style");
  style.textContent = CSS;
  root.append(style);
}
