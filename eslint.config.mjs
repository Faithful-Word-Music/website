import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every AI request goes through the shared layer in src/lib/ai/ (see AI.md),
  // so the AI SDK may only be imported there.
  {
    files: ["src/**/*.{ts,tsx,mjs}"],
    ignores: ["src/lib/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "ai", message: "Call the AI through src/lib/ai/service.ts, never the AI SDK directly." }],
          patterns: [{ group: ["@ai-sdk/*"], message: "Call the AI through src/lib/ai/service.ts, never the AI SDK directly." }],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
