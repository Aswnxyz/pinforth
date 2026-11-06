import { describeElement } from "../capture";
import { h, raise } from "./dom";

/**
 * Pick mode: hovering highlights an element, clicking (or tapping) picks it,
 * Esc cancels. While picking, the website's own clicks, links and handlers
 * are held back so choosing an element never also triggers it.
 */
export interface Picker {
  stop: () => void;
}

const BLOCKED_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "submit"];

export function startPicker({
  layer,
  isOwn,
  onPick,
  onCancel,
}: {
  /** Inside the widget's shadow root, where the highlight and banner go. */
  layer: HTMLElement;
  /** True for the widget's own host, which can't be picked. */
  isOwn: (element: Element) => boolean;
  onPick: (element: Element) => void;
  onCancel: () => void;
}): Picker {
  const label = h("span", { className: "highlight-label" });
  const highlight = h("div", { className: "highlight", popover: "manual", "aria-hidden": "true" }, label);
  const cancel = h("button", { type: "button" }, "Cancel");
  const banner = h(
    "div",
    { className: "banner", popover: "manual", role: "status" },
    h("span", {}, "Click the part of the page with the problem · Esc to cancel"),
    cancel,
  );
  layer.append(highlight, banner);
  raise(highlight);
  raise(banner);

  let current: Element | null = null;

  function targetAt(x: number, y: number): Element | null {
    const element = document.elementFromPoint(x, y);
    if (!element || isOwn(element) || element === document.documentElement || element === document.body) {
      return null;
    }
    return element;
  }

  function show(element: Element | null) {
    current = element;
    if (!element) {
      highlight.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    label.textContent = describeElement(element);
  }

  function onMove(event: PointerEvent) {
    if (event.target instanceof Element && isOwn(event.target)) return;
    show(targetAt(event.clientX, event.clientY));
  }

  function onBlocked(event: Event) {
    // The widget's own buttons (Cancel) keep working.
    if (event.target instanceof Element && isOwn(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.type === "click" && event instanceof MouseEvent) {
      const element = targetAt(event.clientX, event.clientY) ?? current;
      if (element) {
        stop();
        onPick(element);
      }
    } else if (event.type === "pointerdown" && event instanceof PointerEvent) {
      // Touch has no hover: show what the tap is about to pick.
      show(targetAt(event.clientX, event.clientY));
    }
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
    onCancel();
  }

  function onScroll() {
    if (current) show(current);
  }

  cancel.addEventListener("click", () => {
    stop();
    onCancel();
  });

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", onScroll, true);
  for (const type of BLOCKED_EVENTS) window.addEventListener(type, onBlocked, true);
  document.documentElement.style.setProperty("cursor", "crosshair", "important");

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
    for (const type of BLOCKED_EVENTS) window.removeEventListener(type, onBlocked, true);
    document.documentElement.style.removeProperty("cursor");
    highlight.remove();
    banner.remove();
  }

  cancel.focus();
  return { stop };
}
