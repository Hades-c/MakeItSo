/**
 * LIVE smoke test of the RateMyProfessors tag counts (server/rmp/tags.ts) against the real GraphQL endpoint. It is
 * read-only, sends a handful of requests and stores nothing: one roster request (the production roster query,
 * first page only), then the production tag request for the most-rated Davidson teachers, and one follow-up page
 * for a teacher with more ratings than one page holds. It reports
 *   - the ratings read per teacher next to RMP's numRatings (by legacyId; no names are printed);
 *   - how often each RMP_TAGS entry was used;
 *   - every tag string that is NOT in RMP_TAGS, which the app drops: the list to review if RMP changes its tags;
 *   - that paging advanced, and the top tags the app would store for each teacher.
 * No review text is requested (the tag query asks for ratingTags and paging fields only).
 *
 * NEVER in CI and never in the test suite: it calls RateMyProfessors. Run by hand:
 *
 *   cd frontend
 *   RMP_LIVE_SMOKE=1 node --experimental-transform-types scripts/rmp-tags-smoke.ts                # 1 + 3 requests
 *   RMP_LIVE_SMOKE=1 node --experimental-transform-types scripts/rmp-tags-smoke.ts --requests=5   # at most 9 + 1
 *   RMP_LIVE_SMOKE=1 node --experimental-transform-types scripts/rmp-tags-smoke.ts --requests=2 --page-size=20
 *                                                                  # small pages: the last request pages on
 *   node --experimental-transform-types scripts/rmp-tags-smoke.ts --dry-run   # print a tag request body, no call
 *
 * Behind an HTTPS proxy, Node's fetch also needs NODE_USE_ENV_PROXY=1 (Node 22.21+). The app modules it imports use
 * TypeScript parameter properties, so Node runs it with --experimental-transform-types (shown above); the "@/…"
 * imports and "server-only" are resolved by the module hook below (as in scripts/ai-smoke.ts).
 * Exit code 0 = every answer parsed, paging advanced (when a teacher needed it) and no unknown tag was seen.
 */
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    let base: string | null = null;
    if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
    else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      path.extname(specifier) === ""
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const file = resolveFile(base);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      // Package subpaths without an exports map ("next/server") need their file name under plain Node ESM.
      if (/^[a-z@][^:]*\/[^.]+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
      throw error;
    }
  },
});

/** Tag requests per run: default and hard cap (with the roster request, 10 requests at most). */
const DEFAULT_TAG_REQUESTS = 3;
const MAX_TAG_REQUESTS = 9;

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

interface Args {
  requests: number;
  /** Ratings per teacher per request (default: the app's TAG_PAGE_SIZE). */
  pageSize: number | null;
  dryRun: boolean;
  error?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { requests: DEFAULT_TAG_REQUESTS, pageSize: null, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--requests=")) {
      args.requests = Number(arg.slice("--requests=".length));
      if (
        !Number.isInteger(args.requests) ||
        args.requests < 1 ||
        args.requests > MAX_TAG_REQUESTS
      ) {
        return { ...args, error: `--requests must be 1-${MAX_TAG_REQUESTS}` };
      }
    } else if (arg.startsWith("--page-size=")) {
      args.pageSize = Number(arg.slice("--page-size=".length));
      if (!Number.isInteger(args.pageSize) || args.pageSize < 1 || args.pageSize > 100) {
        return { ...args, error: "--page-size must be 1-100" };
      }
    } else return { ...args, error: `Unknown argument ${arg}` };
  }
  return args;
}

interface Teacher {
  legacyId: number;
  rmpId: string;
  numRatings: number;
  after: string | null;
  read: number;
  counts: Map<string, number>;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (process.env.CI) {
    process.stderr.write("rmp-tags-smoke calls RateMyProfessors: it never runs in CI.\n");
    return 2;
  }
  if (!args.dryRun && process.env.RMP_LIVE_SMOKE !== "1") {
    process.stderr.write("Set RMP_LIVE_SMOKE=1 to call RateMyProfessors (or pass --dry-run).\n");
    return 2;
  }
  delete process.env.EXTERNAL_MODE;

  const { RMP_TAGS } = await import("@/lib/types/ratings");
  const { fetchExternal } = await import("@/server/http/external");
  const { RMP_GRAPHQL_URL, parseRosterPage, rosterRequestBody } =
    await import("@/server/rmp/roster");
  const tagsModule = await import("@/server/rmp/tags");
  const {
    normalizeTag,
    parseTagsResponse,
    tagsRequestBody,
    topTags,
    TAG_BATCH_SIZE,
    TAG_SEPARATOR,
  } = tagsModule;
  const pageSize = args.pageSize ?? tagsModule.TAG_PAGE_SIZE;

  if (args.dryRun) {
    out(
      JSON.stringify(
        tagsRequestBody([
          { legacyId: 9000001, rmpId: "VGVhY2hlci05MDAwMDAx", after: null },
          { legacyId: 9000002, rmpId: "VGVhY2hlci05MDAwMDAy", after: "cursor" },
        ]),
        null,
        2,
      ),
    );
    return 0;
  }

  let sent = 0;
  const post = async (body: unknown) => {
    sent++;
    const started = performance.now();
    const res = await fetchExternal("ratemyprofessors", RMP_GRAPHQL_URL, {
      method: "POST",
      body,
      timeoutMs: 20_000,
      maxBytes: 8 * 1024 * 1024,
    });
    out(`  request ${sent}: HTTP ${res.status} in ${Math.round(performance.now() - started)} ms`);
    return res.data;
  };

  out("Roster (first page):");
  const roster = parseRosterPage(await post(rosterRequestBody(null)));
  const rated = roster.rows.filter((row) => row.numRatings >= 1);
  out(
    `  ${roster.rows.length} Davidson teachers on the page (${roster.resultCount ?? "?"} announced), ` +
      `${rated.length} with ratings, ${rated.reduce((sum, row) => sum + row.numRatings, 0)} ratings in all`,
  );

  const teachers: Teacher[] = [...rated]
    .sort((a, b) => b.numRatings - a.numRatings)
    .map((row) => ({
      legacyId: row.legacyId,
      rmpId: row.rmpId,
      numRatings: row.numRatings,
      after: null,
      read: 0,
      counts: new Map(),
    }));
  const known = new Map<string, number>();
  const unknown = new Map<string, number>();
  let ratingsRead = 0;
  let ratingsTagged = 0;
  let ok = true;
  const continuing: Teacher[] = [];
  let next = 0;

  out("Tags:");
  for (let request = 0; request < args.requests; request++) {
    // The last request pages on (when a teacher has more); the others start new teachers.
    const pageOn = continuing.length > 0 && request === args.requests - 1;
    const batch = pageOn
      ? continuing.splice(0, TAG_BATCH_SIZE)
      : teachers.slice(next, (next += TAG_BATCH_SIZE));
    if (batch.length === 0) break;
    const data = await post(tagsRequestBody(batch, pageSize));
    let pages;
    try {
      pages = parseTagsResponse(data, batch);
    } catch (error) {
      out(`  unusable answer: ${(error as Error).message}`);
      ok = false;
      break;
    }
    const nodes = (data as { data?: Record<string, unknown> }).data ?? {};
    for (const teacher of batch) {
      const page = pages.get(teacher.legacyId);
      if (!page) {
        out(`  ${teacher.legacyId}: no usable answer`);
        ok = false;
        continue;
      }
      // The raw strings, to list what the app would drop.
      const edges =
        (
          nodes[`t${teacher.legacyId}`] as {
            ratings?: { edges?: { node?: { ratingTags?: string | null } }[] };
          }
        )?.ratings?.edges ?? [];
      for (const edge of edges) {
        const raw = edge.node?.ratingTags ?? "";
        if (raw.trim()) ratingsTagged++;
        for (const part of raw.split(TAG_SEPARATOR)) {
          if (!part.trim()) continue;
          const tag = normalizeTag(part);
          if (tag) known.set(tag, (known.get(tag) ?? 0) + 1);
          else {
            const shown = JSON.stringify(part.slice(0, 60));
            unknown.set(shown, (unknown.get(shown) ?? 0) + 1);
          }
        }
      }
      ratingsRead += page.ratings;
      teacher.read += page.ratings;
      for (const tags of page.tags) {
        for (const tag of tags) teacher.counts.set(tag, (teacher.counts.get(tag) ?? 0) + 1);
      }
      if (pageOn && page.endCursor === teacher.after) {
        out(`  ${teacher.legacyId}: the cursor did not advance`);
        ok = false;
      }
      if (page.hasNextPage && page.endCursor) {
        teacher.after = page.endCursor;
        continuing.push(teacher);
      } else if (page.hasNextPage) {
        out(`  ${teacher.legacyId}: a next page without a cursor`);
        ok = false;
      }
    }
  }

  out();
  out("Per teacher (legacyId: ratings read / RMP numRatings → top tags as stored):");
  for (const teacher of teachers.filter((t) => t.read > 0)) {
    const more = continuing.includes(teacher) ? " (more pages not read)" : "";
    const top = topTags(teacher.counts as Map<(typeof RMP_TAGS)[number], number>)
      .map(({ tag, count }) => `${tag} (${count})`)
      .join(", ");
    out(
      `  ${teacher.legacyId}: ${teacher.read} / ${teacher.numRatings}${more} → ${top || "no tags"}`,
    );
  }
  out();
  out(`Ratings read: ${ratingsRead}; with tags: ${ratingsTagged}. Requests sent: ${sent}.`);
  out("RMP_TAGS seen:");
  for (const tag of RMP_TAGS) out(`  ${String(known.get(tag) ?? 0).padStart(5)}  ${tag}`);
  out(unknown.size === 0 ? "Tags outside RMP_TAGS: none" : "Tags outside RMP_TAGS (dropped):");
  for (const [tag, count] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    out(`  ${String(count).padStart(5)}  ${tag}`);
  }
  if (unknown.size > 0) ok = false;
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `rmp-tags-smoke failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  },
);
