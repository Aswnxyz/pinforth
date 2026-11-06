import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWidget, type WidgetController } from "../src/widget";
import type { WidgetSession } from "../src/session";

const session: WidgetSession = {
  token: "pf_ws_7e930182417df8a95628103759247190",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  projectName: "Portal",
  environment: { name: "Staging", url: "https://staging.acme.com" },
  roundName: "Sprint 14",
  reviewer: { name: "Alice", email: null },
};

let widget: WidgetController | null = null;

afterEach(() => {
  widget?.destroy();
  widget = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const shadow = () => document.querySelector("[data-pinforth-widget]")!.shadowRoot!;
const button = (label: string) =>
  [...shadow().querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function respond(...responses: Array<() => Response | Promise<Response>>) {
  const bodies: unknown[] = [];
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return responses[Math.min(index++, responses.length - 1)]();
    }),
  );
  return bodies;
}

const created = (number: number, status = 201) => () =>
  new Response(JSON.stringify({ success: true, data: { issue: { number } } }), { status });

function fillTitle(value: string) {
  const title = shadow().querySelector<HTMLInputElement>("input[name='title']")!;
  title.value = value;
  title.dispatchEvent(new Event("input"));
}

describe("widget", () => {
  it("shows only the launcher until opened, then the reviewer's round", () => {
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "collapsed" } });
    expect(shadow().querySelector(".panel")).toBeNull();

    button("Feedback").click();
    expect(shadow().querySelector(".panel")?.textContent).toContain("Sprint 14 · reviewing as Alice");
  });

  it("reports the whole page and confirms the issue number", async () => {
    const bodies = respond(created(15));
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "home" } });

    button("Report without selecting an element").click();
    button("Send").click();
    expect(shadow().querySelector(".err")?.textContent).toBe("Give the problem a short title.");
    expect(bodies).toHaveLength(0);

    fillTitle("  Checkout overlaps  ");
    shadow().querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(shadow().querySelector(".panel")?.textContent).toContain("Sent as #15.");
    expect(bodies[0]).toMatchObject({ title: "Checkout overlaps", type: "BUG", priority: "MEDIUM" });
    expect((bodies[0] as { context: object }).context).not.toHaveProperty("element");
  });

  it("picks an element without triggering the website's own click", async () => {
    document.body.insertAdjacentHTML("beforeend", `<button id="buy">Add to cart</button>`);
    const buy = document.getElementById("buy")!;
    const siteClick = vi.fn();
    buy.addEventListener("click", siteClick);
    vi.spyOn(document, "elementFromPoint").mockReturnValue(buy);

    const bodies = respond(created(16));
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "home" } });

    button("Report an issue").click();
    expect(shadow().querySelector(".banner")).not.toBeNull();
    buy.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));

    expect(siteClick).not.toHaveBeenCalled();
    expect(shadow().querySelector(".banner")).toBeNull();
    expect(shadow().querySelector(".picked")?.textContent).toContain("button · “Add to cart”");

    fillTitle("Button does nothing");
    shadow().querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    const context = (bodies[0] as { context: { selector: string; element: { tagName: string } } }).context;
    expect(context.selector).toBe("#buy");
    expect(context.element.tagName).toBe("BUTTON");

    // Picking is over: the site works normally again.
    buy.click();
    expect(siteClick).toHaveBeenCalledTimes(1);
  });

  it("cancels picking with Escape", () => {
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "home" } });
    button("Report an issue").click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(shadow().querySelector(".banner")).toBeNull();
    expect(button("Report an issue")).toBeDefined();
  });

  it("retries an unknown outcome with the same id, and a changed report with a new one", async () => {
    const bodies = respond(
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => Promise.reject(new TypeError("Failed to fetch")),
      created(17, 200),
    );
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "home" } });
    button("Report without selecting an element").click();
    fillTitle("First");
    shadow().querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(shadow().querySelector(".alert")).not.toBeNull();
    button("Try again").click();
    await flush();

    fillTitle("First, edited");
    button("Try again").click();
    await flush();

    const ids = bodies.map((body) => (body as { clientMutationId: string }).clientMutationId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(shadow().querySelector(".panel")?.textContent).toContain("Sent as #17.");
  });

  it("ends the review when the session is no longer accepted", async () => {
    window.sessionStorage.setItem("pinforth:widget-session", JSON.stringify(session));
    respond(() => new Response(JSON.stringify({ success: false, message: "Session has expired" }), { status: 401 }));
    widget = mountWidget({ apiBase: "http://api.test", session, view: { kind: "home" } });

    button("Report without selecting an element").click();
    fillTitle("Late report");
    shadow().querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    expect(shadow().querySelector(".panel")?.textContent).toContain("Your review session has ended");
    expect(shadow().querySelector(".launcher")).toBeNull();
    expect(window.sessionStorage.getItem("pinforth:widget-session")).toBeNull();
  });
});
