import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type * as z from "zod";
import type { AuthMode, CacheMode, HttpMethod } from "@/lib/api/spec";
import { aiResultStatus } from "@/lib/types/ai";
import { readEnv } from "@/server/env";
import { resolveRouteUser, type RouteUser } from "@/server/http/auth";
import { DEFAULT_MAX_BODY_BYTES, readJsonBody } from "@/server/http/body";
import { ApiError, NO_STORE, toErrorResponse, zodIssues } from "@/server/http/errors";
import { assertSameOrigin } from "@/server/http/origin";
import { enforceRateLimits, type RateLimitRule } from "@/server/http/rate-limit";

/**
 * defineRoute (PLAN §4.1.9): the only way to write an `app/api/**` route handler (a test checks every route file;
 * NextAuth's catch-all is the one exception).
 *
 *   // app/api/plan/items/route.ts
 *   export const POST = defineRoute(planApi.addItem, async ({ user, body }) => {
 *     await getDb();
 *     return addItem(user.id, body);          // plain object → JSON with the spec's status (201)
 *   });
 *
 * Pass a spec from lib/api/*.ts (optionally spread with server-only extras such as `rateLimit`), or an inline
 * config with the same fields. Per request, in order:
 *   1. method check (405; HEAD is served by GET);
 *   2. non-GET: Origin / Sec-Fetch-Site must be the app's (403; see server/http/origin.ts) — not for cron routes;
 *   3. auth: public | user (401) | verified (403) | admin (403) | cron (Bearer CRON_SECRET, 401; 503 if unset);
 *   4. rate limits (429 + Retry-After);
 *   5. params, query (zod → 400 validation_failed); body when the config has a body schema: application/json
 *      only (415), ≤ maxBytes (default 16384 → 413), valid JSON (400 bad_request), strict zod (400);
 *   6. the handler: return a Response, a JSON-serialisable value (sent with `status`, default 200, or for an
 *      `aiResult` route with AI_RESULT_STATUS[kind]), or null/undefined for 204;
 *   7. outside production the value is checked against `response` (a mismatch is a 500 and logged);
 *   8. Cache-Control: `private, no-store` (default, and every error) or, for cache "public-catalog" (GET + auth
 *      public only, never reads cookies), `public, s-maxage=900, stale-while-revalidate=3600`.
 * Thrown errors map through toErrorResponse (ApiError, CastError → 400, E11000 → 409, ...). Only step 5 turns
 * zod problems into a 400: a ZodError thrown by the handler or a service (bad stored or upstream data) is a
 * logged 500. Next.js control-flow errors (redirect, notFound, dynamic bailouts) are re-thrown untouched.
 *
 * Every handler defineRoute returns is tagged (isDefinedRoute), so a test can check that each exported method of
 * every route module came from here.
 */

export const PUBLIC_CATALOG_CACHE = "public, s-maxage=900, stale-while-revalidate=3600";

export interface RouteConfig {
  method: HttpMethod;
  auth: AuthMode;
  /** Documentation only (from lib/api specs). */
  path?: string;
  query?: z.ZodType;
  body?: z.ZodType;
  params?: z.ZodType;
  /** Success body schema (checked outside production); null = 204. */
  response?: z.ZodType | null;
  cache?: CacheMode;
  status?: number;
  maxBytes?: number;
  /** The handler returns AiResults; each is sent with AI_RESULT_STATUS[kind] (lib/types/ai.ts). */
  aiResult?: true;
  rateLimit?: RateLimitRule | readonly RateLimitRule[];
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface RouteContext<C extends RouteConfig> {
  request: Request;
  user: RouteUser<C["auth"]>;
  params: Parsed<C["params"]>;
  query: Parsed<C["query"]>;
  body: Parsed<C["body"]>;
}

export type RouteResult<C extends RouteConfig> =
  | Response
  | (C["response"] extends z.ZodType
      ? z.input<C["response"]>
      : C["response"] extends null
        ? null | undefined | void
        : unknown);

type ParamValue = string | string[] | undefined;

/** The second argument Next.js passes to route handlers. */
export interface NextRouteContext {
  params?: Promise<Record<string, ParamValue>> | Record<string, ParamValue>;
}

export type RouteHandler = (request: Request, context?: NextRouteContext) => Promise<Response>;

/** Marks handlers built by defineRoute (value: the route's config). */
const DEFINED_ROUTE = Symbol.for("makeitso.defineRoute");

/** True for a handler returned by defineRoute (tests/server/route-files.test.ts checks every route module). */
export function isDefinedRoute(value: unknown): value is RouteHandler {
  return typeof value === "function" && DEFINED_ROUTE in value;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function assertValidConfig(config: RouteConfig): void {
  if (config.cache === "public-catalog" && (config.method !== "GET" || config.auth !== "public")) {
    throw new Error(
      `defineRoute ${config.path ?? ""}: cache "public-catalog" needs method GET and auth "public"`,
    );
  }
  if (config.body && config.method === "GET") {
    throw new Error(`defineRoute ${config.path ?? ""}: GET routes cannot take a body`);
  }
  if (config.aiResult && !config.response) {
    throw new Error(
      `defineRoute ${config.path ?? ""}: an aiResult route needs an aiResultSchema() response`,
    );
  }
}

/** Parse request input (params, query or body); problems are the client's → 400 validation_failed. */
function parseInput(schema: z.ZodType, value: unknown): unknown {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Some fields are invalid.",
      zodIssues(result.error),
    );
  }
  return result.data;
}

/** URLSearchParams → { key: value } with repeated keys as arrays. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length === 1 ? (values[0] ?? "") : values;
  }
  return out;
}

function withCacheHeader(response: Response, config: RouteConfig): Response {
  if (config.cache === "public-catalog" && response.ok) {
    if (!response.headers.has("Cache-Control")) {
      response.headers.set("Cache-Control", PUBLIC_CATALOG_CACHE);
    }
  } else {
    response.headers.set("Cache-Control", NO_STORE);
  }
  return response;
}

function checkResponse(config: RouteConfig, value: unknown): void {
  if (!config.response || readEnv("NODE_ENV") === "production") return;
  const result = config.response.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Response of ${config.method} ${config.path ?? "(route)"} does not match its contract: ${result.error.message}`,
    );
  }
}

export function defineRoute<const C extends RouteConfig>(
  config: C,
  handler: (context: RouteContext<C>) => Promise<RouteResult<C>> | RouteResult<C>,
): RouteHandler {
  assertValidConfig(config);
  const rules: readonly RateLimitRule[] = config.rateLimit
    ? Array.isArray(config.rateLimit)
      ? (config.rateLimit as readonly RateLimitRule[])
      : [config.rateLimit as RateLimitRule]
    : [];

  const route: RouteHandler = async (request, context) => {
    try {
      const method = request.method.toUpperCase();
      if (method !== config.method && !(config.method === "GET" && method === "HEAD")) {
        throw new ApiError(
          405,
          "bad_request",
          `Use ${config.method} for this endpoint.`,
          undefined,
          {
            Allow: config.method,
          },
        );
      }
      if (UNSAFE_METHODS.has(method) && config.auth !== "cron") assertSameOrigin(request);

      const user = await resolveRouteUser(config.auth, request);
      if (rules.length > 0) await enforceRateLimits(rules, request, user?.id ?? null);

      const rawParams = (await context?.params) ?? {};
      const params = config.params ? parseInput(config.params, rawParams) : undefined;
      const query = config.query
        ? parseInput(config.query, searchParamsToObject(new URL(request.url).searchParams))
        : undefined;
      const body = config.body
        ? parseInput(
            config.body,
            await readJsonBody(request, config.maxBytes ?? DEFAULT_MAX_BODY_BYTES),
          )
        : undefined;

      const result = await handler({
        request,
        user: user as RouteUser<C["auth"]>,
        params: params as Parsed<C["params"]>,
        query: query as Parsed<C["query"]>,
        body: body as Parsed<C["body"]>,
      });

      if (result instanceof Response) return withCacheHeader(result, config);
      if (result === null || result === undefined) {
        return withCacheHeader(new NextResponse(null, { status: 204 }), config);
      }
      checkResponse(config, result);
      const status = config.aiResult ? aiResultStatus(result) : (config.status ?? 200);
      return withCacheHeader(NextResponse.json(result, { status }), config);
    } catch (error) {
      unstable_rethrow(error);
      return toErrorResponse(error);
    }
  };
  Object.defineProperty(route, DEFINED_ROUTE, { value: config });
  return route;
}
