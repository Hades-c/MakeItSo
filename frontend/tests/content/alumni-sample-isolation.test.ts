import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { Flags } from "@/lib/flags";
import * as contentBarrel from "@/server/content";
import {
  alumniDirectory,
  alumniForCareer,
  contactableAlumni,
  getAlumnus,
  notableAlumni,
} from "@/server/content/alumni";
import { isSampleAlumnusId, SAMPLE_ALUMNI } from "@/server/content/alumni-sample";
import { CAREER_SLUGS } from "@/server/content/careers";
import type { SearchContext } from "@/server/search";
import { search as alumniSearch } from "@/server/search/providers/alumni";
import { search as careersSearch } from "@/server/search/providers/careers";
import { search as pagesSearch } from "@/server/search/providers/pages";

/**
 * The Davidson Connect preview's sample profiles never leave the preview (owner's rule: anything not real is
 * labelled wherever it appears, so it must not appear anywhere unlabelled). Checked two ways:
 *
 * - statically: only the preview page's own files and the career pages' preview link import
 *   server/content/alumni-sample.ts; the content barrel does not re-export it, so no search provider, AI feature,
 *   API route, account export or the verified directory can reach it;
 * - at run time: no sample id or name comes out of the verified alumni loaders or site search (the cold e-mail's
 *   404 for every sample id is in tests/ai/cold-email.test.ts).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCANNED = ["app", "components", "lib", "models", "server", "proxy.ts"];
const ALLOWED = new Set([
  "app/(hub)/alumni/preview/page.tsx",
  "app/(hub)/alumni/preview/_components/preview-notice.tsx",
  "app/(hub)/alumni/preview/_components/sample-alumnus-card.tsx",
  "app/(hub)/alumni/preview/_components/sample-directory.tsx",
  "app/(hub)/alumni/preview/_components/sample-filters.tsx",
  "app/(hub)/alumni/preview/_lib/sample-directory.ts",
  "app/(hub)/careers/_components/career-alumni-preview.tsx",
  "server/content/alumni-sample.ts",
]);

function sourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  if (/\.(ts|tsx|mjs)$/.test(path)) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() || /\.(ts|tsx|mjs)$/.test(entry.name)
      ? sourceFiles(join(path, entry.name))
      : [],
  );
}

const ALL_ON: Flags = {
  careers: true,
  events: true,
  alumni: true,
  alumniPreview: true,
  ai: true,
  moodle: true,
  rmp: true,
  rmpSummaries: false,
};

function verifiedCtx(): SearchContext {
  return {
    user: { id: "0123456789abcdef01234567", email: "sam@davidson.edu", name: "Sam" },
    flags: ALL_ON,
    isVerifiedDavidson: vi.fn(async () => true),
    now: new Date("2026-09-30T14:00:00Z"),
  };
}

describe("Davidson Connect sample profiles stay in the preview", () => {
  it("are imported only by the preview page and the career pages' preview link", () => {
    const importers = SCANNED.flatMap(sourceFiles)
      .filter((file) =>
        /from\s+["'][^"']*content\/alumni-sample["']|import\(["'][^"']*alumni-sample/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(ROOT, file));
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((file) => !ALLOWED.has(file))).toEqual([]);
    // No API route, AI feature, search provider or account module among them.
    expect(
      importers.filter((file) => /^(app\/api|server\/(ai|search|account))\//.test(file)),
    ).toEqual([]);
  });

  it("are not re-exported by the content barrel", () => {
    expect(Object.keys(contentBarrel)).not.toContain("SAMPLE_ALUMNI");
    expect(Object.keys(contentBarrel)).not.toContain("sampleAlumniDirectory");
  });

  it("never reach the verified alumni loaders", () => {
    const sampleNames = new Set(SAMPLE_ALUMNI.map((r) => r.name));
    const loaded = [
      ...alumniDirectory(),
      ...contactableAlumni(),
      ...notableAlumni(),
      ...CAREER_SLUGS.flatMap((slug) => alumniForCareer(slug)),
    ];
    expect(loaded.length).toBeGreaterThan(0);
    for (const alumnus of loaded) {
      expect(isSampleAlumnusId(alumnus.id), alumnus.id).toBe(false);
      expect(sampleNames.has(alumnus.name), alumnus.name).toBe(false);
    }
    for (const record of SAMPLE_ALUMNI) expect(getAlumnus(record.id)).toBeUndefined();
  });

  it("never come out of site search, even for a verified viewer searching their names", async () => {
    for (const record of SAMPLE_ALUMNI) {
      for (const q of [record.name, record.name.split(" ")[1]!, record.role]) {
        const results = [
          ...(await alumniSearch(q, 20, verifiedCtx())),
          ...(await careersSearch(q, 20, verifiedCtx())),
          ...(await pagesSearch(q, 20, verifiedCtx())),
        ];
        for (const result of results) {
          expect(isSampleAlumnusId(result.id), `${q} → ${result.id}`).toBe(false);
          expect(result.title, q).not.toBe(record.name);
          expect(result.href, q).not.toContain("/alumni/preview");
        }
      }
    }
  });
});
