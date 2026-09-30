import "server-only";

/**
 * Server HTTP layer (PLAN §4.1.9–10). Route handlers use `defineRoute`; services call outside APIs only through
 * `fetchExternal`. Import from "@/server/http".
 */
export {
  ApiError,
  isDuplicateKeyError,
  jsonError,
  NO_STORE,
  notImplemented,
  toErrorResponse,
  zodIssues,
  type ApiErrorBody,
  type ApiErrorCode,
  type ApiIssue,
} from "./errors";
export {
  defineRoute,
  PUBLIC_CATALOG_CACHE,
  searchParamsToObject,
  type NextRouteContext,
  type RouteConfig,
  type RouteContext,
  type RouteHandler,
  type RouteResult,
} from "./route";
export {
  assertCronRequest,
  isVerifiedDavidson,
  readAccountFlags,
  resolveRouteUser,
  UNVERIFIED_MESSAGE,
  type RouteUser,
} from "./auth";
export { DEFAULT_MAX_BODY_BYTES, readJsonBody } from "./body";
export { appOrigins, assertSameOrigin } from "./origin";
export {
  clientIp,
  consumeRateLimit,
  enforceRateLimits,
  type RateLimitResult,
  type RateLimitRule,
} from "./rate-limit";
export {
  DEFAULT_EXTERNAL_MAX_BYTES,
  DEFAULT_EXTERNAL_TIMEOUT_MS,
  EXTERNAL_HOSTS,
  EXTERNAL_USER_AGENT,
  ExternalFetchError,
  fetchExternal,
  type ExternalFailure,
  type ExternalResponse,
  type FetchExternalOptions,
} from "./external";
export { MissingFixtureError } from "./fixtures";
