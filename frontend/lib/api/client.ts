import { API_ERROR_CODES, type ApiErrorCode } from "@/lib/api/error-codes";
import type { ApiIssue } from "@/lib/api/errors";
import {
  buildPath,
  type ApiEndpoint,
  type ApiRouteSpec,
  type BodyInput,
  type ParamsInput,
  type QueryInput,
  type ResponseOf,
} from "@/lib/api/spec";
import { queryString } from "@/lib/routes";
import { AI_FAILURE_KINDS } from "@/lib/types/ai-constants";

/**
 * Typed fetch for client islands (SWR fetchers, mutations). Builds the URL from the route, sends JSON and throws
 * ApiClientError for every non-2xx answer, with one exception: for an `aiResult` route, a non-2xx body that is an
 * AiResult failure (quota 429, unverified 403, ...) is returned, so the caller switches on `kind` (see
 * lib/types/ai.ts "Wire format").
 *
 *   const { data } = useSWR(["plan"], () => callApi(planEndpoints.getPlan));
 *   await callApi(planEndpoints.addItem, { body: { termCode: "202602", courseCode: "CSC 221" } });
 *   const about = await callApi(aiEndpoints.courseAbout, { body }); // about.kind: "ok" | "quota" | ...
 *
 * The route is an endpoint (lib/api/endpoints.ts: client code) or a full spec (server code, tests). The success
 * body is checked against the spec's `response`: always with a full spec; with an endpoint outside production
 * only, through the spec loaded on demand, so client bundles carry no zod (the server already checked the body
 * against the same schema). Error bodies and AiResult failures are recognised without zod.
 *
 * Same-origin only: `credentials: "same-origin"`; the browser adds Origin/Sec-Fetch-Site for the CSRF check.
 */

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network" | "invalid_response",
    message: string,
    readonly issues?: ApiIssue[],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface CallApiInput<S extends ApiRouteSpec> {
  params?: ParamsInput<S>;
  query?: QueryInput<S>;
  body?: BodyInput<S>;
}

/** A full spec or any endpoint (the implementation's view of both overloads). */
type Route =
  | ApiRouteSpec
  | (Pick<ApiRouteSpec, "method" | "path"> & {
      readonly aiResult?: true;
      readonly __spec?: unknown;
    });

/** The URL `callApi` would request: path with params filled in, plus the query string. */
export function apiUrl<S extends ApiRouteSpec>(
  route: S | ApiEndpoint<S>,
  input: CallApiInput<S> = {},
): string {
  const path = buildPath(route.path, (input.params ?? {}) as Record<string, string | number>);
  const query = (input.query ?? {}) as Record<
    string,
    string | number | boolean | readonly (string | number)[] | null | undefined
  >;
  return `${path}${queryString(query)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `error` of an ApiErrorBody (lib/api/errors.ts), or null when `json` is not one. */
export function apiErrorOf(
  json: unknown,
): { code: ApiErrorCode; message: string; issues?: ApiIssue[] } | null {
  if (!isRecord(json) || !isRecord(json.error)) return null;
  const { code, message, issues } = json.error;
  if (typeof code !== "string" || !(API_ERROR_CODES as readonly string[]).includes(code)) {
    return null;
  }
  if (typeof message !== "string") return null;
  if (issues === undefined) return { code: code as ApiErrorCode, message };
  const valid =
    Array.isArray(issues) &&
    issues.every(
      (issue) =>
        isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string",
    );
  if (!valid) return null;
  return {
    code: code as ApiErrorCode,
    message,
    issues: issues.map((issue: { path: string; message: string }) => ({
      path: issue.path,
      message: issue.message,
    })),
  };
}

/** An AiResult failure body (`{ kind, message }` with a known failure kind), or null. */
export function aiFailureOf(json: unknown): { kind: string; message: string } | null {
  if (!isRecord(json)) return null;
  const { kind, message } = json;
  if (typeof kind !== "string" || !(AI_FAILURE_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  return typeof message === "string" ? { kind, message } : null;
}

function invalidResponse(status: number): ApiClientError {
  return new ApiClientError(status, "invalid_response", "Unexpected response from the server.");
}

/**
 * Outside production, the specs an endpoint's response is checked against, loading as soon as this module does
 * (so the first call does not wait for them). Production builds drop the import: no zod in client bundles.
 */
const developmentSpecs =
  process.env.NODE_ENV === "production"
    ? null
    : import("@/lib/api/registry").catch((error: unknown) => {
        console.error("[callApi] could not load the route specs:", error);
        return null;
      });

/** The spec's parse of `json` (a full spec: always; an endpoint: outside production), or `json` as sent. */
async function checkedBody(route: Route, json: unknown, status: number): Promise<unknown> {
  let spec: ApiRouteSpec | undefined;
  if ("response" in route) {
    spec = route;
  } else if (developmentSpecs) {
    spec = (await developmentSpecs)?.specFor(route.method, route.path);
  }
  if (!spec?.response) return json;
  const result = spec.response.safeParse(json);
  if (!result.success) throw invalidResponse(status);
  return result.data;
}

export async function callApi<S extends ApiRouteSpec>(
  route: S,
  input?: CallApiInput<S>,
  init?: Omit<RequestInit, "method" | "body">,
): Promise<ResponseOf<S>>;
export async function callApi<S extends ApiRouteSpec>(
  route: ApiEndpoint<S>,
  input?: CallApiInput<S>,
  init?: Omit<RequestInit, "method" | "body">,
): Promise<ResponseOf<S>>;
export async function callApi(
  route: Route,
  input: CallApiInput<ApiRouteSpec> = {},
  init: Omit<RequestInit, "method" | "body"> = {},
): Promise<unknown> {
  const hasBody = input.body !== undefined;
  let res: Response;
  try {
    res = await fetch(apiUrl(route as ApiRouteSpec, input), {
      ...init,
      method: route.method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: hasBody ? JSON.stringify(input.body) : undefined,
    });
  } catch {
    throw new ApiClientError(0, "network", "Could not reach MakeItSo. Check your connection.");
  }

  if (!res.ok) {
    const errorJson: unknown = await res.json().catch(() => null);
    if (route.aiResult && aiFailureOf(errorJson)) {
      return checkedBody(route, errorJson, res.status);
    }
    const error = apiErrorOf(errorJson);
    if (error) throw new ApiClientError(res.status, error.code, error.message, error.issues);
    throw new ApiClientError(res.status, "internal", "Something went wrong. Please try again.");
  }

  if (res.status === 204 || ("response" in route && route.response === null)) return null;
  const json: unknown = await res.json().catch(() => undefined);
  if (json === undefined) throw invalidResponse(res.status);
  return checkedBody(route, json, res.status);
}
