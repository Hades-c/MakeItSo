// Checks the first-load JavaScript of the key pages after `next build` (PLAN §6.2 perf budget: under 200 KB
// gzipped). Reads .next/diagnostics/route-bundle-stats.json (written by next build), gzips each route's first-load
// chunks at level 9 and sums them.
// Usage: node scripts/check-built-js.mjs [buildDir]   (default: .next)   --all prints every route
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const MAX_FIRST_LOAD_GZIP_BYTES = 200 * 1024;
/** The pages the budget applies to (PLAN §6.2 "first-load JS <200 KB on key pages"). */
export const KEY_ROUTES = ["/today", "/courses", "/courses/[term]/[code]", "/plan"];

const gzipCache = new Map();
function gzipSize(path) {
  let size = gzipCache.get(path);
  if (size === undefined) {
    size = gzipSync(readFileSync(path), { level: 9 }).length;
    gzipCache.set(path, size);
  }
  return size;
}

/** { route, gzipBytes } for every route in the build's stats. */
export function routeSizes(buildDir) {
  const statsPath = join(buildDir, "diagnostics", "route-bundle-stats.json");
  if (!existsSync(statsPath)) throw new Error(`${statsPath} not found: run next build first`);
  const stats = JSON.parse(readFileSync(statsPath, "utf8"));
  // Chunk paths are relative to the project directory (".next/static/chunks/…").
  const projectDir = dirname(resolve(buildDir));
  return stats.map((entry) => ({
    route: entry.route,
    gzipBytes: entry.firstLoadChunkPaths.reduce(
      (sum, chunk) => sum + gzipSize(resolve(projectDir, chunk)),
      0,
    ),
  }));
}

export function checkBuild(buildDir, routes = KEY_ROUTES) {
  const sizes = routeSizes(buildDir);
  const errors = [];
  for (const route of routes) {
    const found = sizes.find((s) => s.route === route);
    if (!found) errors.push(`${route}: not in the build's route stats`);
    else if (found.gzipBytes > MAX_FIRST_LOAD_GZIP_BYTES) {
      errors.push(
        `${route}: first-load JS ${(found.gzipBytes / 1024).toFixed(1)} KB gzipped, over the ${MAX_FIRST_LOAD_GZIP_BYTES / 1024} KB budget`,
      );
    }
  }
  return { sizes, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const buildDir = args.find((a) => !a.startsWith("--")) ?? ".next";
  const { sizes, errors } = checkBuild(buildDir);
  const shown = args.includes("--all") ? sizes : sizes.filter((s) => KEY_ROUTES.includes(s.route));
  for (const { route, gzipBytes } of shown.sort((a, b) => b.gzipBytes - a.gzipBytes)) {
    process.stdout.write(`${(gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${route}\n`);
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  process.stdout.write(
    `✓ first-load JS within ${MAX_FIRST_LOAD_GZIP_BYTES / 1024} KB gzipped on ${KEY_ROUTES.join(", ")}\n`,
  );
}
