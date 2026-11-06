import { finder } from "@medv/finder";
import type { IssueContext } from "./api";

/**
 * What the widget records about the page and the picked element.
 *
 * Every value is cut to the API's limits (`widgetIssueContextSchema`), which
 * are strict: one value over a limit rejects the whole report. Form values,
 * storage and page HTML are never collected.
 */

export const LIMITS = {
  selector: 1000,
  tagName: 50,
  id: 100,
  classItems: 25,
  className: 100,
  text: 200,
  xpath: 500,
  userAgent: 512,
  language: 35,
  platform: 50,
  pageUrl: 2048,
} as const;

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

// Names produced by build tools or frameworks change on every deploy, which
// would break the selector the next time someone looks for the element.
const GENERATED_NAME = [
  /^(css|sc|jsx|emotion|svelte|astro|tw)-/i, // CSS-in-JS and framework scoping
  /^_|^:r/, // leading underscore, React useId
  /__[A-Za-z0-9_-]{5,}$/, // CSS modules: Header_title__a1B2c
  /(^|[-_])[0-9a-f]{6,}$/i, // trailing hash
  /(^|[-_])(?=[a-z0-9]*\d[a-z0-9]*\d)[a-z0-9]{6,}$/i, // trailing token with digits
  /\d{3,}/, // long numbers
];

export const isStableName = (name: string) =>
  name.length <= 40 && !GENERATED_NAME.some((pattern) => pattern.test(name));

const STABLE_ATTRIBUTES = new Set(["data-testid", "data-test", "data-cy", "data-qa", "name", "aria-label"]);

/** A CSS selector that should still find the element after a redeploy. */
export function buildSelector(element: Element): string | undefined {
  try {
    const selector = finder(element, {
      idName: isStableName,
      className: isStableName,
      attr: (name, value) => STABLE_ATTRIBUTES.has(name) && value.length <= 60,
      timeoutMs: 300,
    });
    return selector.length <= LIMITS.selector ? selector : undefined;
  } catch {
    return undefined;
  }
}

/** An absolute XPath, a backup for when the selector stops matching. */
export function buildXPath(element: Element): string | undefined {
  const parts: string[] = [];
  let node: Element | null = element;

  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    let index = 1;
    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.tagName === node.tagName) index += 1;
    }
    parts.unshift(`${tag}[${index}]`);
    node = node.parentElement;
  }

  const path = `/${parts.join("/")}`;
  return path.length <= LIMITS.xpath ? path : undefined;
}

const PRIVATE_ELEMENTS = "input, textarea, select, option, [contenteditable]:not([contenteditable='false'])";

/** A short label for the element, never anything a person typed. */
export function elementText(element: Element): string | null {
  if (element.matches(PRIVATE_ELEMENTS) || element.querySelector("textarea, [contenteditable]")) {
    return null;
  }
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text ? clip(text, LIMITS.text) : null;
}

const SECRET_PARAM =
  /^(token|code|key|api[-_]?key|secret|password|pass|pwd|session|sid|auth|jwt|otp|sig|signature|access[-_]token|refresh[-_]token|id[-_]token|reset[-_]token)$/i;

/**
 * The page address to report: no fragment (it can hold app state or tokens)
 * and no query parameters that look like secrets.
 */
export function reportablePageUrl(href: string): string {
  const url = new URL(href);
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (SECRET_PARAM.test(name)) url.searchParams.delete(name);
  }
  const clean = url.toString();
  if (clean.length <= LIMITS.pageUrl) return clean;

  url.search = "";
  return clip(url.toString(), LIMITS.pageUrl);
}

const round = (value: number) => Math.round(value * 100) / 100;

export function captureContext(element: Element | null, win: Window = window): IssueContext {
  const scroll = { x: round(win.scrollX), y: round(win.scrollY) };
  const nav = win.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform;

  const context: IssueContext = {
    viewport: {
      width: Math.max(1, win.innerWidth),
      height: Math.max(1, win.innerHeight),
      devicePixelRatio: win.devicePixelRatio > 0 ? win.devicePixelRatio : 1,
    },
    scroll,
    browser: {
      ...(nav.userAgent ? { userAgent: clip(nav.userAgent, LIMITS.userAgent) } : {}),
      ...(nav.language ? { language: clip(nav.language, LIMITS.language) } : {}),
      ...(platform ? { platform: clip(platform, LIMITS.platform) } : {}),
    },
    timestamp: new Date().toISOString(),
  };

  if (!element) return context;

  const rect = element.getBoundingClientRect();
  const selector = buildSelector(element);
  const xpath = buildXPath(element);
  const id = element.id && element.id.length <= LIMITS.id ? element.id : null;
  const classList = [...element.classList]
    .filter((name) => name.length <= LIMITS.className)
    .slice(0, LIMITS.classItems);

  return {
    ...context,
    ...(selector ? { selector } : {}),
    element: {
      tagName: clip(element.tagName, LIMITS.tagName),
      id,
      ...(classList.length > 0 ? { classList } : {}),
      textContent: elementText(element),
      xpath: xpath ?? null,
      // Page coordinates, so the spot is found again whatever the scroll.
      boundingBox: {
        top: round(rect.top + scroll.y),
        left: round(rect.left + scroll.x),
        width: round(rect.width),
        height: round(rect.height),
      },
    },
  };
}

/** `BUTTON · “Place order”`, for showing the reviewer what they picked. */
export function describeElement(element: Element): string {
  const text = elementText(element);
  const tag = element.tagName.toLowerCase();
  return text ? `${tag} · “${clip(text, 60)}${text.length > 60 ? "…" : ""}”` : tag;
}
