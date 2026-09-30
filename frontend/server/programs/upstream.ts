import "server-only";
import { z } from "zod";
import { ExternalFetchError, fetchExternal } from "@/server/http/external";
import {
  ACALOG_CATALOG,
  MIN_PROGRAM_COUNT,
  PROGRAM_LIST_MAX_PAGES,
  PROGRAM_LIST_PAGE_SIZE,
  programDetailUrl,
  programListUrl,
} from "@/server/programs/catalog-info";

/**
 * The Acalog widget API (catalog.davidson.edu/widget-api/catalog/4): response shapes and the failure rules of
 * PLAN §6.1 W1b. A response counts as a failure, and callers keep their last good copy, when it is
 *   - not a 2xx (fetchExternal throws ExternalFetchError "http"), or a timeout / network error;
 *   - a 202 or carries `x-amzn-waf-action` (the AWS WAF bot challenge answers 202 with an empty body);
 *   - empty, not JSON, or not the expected shape (zod);
 *   - for the program list: incomplete (`count` ≠ entries received), or fewer than MIN_PROGRAM_COUNT programs.
 * Only these typed shapes leave this module; nothing upstream reaches a client unparsed.
 */

const StatusSchema = z.looseObject({
  active: z.boolean(),
  visible: z.boolean(),
});

const ProgramTypeSchema = z.looseObject({ name: z.string() });

/** `"2026-09-24 14:19:30"` as Acalog sends it (no zone): compared as a string, never parsed into a Date. */
const AcalogStampSchema = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

export const AcalogProgramListItemSchema = z.looseObject({
  id: z.number().int().positive(),
  "legacy-id": z.number().int().positive().nullish(),
  "catalog-id": z.literal(ACALOG_CATALOG.id),
  modified: AcalogStampSchema,
  name: z.string().trim().min(1),
  code: z.string().nullish(),
  status: StatusSchema,
  program_types: z.array(ProgramTypeSchema),
});
export type AcalogProgramListItem = z.infer<typeof AcalogProgramListItemSchema>;

export const AcalogProgramListSchema = z.looseObject({
  count: z.number().int().min(0),
  "program-list": z.array(AcalogProgramListItemSchema),
});

export const AcalogCourseRefSchema = z.looseObject({
  id: z.number().int(),
  title: z.string(),
  status: StatusSchema.optional(),
});

export interface AcalogCore {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  status?: { active: boolean; visible: boolean };
  courses: { id: number; title: string; status?: { active: boolean; visible: boolean } }[];
  sort_order?: number | null;
  children: AcalogCore[];
}

export const AcalogCoreSchema: z.ZodType<AcalogCore> = z.looseObject({
  id: z.number().int(),
  name: z.string(),
  code: z.string().nullish(),
  description: z.string().nullish(),
  status: StatusSchema.optional(),
  courses: z.array(AcalogCourseRefSchema).default([]),
  sort_order: z.number().nullish(),
  get children() {
    return z.array(AcalogCoreSchema).default([]);
  },
}) as unknown as z.ZodType<AcalogCore>;

export const AcalogProgramDetailSchema = AcalogProgramListItemSchema.extend({
  description: z.string().nullish(),
  cores: z.array(AcalogCoreSchema),
});
export type AcalogProgramDetail = z.infer<typeof AcalogProgramDetailSchema>;

// ---- Fetching ----------------------------------------------------------------------------------------------------

/** The raw response a fetcher hands back (status + headers + body text). */
export interface RawResponse {
  status: number;
  headers: Headers;
  text: string;
}

/** How this module reaches Acalog; tests pass their own to simulate WAF challenges and outages. */
export type CatalogFetcher = (url: string) => Promise<RawResponse>;

/** The production fetcher: fetchExternal("catalog", …), body as text so WAF/empty/non-JSON are told apart. */
export const fetchCatalog: CatalogFetcher = async (url) => {
  const res = await fetchExternal("catalog", url, { parse: "text" });
  return { status: res.status, headers: res.headers, text: res.data };
};

export type UpstreamResult<T> = { ok: true; data: T } | { ok: false; error: string };

function describeExternalError(error: ExternalFetchError): string {
  switch (error.kind) {
    case "http":
      return `Acalog answered ${error.status ?? "an error"}`;
    case "timeout":
      return "Acalog timed out";
    case "network":
      return "Acalog could not be reached";
    case "too_large":
      return "Acalog sent a response that is too large";
    default:
      return `Acalog request failed (${error.kind})`;
  }
}

/**
 * GET one Acalog URL and validate it. ExternalFetchError becomes a failure result; anything else (including
 * MissingFixtureError in fixtures mode, which must surface) is re-thrown.
 */
export async function getAcalogJson<S extends z.ZodType>(
  fetcher: CatalogFetcher,
  url: string,
  schema: S,
): Promise<UpstreamResult<z.output<S>>> {
  let res: RawResponse;
  try {
    res = await fetcher(url);
  } catch (error) {
    if (error instanceof ExternalFetchError)
      return { ok: false, error: describeExternalError(error) };
    throw error;
  }
  if (res.status === 202 || res.headers.has("x-amzn-waf-action")) {
    const action = res.headers.get("x-amzn-waf-action");
    return {
      ok: false,
      error: `Acalog answered ${res.status} with a bot challenge (x-amzn-waf-action: ${action ?? "none"})`,
    };
  }
  if (res.status < 200 || res.status > 299) {
    return { ok: false, error: `Acalog answered ${res.status}` };
  }
  if (res.text.trim() === "") return { ok: false, error: "Acalog sent an empty response" };
  let json: unknown;
  try {
    json = JSON.parse(res.text) as unknown;
  } catch {
    return { ok: false, error: "Acalog sent a response that is not JSON" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    return {
      ok: false,
      error: `Acalog response has an unexpected shape${where}: ${first?.message ?? "invalid"}`,
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * The whole program list, read with page-size=100 (the widget API's default page is 20 programs). Complete means
 * every page up to `count` was read and no id repeats; a short or oversized result is a failure.
 */
export async function fetchProgramList(
  fetcher: CatalogFetcher,
): Promise<UpstreamResult<AcalogProgramListItem[]>> {
  const items: AcalogProgramListItem[] = [];
  let expected: number | null = null;
  for (let page = 1; page <= PROGRAM_LIST_MAX_PAGES; page++) {
    const result = await getAcalogJson(fetcher, programListUrl(page), AcalogProgramListSchema);
    if (!result.ok) return result;
    const { count } = result.data;
    const entries = result.data["program-list"];
    if (expected === null) expected = count;
    else if (count !== expected) {
      return {
        ok: false,
        error: `Acalog's program count changed while paging (${expected} → ${count})`,
      };
    }
    items.push(...entries);
    if (items.length >= expected || entries.length < PROGRAM_LIST_PAGE_SIZE) break;
  }
  if (expected === null) return { ok: false, error: "Acalog sent no program list" };
  if (items.length !== expected) {
    return {
      ok: false,
      error: `Acalog's program list is incomplete: received ${items.length} of ${expected}`,
    };
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return { ok: false, error: "Acalog's program list repeats a program" };
  }
  if (items.length < MIN_PROGRAM_COUNT) {
    return {
      ok: false,
      error: `Acalog listed only ${items.length} programs (at least ${MIN_PROGRAM_COUNT} expected)`,
    };
  }
  return { ok: true, data: items };
}

/** One program page; the id in the response must be the one asked for. */
export async function fetchProgramDetail(
  fetcher: CatalogFetcher,
  acalogId: number,
): Promise<UpstreamResult<AcalogProgramDetail>> {
  const result = await getAcalogJson(
    fetcher,
    programDetailUrl(acalogId),
    AcalogProgramDetailSchema,
  );
  if (!result.ok) return result;
  if (result.data.id !== acalogId) {
    return {
      ok: false,
      error: `Acalog sent program ${result.data.id} for program ${acalogId}`,
    };
  }
  return result;
}

/** Programs students can see: active and visible in the public catalog. */
export function isPublicProgram(item: Pick<AcalogProgramListItem, "status">): boolean {
  return item.status.active && item.status.visible;
}

/** Acalog's "Interdisciplinary Minors" program type (minors of such a program are interdisciplinary minors). */
export function isInterdisciplinaryMinorType(programTypes: readonly string[]): boolean {
  return programTypes.some((type) => /\binterdisciplinary\s+minors?\b/i.test(type));
}
