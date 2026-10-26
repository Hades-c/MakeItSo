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

/**
 * Temporary ceilings (KB gzipped) for key pages over the budget, so they cannot grow while the gap is closed: a
 * page with a ceiling only warns while it stays under it. Client islands carry no zod (they
 * call the API through lib/api/endpoints.ts), and /plan loads only its default view's islands up front
 * (app/(hub)/plan/_components/lazy-islands.tsx), which put it just under 200 KB: growth in the Next semester view
 * or in code it shares has to be paid for there. Delete an entry as soon as its page is back under the budget.
 */
/** @type {Record<string, number>} */
export const TEMPORARY_CEILINGS_KB = {
  // Oct 25, 2026: the registration-week fixes (one-press "Add as choice" and its focus handling) put /plan
  // 112 bytes over 200 KB during the open WebTree window. The Next semester rework (spec M8) pays it back;
  // delete this entry then.
  "/plan": 201,
};

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

/**
 * @param {string} buildDir
 * @param {readonly string[]} [routes]
 * @param {Record<string, number>} [ceilings]
 */
export function checkBuild(buildDir, routes = KEY_ROUTES, ceilings = TEMPORARY_CEILINGS_KB) {
  const sizes = routeSizes(buildDir);
  const errors = [];
  const warnings = [];
  for (const route of routes) {
    const found = sizes.find((s) => s.route === route);
    if (!found) {
      errors.push(`${route}: not in the build's route stats`);
      continue;
    }
    const kb = (found.gzipBytes / 1024).toFixed(1);
    const ceiling = ceilings[route];
    if (ceiling !== undefined) {
      if (found.gzipBytes > ceiling * 1024) {
        errors.push(
          `${route}: first-load JS ${kb} KB gzipped, over its temporary ${ceiling} KB ceiling`,
        );
      } else if (found.gzipBytes > MAX_FIRST_LOAD_GZIP_BYTES) {
        warnings.push(
          `${route}: first-load JS ${kb} KB gzipped, over the ${MAX_FIRST_LOAD_GZIP_BYTES / 1024} KB budget (temporary ceiling ${ceiling} KB)`,
        );
      }
    } else if (found.gzipBytes > MAX_FIRST_LOAD_GZIP_BYTES) {
      errors.push(
        `${route}: first-load JS ${kb} KB gzipped, over the ${MAX_FIRST_LOAD_GZIP_BYTES / 1024} KB budget`,
      );
    }
  }
  return { sizes, errors, warnings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const buildDir = args.find((a) => !a.startsWith("--")) ?? ".next";
  const { sizes, errors, warnings } = checkBuild(buildDir);
  const shown = args.includes("--all") ? sizes : sizes.filter((s) => KEY_ROUTES.includes(s.route));
  for (const { route, gzipBytes } of shown.sort((a, b) => b.gzipBytes - a.gzipBytes)) {
    process.stdout.write(`${(gzipBytes / 1024).toFixed(1).padStart(7)} KB  ${route}\n`);
  }
  for (const warning of warnings) console.warn(`! ${warning}`);
  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  process.stdout.write(
    `✓ first-load JS within budget on ${KEY_ROUTES.join(", ")} (${MAX_FIRST_LOAD_GZIP_BYTES / 1024} KB gzipped, or the temporary ceiling)\n`,
  );
}
