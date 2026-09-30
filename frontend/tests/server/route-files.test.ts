import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PLAN §4.1.9: every app/api/**\/route.ts is built with defineRoute (auth, CSRF, limits, validation and typed
 * errors in one place). The NextAuth catch-all is the only exception: it has its own CSRF token.
 */
const apiDir = fileURLToPath(new URL("../../app/api", import.meta.url));
const EXEMPT = new Set([path.join("auth", "[...nextauth]", "route.ts")]);
const HTTP_EXPORTS =
  /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return /^route\.(ts|tsx|js)$/.test(name) ? [full] : [];
  });
}

describe("API route files", () => {
  const files = routeFiles(apiDir);

  it("finds the route handlers", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it.each(files.map((file) => [path.relative(apiDir, file), file]))(
    "%s uses defineRoute for every method",
    (relative, file) => {
      if (EXEMPT.has(relative)) return;
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/from "@\/server\/http"/);
      const methods = [...source.matchAll(HTTP_EXPORTS)].map((m) => m[1]);
      expect(methods.length).toBeGreaterThan(0);
      for (const method of methods) {
        expect(source).toMatch(new RegExp(`export const ${method} = defineRoute\\(`));
      }
    },
  );
});
