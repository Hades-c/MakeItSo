import "server-only";
import type * as z from "zod";
import type { ExternalServiceId } from "@/lib/sources";
import { readEnv } from "@/server/env";
import { resolveFixture } from "@/server/http/fixtures";

/**
 * fetchExternal (PLAN §4.1.10): the ONLY way server code calls an outside service.
 *
 *   const { data } = await fetchExternal("course-schedule", url, { parse: "json" });
 *   const { data: ics } = await fetchExternal("wildcatsync", "https://wildcatsync.davidson.edu/events.ics",
 *     { parse: "text" });
 *
 * - EXTERNAL_MODE=live (default) fetches; EXTERNAL_MODE=fixtures (vitest, e2e, CI) serves
 *   tests/fixtures/external/<sourceId>/ and never touches the network. An unknown URL in fixtures mode throws
 *   MissingFixtureError (never catch it).
 * - The first argument is a synced source (lib/sources.ts SYNCED_SOURCE_IDS) or an outbound service that is not a
 *   data source (OUTBOUND_SERVICE_IDS: "resend" for e-mail); both are ExternalServiceId.
 * - https only, and only to the source's allow-listed hosts (EXTERNAL_HOSTS); redirects are followed (≤ 3) only
 *   within that list. Anything else throws ExternalFetchError("blocked").
 * - timeout (default 8 s) → "timeout"; network failure → "network"; non-2xx → "http" (with status); body above
 *   maxBytes (default 10 MiB) → "too_large"; JSON that does not parse → "parse"; `schema` mismatch → "invalid".
 *   Services catch ExternalFetchError, keep their last good data and `recordSync(source, {ok: false, ...})`.
 */

/**
 * Hosts each synced source (lib/sources.ts SYNCED_SOURCE_IDS) and each outbound service (OUTBOUND_SERVICE_IDS:
 * not data sources, never in the Sources panel) may call.
 */
export const EXTERNAL_HOSTS: Readonly<Record<ExternalServiceId, readonly string[]>> = {
  "course-schedule": ["api.davidson.edu"],
  catalog: ["catalog.davidson.edu"],
  ratemyprofessors: ["www.ratemyprofessors.com"],
  wildcatsync: ["wildcatsync.davidson.edu"],
  "hurt-hub": ["hurthub.davidson.edu"],
  library: ["davidson.libcal.com"],
  davidsonian: ["thedavidsonian.news"],
  "events-digest": ["us6.campaign-archive.com"],
  "davidson-news": ["www.davidson.edu"],
  // Outbound services.
  resend: ["api.resend.com"],
};

export const DEFAULT_EXTERNAL_TIMEOUT_MS = 8_000;
export const DEFAULT_EXTERNAL_MAX_BYTES = 10 * 1024 * 1024;
export const EXTERNAL_USER_AGENT =
  "MakeItSo/0.2 (independent Davidson College student planner; +https://make-it-so.vercel.app)";
const MAX_REDIRECTS = 3;

export type ExternalFailure =
  "blocked" | "timeout" | "network" | "http" | "too_large" | "parse" | "invalid";

export class ExternalFetchError extends Error {
  constructor(
    readonly sourceId: ExternalServiceId,
    readonly url: string,
    readonly kind: ExternalFailure,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(`[${sourceId}] ${message}`, options);
    this.name = "ExternalFetchError";
  }
}

export interface FetchExternalOptions<P extends "json" | "text", S extends z.ZodType | undefined> {
  /** "json" (default) parses the body; "text" returns it as a string. */
  parse?: P;
  timeoutMs?: number;
  headers?: Readonly<Record<string, string>>;
  method?: "GET" | "POST";
  /** A string is sent as-is; anything else as JSON (content-type set). */
  body?: unknown;
  maxBytes?: number;
  /** Validate parsed JSON; a mismatch throws ExternalFetchError("invalid"). */
  schema?: S;
  signal?: AbortSignal;
}

export interface ExternalResponse<T> {
  sourceId: ExternalServiceId;
  /** Final URL (after redirects). */
  url: string;
  status: number;
  headers: Headers;
  data: T;
  fetchedAt: Date;
  fromFixture: boolean;
}

type DataOf<P, S> = S extends z.ZodType ? z.output<S> : P extends "text" ? string : unknown;

function assertAllowed(sourceId: ExternalServiceId, url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ExternalFetchError(sourceId, url, "blocked", `Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new ExternalFetchError(sourceId, url, "blocked", `Only https URLs are allowed: ${url}`);
  }
  if (!EXTERNAL_HOSTS[sourceId].includes(parsed.hostname.toLowerCase())) {
    throw new ExternalFetchError(
      sourceId,
      url,
      "blocked",
      `Host ${parsed.hostname} is not allowed for source "${sourceId}"`,
    );
  }
  return parsed;
}

async function readCapped(
  sourceId: ExternalServiceId,
  url: string,
  res: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new ExternalFetchError(
      sourceId,
      url,
      "too_large",
      `Response larger than ${maxBytes} bytes`,
    );
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ExternalFetchError(
        sourceId,
        url,
        "too_large",
        `Response larger than ${maxBytes} bytes`,
      );
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchExternal<
  P extends "json" | "text" = "json",
  S extends z.ZodType | undefined = undefined,
>(
  sourceId: ExternalServiceId,
  url: string,
  options: FetchExternalOptions<P, S> = {},
): Promise<ExternalResponse<DataOf<P, S>>> {
  const {
    parse = "json",
    timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS,
    method = "GET",
    maxBytes = DEFAULT_EXTERNAL_MAX_BYTES,
  } = options;
  assertAllowed(sourceId, url);

  const bodyText =
    options.body === undefined
      ? undefined
      : typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
  const headers = new Headers({
    "user-agent": EXTERNAL_USER_AGENT,
    accept: parse === "json" ? "application/json" : "*/*",
    ...(bodyText !== undefined && typeof options.body !== "string"
      ? { "content-type": "application/json" }
      : {}),
    ...options.headers,
  });

  let status: number;
  let responseHeaders: Headers;
  let bytes: Uint8Array;
  let finalUrl = url;
  const fromFixture = readEnv("EXTERNAL_MODE") === "fixtures";

  if (fromFixture) {
    const fixture = await resolveFixture(sourceId, method, url, bodyText);
    status = fixture.status;
    responseHeaders = new Headers({ "content-type": fixture.contentType });
    bytes = new Uint8Array(fixture.body);
  } else {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let res: Response;
    try {
      let hops = 0;
      for (;;) {
        res = await fetch(finalUrl, {
          method,
          headers,
          body: bodyText,
          redirect: "manual",
          signal,
        });
        const location = res.headers.get("location");
        if (res.status < 300 || res.status >= 400 || !location) break;
        await res.body?.cancel().catch(() => undefined);
        if (++hops > MAX_REDIRECTS) {
          throw new ExternalFetchError(sourceId, url, "blocked", "Too many redirects");
        }
        finalUrl = assertAllowed(sourceId, new URL(location, finalUrl).toString()).toString();
      }
      bytes = await readCapped(sourceId, finalUrl, res, maxBytes);
    } catch (error) {
      if (error instanceof ExternalFetchError) throw error;
      if (timeout.aborted) {
        throw new ExternalFetchError(
          sourceId,
          url,
          "timeout",
          `Timed out after ${timeoutMs} ms`,
          undefined,
          {
            cause: error,
          },
        );
      }
      throw new ExternalFetchError(sourceId, url, "network", "Request failed", undefined, {
        cause: error,
      });
    }
    status = res.status;
    responseHeaders = res.headers;
  }

  if (status < 200 || status > 299) {
    throw new ExternalFetchError(sourceId, finalUrl, "http", `Upstream answered ${status}`, status);
  }

  const text = new TextDecoder("utf-8").decode(bytes);
  let data: unknown = text;
  if (parse === "json") {
    try {
      data = JSON.parse(text) as unknown;
    } catch (error) {
      throw new ExternalFetchError(
        sourceId,
        finalUrl,
        "parse",
        "Response is not valid JSON",
        status,
        {
          cause: error,
        },
      );
    }
  }
  if (options.schema) {
    const result = options.schema.safeParse(data);
    if (!result.success) {
      throw new ExternalFetchError(
        sourceId,
        finalUrl,
        "invalid",
        `Response does not match the expected shape: ${result.error.message}`,
        status,
      );
    }
    data = result.data;
  }

  return {
    sourceId,
    url: finalUrl,
    status,
    headers: responseHeaders,
    data: data as DataOf<P, S>,
    fetchedAt: new Date(),
    fromFixture,
  };
}
