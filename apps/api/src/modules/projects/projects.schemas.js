import { SLUG_PATTERN } from "@pinforth/shared";
import { z } from "zod";

// Limits match the Prisma Project / Environment columns.
export const PROJECT_NAME_MIN = 2;
export const PROJECT_NAME_MAX = 180;
export const PROJECT_DESCRIPTION_MAX = 2000;
export const ENVIRONMENT_NAME_MIN = 2;
export const ENVIRONMENT_NAME_MAX = 100;
export const ENVIRONMENT_URL_MAX = 2048;

// Never assigned as a project slug: the web app uses these as route segments
// under /projects/ (e.g. /projects/new).
export const RESERVED_PROJECT_SLUGS = new Set(["new", "settings", "environments"]);

const projectName = z
  .string()
  .trim()
  .min(PROJECT_NAME_MIN, `Name must be at least ${PROJECT_NAME_MIN} characters`)
  .max(PROJECT_NAME_MAX, `Name must be at most ${PROJECT_NAME_MAX} characters`);

// Blank or whitespace-only becomes null, the same as clearing it.
const projectDescription = z
  .string()
  .trim()
  .max(PROJECT_DESCRIPTION_MAX, `Description must be at most ${PROJECT_DESCRIPTION_MAX} characters`)
  .transform((value) => (value === "" ? null : value))
  .nullable();

const environmentName = z
  .string()
  .trim()
  .min(ENVIRONMENT_NAME_MIN, `Name must be at least ${ENVIRONMENT_NAME_MIN} characters`)
  .max(ENVIRONMENT_NAME_MAX, `Name must be at most ${ENVIRONMENT_NAME_MAX} characters`);

// http(s) only. Credentials in the URL (https://user:pass@host) are rejected so
// staging passwords are never stored or shown to reviewers. localhost and
// private addresses are allowed: agencies often review local or LAN builds.
const environmentUrl = z
  .string()
  .trim()
  .max(ENVIRONMENT_URL_MAX, `URL must be at most ${ENVIRONMENT_URL_MAX} characters`)
  .pipe(
    z.url({
      protocol: /^https?$/,
      error: "Enter a full website address starting with http:// or https://",
    })
  )
  .refine(
    (value) => {
      // Zod still runs this when the URL check failed; that error is already
      // reported, so don't throw on unparseable input here.
      if (!URL.canParse(value)) return true;
      const url = new URL(value);
      return url.username === "" && url.password === "";
    },
    { error: "Remove the username and password from the URL" }
  );

// Route params: malformed values are treated as "not found", not as a 400.
export const projectSlugParam = z.string().max(100).regex(SLUG_PATTERN);
export const environmentIdParam = z.uuid();

// Unknown keys (including `slug`) are dropped: slugs are generated and immutable.
export const createProjectSchema = z.object({
  name: projectName,
  description: projectDescription.optional(),
});

// Omitted fields are left unchanged; `description: null` clears it.
export const updateProjectSchema = z
  .object({
    name: projectName.optional(),
    description: projectDescription.optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    error: "Provide a name or description to update",
  });

export const createEnvironmentSchema = z.object({
  name: environmentName,
  url: environmentUrl,
});

export const updateEnvironmentSchema = z
  .object({
    name: environmentName.optional(),
    url: environmentUrl.optional(),
  })
  .refine((data) => data.name !== undefined || data.url !== undefined, {
    error: "Provide a name or URL to update",
  });
