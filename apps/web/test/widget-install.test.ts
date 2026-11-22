import { describe, expect, it } from "vitest";
import { originOf, widgetCspSources, widgetSnippet } from "@/lib/widget/install";

describe("widget install snippet", () => {
  it("points at the script the web app serves, without async or defer", () => {
    const snippet = widgetSnippet("https://app.pinforth.com");
    expect(snippet).toBe('<script src="https://app.pinforth.com/widget/v1.js"></script>');
    expect(snippet).not.toMatch(/async|defer/);
  });

  it("names the origins a site's CSP must allow", () => {
    expect(widgetCspSources("https://app.pinforth.com", "https://api.pinforth.com/v1/")).toEqual({
      scriptSrc: "script-src https://app.pinforth.com",
      connectSrc: "connect-src https://api.pinforth.com",
    });
  });

  it("only reads http(s) origins", () => {
    expect(originOf("http://localhost:4000")).toBe("http://localhost:4000");
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});
