import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// ESLint 9 flat config. (ESLint 10 is not usable with eslint-config-next 16 yet: audit devex/no-tests-ci-lint-node-pin.)

// PLAN §4.1.10: server code reaches outside services ONLY through fetchExternal (fixtures mode, host allow-list,
// timeouts, byte caps); client islands call our own API through callApi. Those two modules are the only fetch users.
const NO_RAW_FETCH =
  "Call outside services through fetchExternal (server/http/external.ts), and our own API from client code through callApi (lib/api/client.ts). PLAN §4.1.10.";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tests/**", "**/*.test.{ts,tsx}", "playwright.config.ts", "vitest.config.mts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["server/**", "lib/**", "app/api/**"],
    ignores: ["server/http/external.ts", "lib/api/client.ts"],
    rules: {
      "no-restricted-globals": ["error", { name: "fetch", message: NO_RAW_FETCH }],
      "no-restricted-properties": [
        "error",
        ...["globalThis", "window", "self", "global"].map((object) => ({
          object,
          property: "fetch",
          message: NO_RAW_FETCH,
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["http", "https", "node:http", "node:https", "http2", "node:http2"].map(
            (name) => ({
              name,
              message: NO_RAW_FETCH,
            }),
          ),
          patterns: [
            {
              group: ["undici", "undici/*", "axios", "node-fetch", "got", "ky"],
              message: NO_RAW_FETCH,
            },
          ],
        },
      ],
    },
  },
  // Turn off stylistic rules that Prettier owns. Keep last.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
