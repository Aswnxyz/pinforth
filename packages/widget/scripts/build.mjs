// Builds the widget into one IIFE file and serves the demo site in --dev.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "..");
const dev = process.argv.includes("--dev");

// Same variable the web app uses, so both talk to the same API.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const BUDGET_BYTES = 30 * 1024;

const options = {
  entryPoints: [resolve(pkg, "src/index.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "chrome90", "firefox90", "safari15"],
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  define: { __PINFORTH_API__: JSON.stringify(apiUrl) },
  logLevel: "info",
};

if (dev) {
  const demo = resolve(pkg, "demo");
  const ctx = await esbuild.context({ ...options, outfile: resolve(demo, "widget.js") });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: demo, port: 5500 });
  console.log(`\nDemo website: http://localhost:${port}  (API: ${apiUrl})`);
  console.log("Add it as an environment URL, create a review round, and open a guest link.\n");
} else {
  const outfile = resolve(pkg, "dist/widget.js");
  await esbuild.build({ ...options, outfile });

  const gzipped = gzipSync(readFileSync(outfile)).length;
  console.log(`widget.js: ${(gzipped / 1024).toFixed(1)} KB gzipped (budget ${BUDGET_BYTES / 1024} KB)`);
  if (gzipped > BUDGET_BYTES) {
    console.error("The widget is over its size budget.");
    process.exit(1);
  }

  // Served by the web app at /widget/v1.js.
  const publicDir = resolve(pkg, "../../apps/web/public/widget");
  mkdirSync(publicDir, { recursive: true });
  copyFileSync(outfile, resolve(publicDir, "v1.js"));
}
