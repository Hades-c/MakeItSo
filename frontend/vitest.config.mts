import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws outside the React Server Components bundler; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    unstubEnvs: true,
    restoreMocks: true,
    // Outside services are served from tests/fixtures/external: unit and integration tests never use the network
    // (PLAN §4.1.10). A test that needs live data does not belong in this suite. Server "now" (server/clock.ts) is
    // pinned to the day the fixtures were recorded; a test moves it with vi.stubEnv("FIXTURES_NOW", ...).
    env: { EXTERNAL_MODE: "fixtures", FIXTURES_NOW: "2026-09-30T12:00:00-04:00" },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          setupFiles: ["./tests/helpers/no-network.ts"],
          // Integration tests start an in-memory MongoDB (first run downloads the binary).
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/**/*.test.tsx"],
          setupFiles: ["./tests/helpers/setup-dom.ts"],
        },
      },
    ],
  },
});
