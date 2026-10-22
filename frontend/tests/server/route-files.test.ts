import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isDefinedRoute } from "@/server/http";

/**
 * PLAN §4.1.9: every app/api/**\/route.* is built with defineRoute (auth, CSRF, limits, validation and typed errors
 * in one place). The NextAuth catch-all is the only exception: it has its own CSRF token.
 *
 * Each route module is imported and every exported HTTP method must be a handler defineRoute returned (they are
 * tagged, see isDefinedRoute), so re-exports (`export { raw as POST }`), wrappers and any file extension Next.js
 * accepts are covered, not just the `export const GET = defineRoute(` spelling.
 */
const apiDir = fileURLToPath(new URL("../../app/api", import.meta.url));
const EXEMPT = new Set([path.join("auth", "[...nextauth]", "route.ts")]);
/** Every method name Next.js serves from a route module. */
const HTTP_METHODS = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"] as const;
const ROUTE_FILE = /^route\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return ROUTE_FILE.test(name) ? [full] : [];
  });
}

describe("API route files", () => {
  const files = routeFiles(apiDir);

  it("finds the route handlers, whatever their extension", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const name of ["route.ts", "route.js", "route.mjs", "route.tsx"]) {
      expect(ROUTE_FILE.test(name)).toBe(true);
    }
  });

  it.each(files.map((file) => [path.relative(apiDir, file), file]))(
    "%s exports only defineRoute handlers",
    async (relative, file) => {
      if (EXEMPT.has(relative)) return;
      const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
      const methods = HTTP_METHODS.filter((method) => method in mod);
      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        expect([method, isDefinedRoute(mod[method])]).toEqual([method, true]);
      }
    },
  );

  it("would catch a raw handler re-exported next to a defineRoute one", async () => {
    const { defineRoute } = await import("@/server/http");
    const raw = async () => new Response("ok");
    const mod: Record<string, unknown> = {
      GET: defineRoute({ method: "GET", auth: "public" }, () => null),
      POST: raw,
    };
    const unguarded = HTTP_METHODS.filter((m) => m in mod && !isDefinedRoute(mod[m]));
    expect(unguarded).toEqual(["POST"]);
  });
});
