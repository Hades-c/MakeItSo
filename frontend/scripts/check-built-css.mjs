// Checks the CSS that `next build` emitted (run it after a build; CI does):
//   1. the type floor: no font size below 12px anywhere (PLAN §7), including --text-* tokens and arbitrary
//      values such as text-[11px];
//   2. the CSS budget: all stylesheets together under 80 KB gzipped (PLAN §6.2 perf budget).
// Usage: node scripts/check-built-css.mjs [buildDir]   (default: .next)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const MIN_FONT_PX = 12;
export const MAX_CSS_GZIP_BYTES = 80 * 1024;
const ROOT_PX = 16;

/** Absolute size in px for "11px", ".75rem", "9pt"; null for relative or computed values (%, em, var(), calc()). */
export function toPx(value) {
  const m = /^(-?\d*\.?\d+)(px|rem|pt)$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === "px") return n;
  if (m[2] === "rem") return n * ROOT_PX;
  return (n * 4) / 3;
}

/** Every font size in the stylesheet (declarations and --text-* tokens) that resolves below the floor. */
export function findSmallFontSizes(css, minPx = MIN_FONT_PX) {
  const problems = [];
  for (const m of css.matchAll(/font-size\s*:\s*([^;}!]+)/g)) {
    const px = toPx(m[1]);
    if (px !== null && px < minPx) problems.push(`font-size: ${m[1].trim()} (${px}px)`);
  }
  // Type-scale tokens (--text-xs: .75rem), not their --line-height / --letter-spacing companions.
  for (const m of css.matchAll(/(--text-[\w-]+)\s*:\s*([^;}]+)/g)) {
    if (/--(line-height|letter-spacing|font-weight)$/.test(m[1])) continue;
    const px = toPx(m[2]);
    if (px !== null && px < minPx) problems.push(`${m[1]}: ${m[2].trim()} (${px}px)`);
  }
  return problems;
}

function cssFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

export function checkBuild(buildDir) {
  const files = cssFiles(join(buildDir, "static"));
  const errors = [];
  if (files.length === 0)
    errors.push(`no CSS found under ${join(buildDir, "static")}: run next build first`);
  let gzipBytes = 0;
  for (const file of files) {
    const css = readFileSync(file, "utf8");
    gzipBytes += gzipSync(css).length;
    for (const problem of findSmallFontSizes(css)) {
      errors.push(
        `${relative(buildDir, file)}: ${problem} is below the ${MIN_FONT_PX}px type floor`,
      );
    }
  }
  if (gzipBytes > MAX_CSS_GZIP_BYTES) {
    errors.push(
      `CSS is ${(gzipBytes / 1024).toFixed(1)} KB gzipped; the budget is ${MAX_CSS_GZIP_BYTES / 1024} KB`,
    );
  }
  return { files: files.length, gzipBytes, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const buildDir = process.argv[2] ?? ".next";
  const { files, gzipBytes, errors } = checkBuild(buildDir);
  if (errors.length > 0) {
    for (const error of errors) console.error(`✗ ${error}`);
    process.exit(1);
  }
  process.stdout.write(
    `✓ ${files} stylesheet(s), ${(gzipBytes / 1024).toFixed(1)} KB gzipped, no font size below ${MIN_FONT_PX}px\n`,
  );
}
