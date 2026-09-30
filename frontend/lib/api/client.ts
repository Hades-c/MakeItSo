import { ApiErrorBodySchema, type ApiErrorCode, type ApiIssue } from "@/lib/api/errors";
import {
  buildPath,
  type ApiRouteSpec,
  type BodyInput,
  type ParamsInput,
  type QueryInput,
  type ResponseOf,
} from "@/lib/api/spec";
import { queryString } from "@/lib/routes";

/**
 * Typed fetch for client islands (SWR fetchers, mutations). Builds the URL from the spec, sends JSON, validates the
 * success body against `spec.response` and throws ApiClientError for every non-2xx answer.
 *
 *   const { data } = useSWR(["plan"], () => callApi(planApi.getPlan, {}));
 *   await callApi(planApi.addItem, { body: { termCode: "202602", courseCode: "CSC 221" } });
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

/** The URL `callApi` would request: path with params filled in, plus the query string. */
export function apiUrl<S extends ApiRouteSpec>(spec: S, input: CallApiInput<S> = {}): string {
  const path = buildPath(spec.path, (input.params ?? {}) as Record<string, string | number>);
  const query = (input.query ?? {}) as Record<
    string,
    string | number | boolean | readonly (string | number)[] | null | undefined
  >;
  return `${path}${queryString(query)}`;
}

export async function callApi<S extends ApiRouteSpec>(
  spec: S,
  input: CallApiInput<S> = {},
  init: Omit<RequestInit, "method" | "body"> = {},
): Promise<ResponseOf<S>> {
  const hasBody = input.body !== undefined;
  let res: Response;
  try {
    res = await fetch(apiUrl(spec, input), {
      ...init,
      method: spec.method,
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
    const parsed = ApiErrorBodySchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      const { code, message, issues } = parsed.data.error;
      throw new ApiClientError(res.status, code, message, issues);
    }
    throw new ApiClientError(res.status, "internal", "Something went wrong. Please try again.");
  }

  if (spec.response === null || res.status === 204) return null as ResponseOf<S>;
  const json: unknown = await res.json().catch(() => undefined);
  const result = spec.response.safeParse(json);
  if (!result.success) {
    throw new ApiClientError(
      res.status,
      "invalid_response",
      "Unexpected response from the server.",
    );
  }
  return result.data as ResponseOf<S>;
}
