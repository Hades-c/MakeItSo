import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Colours only via tokens (PLAN §7, audit design-visual/token-drift-reds-hex): no raw hex/rgb/hsl colours, no
 * default Tailwind palette classes and no dynamically built colour classes in app/, components/ or lib/. The one
 * place raw colours live is app/globals.css.
 */
const root = fileURLToPath(new URL("../..", import.meta.url));
const DIRS = ["app", "components", "lib"];
const ALLOWED = new Set(["app/globals.css"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css|mjs)$/.test(name) ? [path] : [];
  });
}

const sources = DIRS.flatMap((d) => files(join(root, d)))
  .map((path) => ({
    path: relative(root, path).split("\\").join("/"),
    text: readFileSync(path, "utf8"),
  }))
  .filter((f) => !ALLOWED.has(f.path));

const PALETTE =
  "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)";
const UTILITY =
  "(?:bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|decoration|divide|placeholder|caret|accent)";

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: "raw hex colour",
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![-\w])/g,
  },
  { name: "raw colour function", pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(/g },
  {
    name: "default Tailwind palette class",
    pattern: new RegExp(`\\b${UTILITY}-(?:${PALETTE}-\\d{2,3}|white|black)\\b`, "g"),
  },
  { name: "dynamically built class name", pattern: new RegExp(`\\b${UTILITY}-\\$\\{`, "g") },
];

describe("no raw colours outside app/globals.css", () => {
  it("scans the source tree", () => {
    expect(sources.length).toBeGreaterThan(40);
  });

  it.each(RULES)("no $name", ({ pattern }) => {
    const hits = sources.flatMap(({ path, text }) =>
      [...text.matchAll(pattern)].map((m) => `${path}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
