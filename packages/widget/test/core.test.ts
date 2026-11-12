import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeHandoff, submitIssue, type WidgetIssueInput } from "../src/api";
import {
  buildSelector,
  buildXPath,
  captureContext,
  elementText,
  isStableName,
  LIMITS,
  reportablePageUrl,
} from "../src/capture";
import { fragmentWithoutHandoff, readHandoffCode, scrubHandoff } from "../src/handoff";
import {
  clearSession,
  loadSession,
  saveSession,
  sessionMatchesOrigin,
  type WidgetSession,
} from "../src/session";

const CODE = "pf_hc_SLPz_bJ4aVAT7LorHzROy0zCfVWW6XHX";

const session: WidgetSession = {
  token: "pf_ws_7e930182417df8a95628103759247190",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  projectName: "Portal",
  environment: { name: "Staging", url: "https://staging.acme.com" },
  roundName: "Sprint 14",
  reviewer: { name: "Alice", email: null },
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubFetch(responder: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder();
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  clearSession();
});

describe("handoff", () => {
  it("reads only a well-formed code", () => {
    expect(readHandoffCode(`#pf_handoff=${CODE}`)).toBe(CODE);
    expect(readHandoffCode(`#tab=2&pf_handoff=${CODE}`)).toBe(CODE);
    expect(readHandoffCode("#pf_handoff=pf_gr_notACodeButAnInvite1234")).toBeNull();
    expect(readHandoffCode("#/checkout")).toBeNull();
    expect(readHandoffCode("")).toBeNull();
  });

  it("removes the code and keeps the rest of the fragment", () => {
    expect(fragmentWithoutHandoff(`#pf_handoff=${CODE}`)).toBe("");
    expect(fragmentWithoutHandoff(`#tab=2&pf_handoff=${CODE}`)).toBe("#tab=2");
    expect(fragmentWithoutHandoff("#/checkout")).toBe("#/checkout");
  });

  it("scrubs the address bar without leaving the page", () => {
    window.history.replaceState(null, "", `/checkout?step=2#pf_handoff=${CODE}`);
    scrubHandoff();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/checkout?step=2");
  });
});

describe("session storage", () => {
  it("round-trips a session and drops an expired one", () => {
    saveSession(session);
    expect(loadSession()).toEqual(session);

    saveSession({ ...session, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(loadSession()).toBeNull();
    expect(window.sessionStorage.getItem("pinforth:widget-session")).toBeNull();
  });

  it("ignores tampered storage", () => {
    window.sessionStorage.setItem("pinforth:widget-session", "{not json");
    expect(loadSession()).toBeNull();
    window.sessionStorage.setItem("pinforth:widget-session", JSON.stringify({ ...session, token: "x" }));
    expect(loadSession()).toBeNull();
  });

  it("only belongs to its environment's origin", () => {
    expect(sessionMatchesOrigin(session, "https://staging.acme.com")).toBe(true);
    expect(sessionMatchesOrigin(session, "https://evil.example")).toBe(false);
  });
});

describe("widget API client", () => {
  it("exchanges a code without cookies and keeps what the panel shows", async () => {
    const calls = stubFetch(() =>
      jsonResponse(
        {
          success: true,
          data: {
            sessionToken: session.token,
            expiresAt: session.expiresAt,
            project: { id: "p", name: "Portal", slug: "portal" },
            environment: { id: "e", name: "Staging", slug: "staging", url: "https://staging.acme.com" },
            reviewRound: { id: "r", name: "Sprint 14" },
            reviewer: { name: "Alice", email: null },
          },
        },
        200,
      ),
    );

    expect(await exchangeHandoff("http://api.test", CODE)).toEqual({ status: "success", session });
    expect(calls[0].url).toBe("http://api.test/api/v1/widget/sessions/exchange");
    expect(calls[0].init.credentials).toBe("omit");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ handoffCode: CODE });
  });

  it("maps a used code, a closed round and a blocked origin", async () => {
    stubFetch(() => jsonResponse({ success: false, message: "Invalid or already used handoff code" }, 401));
    expect((await exchangeHandoff("http://api.test", CODE)).status).toBe("denied");

    stubFetch(() => jsonResponse({ success: false, message: "Review round is not active" }, 403));
    expect((await exchangeHandoff("http://api.test", CODE)).status).toBe("closed");

    // A wrong origin: the API strips the CORS header, so fetch just fails.
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect((await exchangeHandoff("http://api.test", CODE)).status).toBe("unavailable");
  });

  const input: WidgetIssueInput = {
    title: "Overlap",
    type: "BUG",
    priority: "HIGH",
    pageUrl: "https://staging.acme.com/checkout",
    context: { viewport: { width: 390, height: 844 } },
    clientMutationId: "8b2f9a7e-6f0c-4d5e-9a1b-2c3d4e5f6a7b",
  };

  it("submits with the bearer token and tells a new report from a repeat", async () => {
    const calls = stubFetch(() => jsonResponse({ success: true, data: { issue: { number: 15 } } }, 201));
    expect(await submitIssue("http://api.test", session.token, input)).toEqual({ status: "created", number: 15 });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${session.token}`);
    expect(calls[0].init.credentials).toBe("omit");

    stubFetch(() => jsonResponse({ success: true, data: { issue: { number: 15 } } }, 200));
    expect(await submitIssue("http://api.test", session.token, input)).toEqual({ status: "duplicate", number: 15 });
  });

  it("maps every failure the screen handles differently", async () => {
    const cases: Array<[number, string]> = [
      [401, "ended"],
      [403, "closed"],
      [409, "conflict"],
      [429, "rate-limited"],
      [400, "rejected"],
      [413, "rejected"],
      [500, "unavailable"],
    ];
    for (const [status, expected] of cases) {
      stubFetch(() => jsonResponse({ success: false, message: "x" }, status));
      expect((await submitIssue("http://api.test", session.token, input)).status).toBe(expected);
    }
  });

  it("maps validation errors to fields", async () => {
    stubFetch(() =>
      jsonResponse(
        { success: false, message: "Request validation failed", details: [{ path: "title", message: "Title is required" }] },
        400,
      ),
    );
    expect(await submitIssue("http://api.test", session.token, input)).toEqual({
      status: "rejected",
      message: "Request validation failed",
      fields: { title: "Title is required" },
    });
  });
});

describe("capture", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <section class="card css-1x2y3z Header_title__a1B2c" id="pricing">
          <p data-testid="price-copy">  Beans from
             <strong>₹450</strong>  </p>
          <button class="btn-primary">Add to cart</button>
        </section>
        <form>
          <input id="email" value="private@example.com" />
          <textarea>private text</textarea>
          <div contenteditable="true">typed text</div>
          <label>Wrapper <textarea>private</textarea></label>
        </form>
      </main>`;
  });

  it("skips generated class names", () => {
    expect(isStableName("btn-primary")).toBe(true);
    expect(isStableName("pricing")).toBe(true);
    for (const name of ["css-1x2y3z", "Header_title__a1B2c", "_abc", ":r1:", "card-3fa9c2", "x1y2z3", "item-2024"]) {
      expect(isStableName(name)).toBe(false);
    }
  });

  it("builds a selector and an XPath that find the element again", () => {
    const button = document.querySelector("button")!;
    const selector = buildSelector(button)!;
    expect(document.querySelector(selector)).toBe(button);
    expect(selector).not.toMatch(/css-1x2y3z|a1B2c/);

    const xpath = buildXPath(button)!;
    expect(xpath).toBe("/html[1]/body[1]/main[1]/section[1]/button[1]");
  });

  it("never reads what a person typed", () => {
    expect(elementText(document.querySelector("#email")!)).toBeNull();
    expect(elementText(document.querySelector("textarea")!)).toBeNull();
    expect(elementText(document.querySelector("[contenteditable]")!)).toBeNull();
    expect(elementText(document.querySelector("label")!)).toBeNull();
    expect(elementText(document.querySelector("form")!)).toBeNull();
    expect(elementText(document.querySelector("p")!)).toBe("Beans from ₹450");
  });

  it("keeps every value inside the API's limits", () => {
    const button = document.querySelector("button")!;
    button.id = "x".repeat(150);
    button.className = Array.from({ length: 40 }, (_, i) => `c${i}`).join(" ") + ` ${"y".repeat(120)}`;
    button.textContent = "z".repeat(500);

    const context = captureContext(button);
    expect(context.element?.id).toBeNull();
    expect(context.element?.classList).toHaveLength(LIMITS.classItems);
    expect(context.element?.textContent).toHaveLength(LIMITS.text);
    expect(context.element?.tagName).toBe("BUTTON");
    expect(context.viewport.width).toBeGreaterThan(0);
    expect(context.browser?.userAgent?.length ?? 0).toBeLessThanOrEqual(LIMITS.userAgent);
    // Only keys the API's strict schema knows.
    expect(Object.keys(context).sort()).toEqual(
      ["browser", "element", "scroll", "selector", "timestamp", "viewport"].sort(),
    );
  });

  it("captures the page alone when no element is picked", () => {
    expect(captureContext(null).element).toBeUndefined();
  });

  it("reports the page without its fragment or secret-looking parameters", () => {
    expect(
      reportablePageUrl("https://staging.acme.com/reset?token=abc&step=2&access_token=x#pf_handoff=y"),
    ).toBe("https://staging.acme.com/reset?step=2");
    const long = `https://staging.acme.com/p?q=${"a".repeat(3000)}`;
    expect(reportablePageUrl(long)).toBe("https://staging.acme.com/p");
  });
});
