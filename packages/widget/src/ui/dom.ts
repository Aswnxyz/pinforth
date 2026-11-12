type Child = Node | string | null | undefined | false;
type Props = Record<string, string | number | boolean | EventListener | undefined>;

/**
 * Creates an element. Text is always set as text, never parsed as HTML, so
 * nothing the website or the API returns can inject markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") {
      element.addEventListener(name.replace(/^on/, "").toLowerCase(), value);
    } else if (name === "className") {
      element.className = String(value);
    } else if (value === true) {
      element.setAttribute(name, "");
    } else {
      element.setAttribute(name, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return element;
}

let counter = 0;
/** A unique id inside the widget's shadow root. */
export const uid = (prefix: string) => `pf-${prefix}-${++counter}`;

/** Shows an element in the browser's top layer when supported. */
export function raise(element: HTMLElement): void {
  if (typeof element.showPopover !== "function") return;
  try {
    // Hide first, so showing again moves it above newer top-layer content.
    if (element.matches(":popover-open")) element.hidePopover();
    element.showPopover();
  } catch {
    // Not connected yet, or popover unsupported in this context.
  }
}
