import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the monorepo root .env. Variables already set in the environment win.
const currentDir = dirname(fileURLToPath(import.meta.url));

config({ path: resolve(currentDir, "../../../../.env"), quiet: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  // Comma-separated list of origins allowed to call the API with credentials.
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    ),
  // HS256 signing key for access tokens. Generate with:
  // node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // e.g. ".pinforth.com" so app. and api. share cookies. Unset = host-only (localhost).
  COOKIE_DOMAIN: z.string().optional(),
  // Number of reverse proxies in front of the API, so req.ip is the real client.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  AUTH_RATE_LIMIT: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  // Public URL of the web app, used to build links in emails.
  APP_URL: z.url().default("http://localhost:3000"),
  MAIL_FROM: z.string().default("Pinforth <no-reply@pinforth.local>"),
  // Defaults point at Mailpit from docker-compose.yml.
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

const parsed = envSchema
  .refine(
    (value) => value.NODE_ENV !== "production" || !value.JWT_ACCESS_SECRET.startsWith("replace-me"),
    { path: ["JWT_ACCESS_SECRET"], message: "still set to the .env.example placeholder" }
  )
  .safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

export type Env = typeof env;
