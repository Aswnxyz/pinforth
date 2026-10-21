import type { Response } from "supertest";

export const WEB_ORIGIN = "http://localhost:3000";

export const credentials = (overrides: Partial<{ email: string; password: string; name: string }> = {}) => ({
  email: "owner@example.com",
  password: "correct horse battery staple",
  name: "Agency Owner",
  ...overrides,
});

const setCookies = (res: Response): string[] => {
  const header = res.headers["set-cookie"] as unknown;
  if (!header) return [];
  return Array.isArray(header) ? header : [String(header)];
};

// Raw Set-Cookie line for a cookie, e.g. "pf_access=...; Path=/api; HttpOnly; ..."
export const cookieLine = (res: Response, name: string) =>
  setCookies(res).find((line) => line.startsWith(`${name}=`));

export const cookieValue = (res: Response, name: string) => {
  const line = cookieLine(res, name);
  if (!line) return undefined;
  return decodeURIComponent(line.slice(name.length + 1).split(";")[0]);
};
