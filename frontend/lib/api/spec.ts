import type { z } from "zod";

/**
 * Route contracts (PLAN §4.1.16). Each `lib/api/<family>.ts` file declares its routes with `apiRoute({...})`:
 * method, path, auth, and zod schemas for query, body, params and response. The same object is
 *   - passed to `defineRoute(spec, handler)` on the server (server/http/route.ts), which enforces auth, CSRF,
 *     body limits and validation from it, and
 *   - used by client islands through `callApi(spec, input)` (lib/api/client.ts), which builds the URL and
 *     validates the response.
 * So a contract change is one edit, and a route cannot drift from its schema.
 *
 * Conventions:
 *   - query schemas are non-strict (unknown params are ignored) and accept string | string[] values;
 *   - body schemas are strict objects (unknown keys → 400);
 *   - `response` describes the success body; errors always use ApiErrorBody (lib/api/errors.ts);
 *   - a response of `null` means 204 No Content.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 *   public    anyone; never reads cookies (required for cache "public-catalog")
 *   user      signed in (401 otherwise)
 *   verified  signed in + mailbox verified (emailVerifiedAt) + @davidson.edu (403 otherwise): alumni, cold email,
 *             every AI route
 *   cron      `Authorization: Bearer $CRON_SECRET` (503 while CRON_SECRET is unset)
 *   admin     verified mailbox + e-mail in ADMIN_EMAILS
 */
export type AuthMode = "public" | "user" | "verified" | "cron" | "admin";

/**
 *   private         Cache-Control: private, no-store (the default, and every error)
 *   public-catalog  Cache-Control: public, s-maxage=900, stale-while-revalidate=3600 (GET + auth public only)
 */
export type CacheMode = "private" | "public-catalog";

export interface ApiRouteSpec {
  method: HttpMethod;
  /** Next.js route path with [segments]: "/api/plan/items/[id]". */
  path: `/api/${string}`;
  auth: AuthMode;
  query?: z.ZodType;
  body?: z.ZodType;
  params?: z.ZodType;
  /** Success body schema; `null` = 204 No Content. */
  response: z.ZodType | null;
  cache?: CacheMode;
  /** Success status (default 200, or 204 when response is null). */
  status?: number;
  /** Request body limit in bytes (default 16384 → 413 above it). */
  maxBytes?: number;
}

/** Declare a route contract (identity function that keeps literal types). */
export function apiRoute<const S extends ApiRouteSpec>(spec: S): S {
  return spec;
}

export type QueryInput<S extends ApiRouteSpec> = S["query"] extends z.ZodType
  ? z.input<S["query"]>
  : never;
export type BodyInput<S extends ApiRouteSpec> = S["body"] extends z.ZodType
  ? z.input<S["body"]>
  : never;
export type ParamsInput<S extends ApiRouteSpec> = S["params"] extends z.ZodType
  ? z.input<S["params"]>
  : never;
export type ResponseOf<S extends ApiRouteSpec> = S["response"] extends z.ZodType
  ? z.output<S["response"]>
  : null;

/** Fill "[name]" segments of a spec path: buildPath("/api/plan/items/[id]", { id: "abc" }) → "/api/plan/items/abc". */
export function buildPath(
  path: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return path.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${path}`);
    return encodeURIComponent(String(value));
  });
}
