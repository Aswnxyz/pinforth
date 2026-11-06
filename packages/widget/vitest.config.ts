import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __PINFORTH_API__: JSON.stringify("http://api.test"),
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
