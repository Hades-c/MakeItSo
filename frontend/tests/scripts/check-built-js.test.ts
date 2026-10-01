import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkBuild,
  KEY_ROUTES,
  MAX_FIRST_LOAD_GZIP_BYTES,
  routeSizes,
} from "../../scripts/check-built-js.mjs";

/** A fake project with a .next/diagnostics/route-bundle-stats.json and its chunks. */
function fakeBuild(routes: Record<string, { name: string; bytes: number }[]>) {
  const project = mkdtempSync(path.join(tmpdir(), "check-js-"));
  const buildDir = path.join(project, ".next");
  mkdirSync(path.join(buildDir, "static", "chunks"), { recursive: true });
  mkdirSync(path.join(buildDir, "diagnostics"), { recursive: true });
  const stats = Object.entries(routes).map(([route, chunks]) => ({
    route,
    firstLoadChunkPaths: chunks.map(({ name, bytes }) => {
      const rel = `.next/static/chunks/${name}`;
      // Random bytes do not compress: gzip size ≈ raw size.
      writeFileSync(path.join(project, rel), randomBytes(bytes));
      return rel;
    }),
  }));
  writeFileSync(
    path.join(buildDir, "diagnostics", "route-bundle-stats.json"),
    JSON.stringify(stats),
  );
  return { project, buildDir };
}

let cleanup: string[] = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

describe("check-built-js", () => {
  it("sums each route's gzipped first-load chunks and fails a key route over the budget", () => {
    const shared = { name: "shared.js", bytes: 100 * 1024 };
    const { project, buildDir } = fakeBuild({
      "/today": [shared, { name: "today.js", bytes: 50 * 1024 }],
      "/courses": [shared],
      "/courses/[term]/[code]": [shared],
      "/plan": [shared, { name: "plan.js", bytes: 120 * 1024 }],
      "/": [shared],
    });
    cleanup.push(project);
    const sizes: { route: string; gzipBytes: number }[] = routeSizes(buildDir);
    const today = sizes.find((entry) => entry.route === "/today")!;
    expect(today.gzipBytes).toBeGreaterThan(150 * 1024);
    expect(today.gzipBytes).toBeLessThan(152 * 1024);
    const { errors } = checkBuild(buildDir);
    expect(MAX_FIRST_LOAD_GZIP_BYTES).toBe(200 * 1024);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^\/plan: first-load JS 2\d\d\.\d KB gzipped, over the 200 KB budget$/,
    );
  });

  it("reports a key route missing from the stats, and a build that has not run", () => {
    const { project, buildDir } = fakeBuild({ "/today": [{ name: "a.js", bytes: 10 }] });
    cleanup.push(project);
    const { errors } = checkBuild(buildDir);
    expect(errors).toEqual(
      KEY_ROUTES.filter((r) => r !== "/today").map((r) => `${r}: not in the build's route stats`),
    );
    expect(() => routeSizes(path.join(project, "nowhere"))).toThrow(/run next build first/);
  });
});
