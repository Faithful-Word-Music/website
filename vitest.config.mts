import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // *.test.ts: logic, run in Node. *.test.tsx: components, each opting in
    // to a browser-like DOM with a `// @vitest-environment happy-dom` line.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
