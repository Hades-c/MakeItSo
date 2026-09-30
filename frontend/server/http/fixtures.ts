import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXTERNAL_SERVICE_IDS, type ExternalServiceId } from "@/lib/sources";

/**
 * EXTERNAL_MODE=fixtures (PLAN §4.1.10): upstream responses come from
 * `tests/fixtures/external/<sourceId>/manifest.json`, never the network. Used by vitest, e2e and CI.
 *
 * A manifest lists routes; the first route that matches a request wins:
 *   {
 *     "source": "course-schedule",
 *     "description": "...",
 *     "routes": [
 *       { "url": "https://api.davidson.edu/api/public/v2/courses?limit=1000&offset=0&term_code=202601",
 *         "file": "courses-202601.json" },
 *       { "url": "https://api.davidson.edu/api/public/v2/terms?limit=*", "file": "terms.json" },
 *       { "method": "POST", "url": "https://www.ratemyprofessors.com/graphql", "bodyIncludes": "U2Nob29sLTM5NjU=",
 *         "file": "teachers-davidson.json" }
 *     ]
 *   }
 * Matching: same method, origin and path; the request's query parameters must be exactly the route's (any order),
 * where a route value of "*" accepts any value — unless the route sets "anyQuery": true. `bodyIncludes` must be a
 * substring of the request body. `status` defaults to 200 and `contentType` to one derived from the file name.
 * A request with no matching route throws MissingFixtureError: add a fixture rather than catching it.
 */

export const FixtureRouteSchema = z
  .object({
    method: z.enum(["GET", "POST"]).default("GET"),
    url: z.url({ protocol: /^https$/ }),
    anyQuery: z.boolean().default(false),
    bodyIncludes: z.string().optional(),
    file: z.string().regex(/^[\w.-]+$/, "must be a file name in the manifest's directory"),
    status: z.number().int().min(100).max(599).default(200),
    contentType: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
export type FixtureRoute = z.output<typeof FixtureRouteSchema>;

export const FixtureManifestSchema = z
  .object({
    source: z.enum(EXTERNAL_SERVICE_IDS),
    description: z.string(),
    /** When the real responses were captured ("YYYY-MM-DD"). */
    capturedAt: z.string().optional(),
    routes: z.array(FixtureRouteSchema).min(1),
  })
  .strict();
export type FixtureManifest = z.output<typeof FixtureManifestSchema>;

/** Thrown for a request no fixture covers. Never catch it: it means a test (or fixture) is missing. */
export class MissingFixtureError extends Error {
  constructor(
    readonly sourceId: ExternalServiceId,
    readonly method: string,
    readonly url: string,
  ) {
    super(
      `No fixture for ${method} ${url} (source "${sourceId}"). Add a route to ` +
        `tests/fixtures/external/${sourceId}/manifest.json, or run with EXTERNAL_MODE=live.`,
    );
    this.name = "MissingFixtureError";
  }
}

/**
 * tests/fixtures/external, resolved from the working directory (vitest, next start and CI run in frontend/). The
 * turbopackIgnore hints keep the fixtures out of the production output-file trace.
 */
export function fixturesRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "tests", "fixtures", "external");
}

const manifests = new Map<ExternalServiceId, Promise<FixtureManifest>>();

export function loadManifest(sourceId: ExternalServiceId): Promise<FixtureManifest> {
  let pending = manifests.get(sourceId);
  if (!pending) {
    const file = path.join(/* turbopackIgnore: true */ fixturesRoot(), sourceId, "manifest.json");
    pending = readFile(/* turbopackIgnore: true */ file, "utf8").then((text) => {
      const manifest = FixtureManifestSchema.parse(JSON.parse(text));
      if (manifest.source !== sourceId) {
        throw new Error(`${file} declares source "${manifest.source}", expected "${sourceId}"`);
      }
      return manifest;
    });
    pending.catch(() => manifests.delete(sourceId));
    manifests.set(sourceId, pending);
  }
  return pending;
}

function queryMatches(route: FixtureRoute, request: URL): boolean {
  if (route.anyQuery) return true;
  const expected = new URL(route.url).searchParams;
  const actual = request.searchParams;
  const expectedKeys = [...new Set(expected.keys())].sort();
  const actualKeys = [...new Set(actual.keys())].sort();
  if (expectedKeys.join("&") !== actualKeys.join("&")) return false;
  return expectedKeys.every((key) => {
    const want = expected.getAll(key);
    const got = actual.getAll(key);
    if (want.length !== got.length) return false;
    return want.every((value, i) => value === "*" || value === got[i]);
  });
}

/** The first manifest route matching the request, or null. */
export function matchRoute(
  manifest: FixtureManifest,
  method: string,
  url: string,
  body?: string,
): FixtureRoute | null {
  const request = new URL(url);
  for (const route of manifest.routes) {
    if (route.method !== method.toUpperCase()) continue;
    const target = new URL(route.url);
    if (target.origin !== request.origin || target.pathname !== request.pathname) continue;
    if (!queryMatches(route, request)) continue;
    if (route.bodyIncludes !== undefined && !(body ?? "").includes(route.bodyIncludes)) continue;
    return route;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".rss": "application/rss+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface FixtureResponse {
  status: number;
  contentType: string;
  body: Buffer;
  /** Path of the served file, for error messages. */
  file: string;
}

/** Resolve a request to its fixture file. Throws MissingFixtureError when nothing matches. */
export async function resolveFixture(
  sourceId: ExternalServiceId,
  method: string,
  url: string,
  body?: string,
): Promise<FixtureResponse> {
  const manifest = await loadManifest(sourceId);
  const route = matchRoute(manifest, method, url, body);
  if (!route) throw new MissingFixtureError(sourceId, method.toUpperCase(), url);
  const file = path.join(/* turbopackIgnore: true */ fixturesRoot(), sourceId, route.file);
  return {
    status: route.status,
    contentType:
      route.contentType ??
      CONTENT_TYPES[path.extname(route.file).toLowerCase()] ??
      "application/octet-stream",
    body: await readFile(/* turbopackIgnore: true */ file),
    file,
  };
}

/** Test helper: forget cached manifests. */
export function resetFixtureCache(): void {
  manifests.clear();
}
