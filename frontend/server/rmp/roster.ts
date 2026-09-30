import "server-only";
import { z } from "zod";
import { RMP_DAVIDSON_SCHOOL_ID, type RosterSyncResult } from "@/lib/types/ratings";
import RmpTeacher from "@/models/RmpTeacher";
import { now } from "@/server/clock";
import { getDb, trusted } from "@/server/db";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import { indexTokens, normalizeName } from "@/server/rmp/normalize";
import { recordSync } from "@/server/sync";

/**
 * The weekly RateMyProfessors roster job (PLAN §5 "Ratings (RMP)"): ONE GraphQL search for every Davidson teacher,
 * paged with the `after` cursor, stored in `rmpteachers`. No per-view calls, no proxy route, no review text, no
 * Authorization header (the public search needs none).
 *
 *   POST https://www.ratemyprofessors.com/graphql
 *   newSearch.teachers(query: { text: "", schoolID: "U2Nob29sLTM5NjU=" }, first: 1000, after: <cursor>)
 *
 * Every node is validated with zod; nodes whose school.id is not Davidson's are dropped and counted
 * (`rejectedOtherSchool`), malformed nodes are dropped and counted. The run fails, keeps the stored roster and is
 * recorded with `recordSync("ratemyprofessors", { ok: false, ... })` when the roster looks incomplete or wrong:
 * any GraphQL error (even next to data), a fallback search, a next page without a cursor, a pagination loop or
 * runaway, fewer nodes than 95% of the first page's resultCount, too many malformed nodes, an empty roster, or
 * one smaller than half the stored roster. A database failure while storing is recorded too, then rethrown.
 */

export const RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";

/** RMP's public profile page for a teacher (the rating's link). */
export function rmpProfileUrl(legacyId: number): string {
  return `https://www.ratemyprofessors.com/professor/${legacyId}`;
}

export const ROSTER_PAGE_SIZE = 1000;
/** Davidson has ~1,000 profiles; ten pages is a runaway guard, not a limit anyone should reach. */
export const ROSTER_MAX_PAGES = 10;
export const ROSTER_TIMEOUT_MS = 20_000;
/** A new roster smaller than this share of the stored one is treated as an upstream failure. */
export const ROSTER_MIN_KEEP_RATIO = 0.5;
/** Nodes received must reach this share of the resultCount RMP announces on the first page. */
export const ROSTER_MIN_COMPLETE_RATIO = 0.95;

export const ROSTER_QUERY = `query DavidsonTeacherRoster($query: TeacherSearchQuery!, $first: Int!, $after: String) {
  newSearch {
    teachers(query: $query, first: $first, after: $after) {
      didFallback
      resultCount
      pageInfo { hasNextPage endCursor }
      edges {
        cursor
        node {
          id
          legacyId
          firstName
          lastName
          department
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
          school { id }
        }
      }
    }
  }
}`;

/** The GraphQL request body for one page. `after` is omitted on the first page. */
export function rosterRequestBody(after: string | null) {
  return {
    query: ROSTER_QUERY,
    variables: {
      query: { text: "", schoolID: RMP_DAVIDSON_SCHOOL_ID },
      first: ROSTER_PAGE_SIZE,
      ...(after ? { after } : {}),
    },
  };
}

// ---- Upstream shapes ---------------------------------------------------------------------------------------------

const SchoolOfNodeSchema = z.object({
  school: z.object({ id: z.string() }).nullish(),
});

export const RmpTeacherNodeSchema = z.object({
  id: z.string().min(1).max(200),
  legacyId: z.number().int().positive(),
  firstName: z.string().max(200),
  lastName: z.string().max(200),
  department: z.string().max(200).nullish(),
  avgRating: z.number().min(0).max(5),
  avgDifficulty: z.number().min(0).max(5),
  numRatings: z.number().int().min(0),
  /** RMP sends -1 when nobody answered "would take again". */
  wouldTakeAgainPercent: z.number().min(-1).max(100).nullish(),
  school: z.object({ id: z.string() }),
});

export const RosterPageSchema = z.object({
  data: z.object({
    newSearch: z.object({
      teachers: z.object({
        didFallback: z.boolean().nullish(),
        resultCount: z.number().int().nullish(),
        pageInfo: z.object({
          hasNextPage: z.boolean(),
          endCursor: z.string().nullish(),
        }),
        edges: z.array(z.object({ node: z.unknown() })),
      }),
    }),
  }),
});

/** A GraphQL `errors` array; any entry fails the run, even when `data` is present (a partial answer). */
const GraphQlErrorsSchema = z.object({
  errors: z
    .array(
      z.object({ message: z.string().catch("(no message)") }).catch({ message: "(no message)" }),
    )
    .min(1),
});

/** A roster run that must not replace the stored roster (bad shape, pagination loop, too small). */
export class RosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterError";
  }
}

/** One Davidson teacher as stored (without fetchedAt). */
export interface RosterRow {
  rmpId: string;
  legacyId: number;
  firstName: string;
  lastName: string;
  normalizedFirst: string;
  normalizedLast: string;
  nameTokens: string[];
  department: string;
  schoolId: string;
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPct: number | null;
}

export interface RosterPage {
  rows: RosterRow[];
  rejectedOtherSchool: number;
  invalid: number;
  /** Nodes on the page (rows + rejectedOtherSchool + invalid). */
  nodes: number;
  hasNextPage: boolean;
  endCursor: string | null;
  /** How many teachers RMP says the search found (all pages), when it says. */
  resultCount: number | null;
  didFallback: boolean;
}

function toRow(node: z.output<typeof RmpTeacherNodeSchema>): RosterRow | null {
  const firstName = node.firstName.trim();
  const lastName = node.lastName.trim();
  const normalizedFirst = normalizeName(firstName);
  const normalizedLast = normalizeName(lastName);
  if (!normalizedFirst || !normalizedLast) return null;
  const pct = node.wouldTakeAgainPercent;
  return {
    rmpId: node.id,
    legacyId: node.legacyId,
    firstName,
    lastName,
    normalizedFirst,
    normalizedLast,
    nameTokens: indexTokens(firstName, lastName),
    department: (node.department ?? "").trim(),
    schoolId: node.school.id,
    avgRating: node.avgRating,
    avgDifficulty: node.avgDifficulty,
    numRatings: node.numRatings,
    wouldTakeAgainPct: pct === null || pct === undefined || pct < 0 ? null : pct,
  };
}

/** Validate one GraphQL response page and keep its Davidson teachers. Throws RosterError on a bad page. */
export function parseRosterPage(data: unknown): RosterPage {
  const errors = GraphQlErrorsSchema.safeParse(data);
  if (errors.success) {
    throw new RosterError(
      `RateMyProfessors answered with an error: ${errors.data.errors[0]!.message.slice(0, 200)}`,
    );
  }
  const page = RosterPageSchema.safeParse(data);
  if (!page.success) throw new RosterError("RateMyProfessors answered in an unexpected shape.");
  const { edges, pageInfo, resultCount, didFallback } = page.data.data.newSearch.teachers;
  const rows: RosterRow[] = [];
  let rejectedOtherSchool = 0;
  let invalid = 0;
  for (const { node } of edges) {
    const school = SchoolOfNodeSchema.safeParse(node);
    if (school.success && school.data.school && school.data.school.id !== RMP_DAVIDSON_SCHOOL_ID) {
      rejectedOtherSchool++;
      continue;
    }
    const parsed = RmpTeacherNodeSchema.safeParse(node);
    const row = parsed.success ? toRow(parsed.data) : null;
    if (!row) {
      invalid++;
      continue;
    }
    rows.push(row);
  }
  return {
    rows,
    rejectedOtherSchool,
    invalid,
    nodes: edges.length,
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor || null,
    resultCount: resultCount ?? null,
    didFallback: didFallback === true,
  };
}

export interface FetchedRoster {
  rows: RosterRow[];
  rejectedOtherSchool: number;
  invalid: number;
  pages: number;
}

/** Fetch every page of the Davidson roster (deduplicated by legacyId, last one wins). */
export async function fetchRoster(): Promise<FetchedRoster> {
  const byLegacyId = new Map<number, RosterRow>();
  let rejectedOtherSchool = 0;
  let invalid = 0;
  let seen = 0;
  let expected: number | null = null;
  let after: string | null = null;
  const cursors = new Set<string>();

  for (let pageNumber = 1; ; pageNumber++) {
    if (pageNumber > ROSTER_MAX_PAGES) {
      throw new RosterError(`The roster has more than ${ROSTER_MAX_PAGES} pages; stopped.`);
    }
    const res = await fetchExternal("ratemyprofessors", RMP_GRAPHQL_URL, {
      method: "POST",
      body: rosterRequestBody(after),
      timeoutMs: ROSTER_TIMEOUT_MS,
    });
    const page = parseRosterPage(res.data);
    if (page.didFallback) {
      throw new RosterError(
        "RateMyProfessors answered with a fallback search instead of the Davidson roster.",
      );
    }
    if (pageNumber === 1) expected = page.resultCount;
    for (const row of page.rows) byLegacyId.set(row.legacyId, row);
    rejectedOtherSchool += page.rejectedOtherSchool;
    invalid += page.invalid;
    seen += page.nodes;

    // A "next page" without a cursor is only an end when the page is empty; otherwise the roster is cut short.
    if (page.hasNextPage && !page.endCursor && page.nodes > 0) {
      throw new RosterError(
        "RateMyProfessors pagination is inconsistent (a next page without a cursor); stopped.",
      );
    }
    if (!page.hasNextPage || !page.endCursor) {
      if (expected !== null && seen < expected * ROSTER_MIN_COMPLETE_RATIO) {
        throw new RosterError(
          `RateMyProfessors announced ${expected} teachers but sent ${seen}; kept the stored roster.`,
        );
      }
      if (invalid > Math.max(5, Math.floor(seen * 0.1))) {
        throw new RosterError(
          `${invalid} of ${seen} roster entries had an unexpected shape; kept the stored roster.`,
        );
      }
      return { rows: [...byLegacyId.values()], rejectedOtherSchool, invalid, pages: pageNumber };
    }
    if (cursors.has(page.endCursor)) {
      throw new RosterError("RateMyProfessors pagination did not advance; stopped.");
    }
    cursors.add(page.endCursor);
    after = page.endCursor;
  }
}

/**
 * Replace the stored roster with `rows`: upsert every row whole by legacyId, and only when every upsert succeeded,
 * drop the rows that left RMP. A failure part-way leaves each row either fully old or fully new (each carries its
 * own fetchedAt, which is its "as of") and deletes nothing; the next run repairs it.
 */
async function replaceRoster(rows: readonly RosterRow[], fetchedAt: Date): Promise<void> {
  await RmpTeacher.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { legacyId: row.legacyId },
        // Every stored field is set, so the row is fully replaced (createdAt survives via timestamps).
        update: { $set: { ...row, fetchedAt } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  await RmpTeacher.deleteMany({
    legacyId: trusted({ $nin: rows.map((row) => row.legacyId) }),
  });
}

const FETCH_FAILURES: Readonly<Record<ExternalFetchError["kind"], string>> = {
  blocked: "The RateMyProfessors request was blocked (host allow-list).",
  timeout: "RateMyProfessors timed out.",
  network: "Could not reach RateMyProfessors.",
  http: "RateMyProfessors answered with an HTTP error.",
  too_large: "The RateMyProfessors answer was too large.",
  parse: "RateMyProfessors did not answer with JSON (parse error).",
  invalid: "RateMyProfessors answered in an unexpected shape.",
};

/** Short, non-secret reason for the Sources panel and the cron result. */
function failureMessage(error: ExternalFetchError | RosterError): string {
  if (!(error instanceof ExternalFetchError)) return error.message;
  const message = FETCH_FAILURES[error.kind];
  return error.kind === "http" && error.status
    ? `RateMyProfessors answered HTTP ${error.status}.`
    : message;
}

const STORE_FAILURE = "Could not store the RateMyProfessors roster.";

/**
 * Pull the roster and replace `rmpteachers` (callers check RMP_ENABLED; see server/rmp/index.ts syncRoster).
 * Upstream and shape failures are returned as `{ ok: false }` and recorded. Database failures are recorded (when
 * the database still takes the record) and rethrown, so the cron answers 500.
 */
export async function runRosterSync(): Promise<RosterSyncResult> {
  const runAt = now();
  let fetched: FetchedRoster;
  try {
    fetched = await fetchRoster();
  } catch (error) {
    // MissingFixtureError and programming errors propagate (never swallow a missing fixture).
    if (!(error instanceof ExternalFetchError || error instanceof RosterError)) throw error;
    const message = failureMessage(error);
    await recordSync("ratemyprofessors", { ok: false, count: 0, error: message, at: runAt });
    return { ok: false, count: 0, rejectedOtherSchool: 0, error: message };
  }

  const count = fetched.rows.length;
  let stored: number;
  let replaced = false;
  try {
    await getDb();
    stored = await RmpTeacher.countDocuments({});
    // Never replace a roster with an empty one or one under half its size (an upstream failure, not attrition).
    if (count > 0 && count >= stored * ROSTER_MIN_KEEP_RATIO) {
      await replaceRoster(fetched.rows, runAt);
      replaced = true;
    }
  } catch (error) {
    await recordSync("ratemyprofessors", {
      ok: false,
      count: 0,
      error: STORE_FAILURE,
      at: runAt,
    }).catch(() => undefined);
    throw error;
  }

  if (!replaced) {
    const message = `RateMyProfessors returned ${count} Davidson teachers (${stored} stored); kept the stored roster.`;
    await recordSync("ratemyprofessors", { ok: false, count: 0, error: message, at: runAt });
    return {
      ok: false,
      count: 0,
      rejectedOtherSchool: fetched.rejectedOtherSchool,
      error: message,
    };
  }
  await recordSync("ratemyprofessors", { ok: true, count, at: runAt });
  return { ok: true, count, rejectedOtherSchool: fetched.rejectedOtherSchool };
}
