import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "./app.js";

describe("app foundation", () => {
  it("responds to the health check", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: "Pinforth API is running" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: "ROUTE_NOT_FOUND" });
  });

  it("returns 400 for malformed JSON instead of a 500", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: "INVALID_BODY" });
  });

  it("returns 413 for oversized bodies", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ data: "x".repeat(1024 * 1024 + 1) }));

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Origin", "https://evil.example")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows state-changing requests from the web origin", async () => {
    const res = await request(app)
      .post("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .send({});

    // Passes the origin check and reaches routing.
    expect(res.status).toBe(404);
  });

  it("sends credentialed CORS headers only to the web origin", async () => {
    const allowed = await request(app)
      .options("/api/v1/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await request(app)
      .options("/api/v1/health")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");

    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
