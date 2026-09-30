# Contracts (PLAN §4.1)

The frozen interfaces every workstream codes against. They change only through the orchestrator: file a
`contractRequest` in your report instead of editing them. Paths are relative to `frontend/`.

## Shared library (isomorphic, safe in client bundles)

| Module                 | What it is                                                                                                                | Use it like                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `lib/term.ts`          | Term codes (`YYYY01` Fall, `YYYY02` Spring, `YYYY03` Summer), arithmetic, resolvers, class standing                       | `registrationTermFrom(terms, { now })`, `termsBetween(a, b)`, `classStanding(gradYear, now)`        |
| `lib/sources.ts`       | Every `SourceId` with `{ tag, label, kind, url }`; synced ids for `fetchExternal`/`recordSync`                            | `<SourceTag source="wildcatsync" />`, `sourceTag("my-plan") === "YOUR PLAN"`                        |
| `lib/routes.ts`        | Href builders and URL parsers for every page                                                                              | `routes.course("202602", "CSC 221")` → `/courses/202602/CSC-221`, `parsePlanTab(searchParams.tab)`  |
| `lib/types/common.ts`  | zod primitives: `TermCodeSchema`, `CourseCodeSchema` (normalises "csc121"), `CrnSchema`, dates, https URLs, query helpers | `queryList(ReqCodeSchema)` for `?req=LTRQ&req=SSRQ`                                                 |
| `lib/types/catalog.ts` | `Section`, `Course`, `CourseSummary`, `CatalogQuery`, `TermInfo`, `Availability`, `AcademicProgram`, `ReqCode`            | `SectionSchema.parse(x)`; `reqCodes: null` = no data (never `[]`); `canonicalCourseCode()`          |
| `lib/types/plan.ts`    | `PlanItem`, `PlanProgress`, `WebTreeList`, `PlanDraft`, `SummerActivity`, `StudentDeadline`, `DaySchedule`                | no grades anywhere; `ACTIVE_PLAN_STATUSES` for the duplicate key                                    |
| `lib/types/feeds.ts`   | `FeedItem`, `EventsQuery`, `LibraryHours`                                                                                 | text-only, https URLs, feed sources only                                                            |
| `lib/types/content.ts` | `Career`, `Alumnus`, `CalendarEvent`, `Office`, `Program`, `PortalLink`, `HandshakeConfig` (all strict, all sourced)      | alumni: no location/bio; each shown field needs a non-LinkedIn source, else `null` ("see LinkedIn") |
| `lib/types/ratings.ts` | `InstructorRating` (`matched`/`unmatched`/`staff`/`disabled`/`review`)                                                    | `rmp` present exactly when `matched`                                                                |
| `lib/types/ai.ts`      | `AiResult<T>` (`aiResultSchema(schema)`), failure kinds and their HTTP status, per-feature output schemas                 | render `ok.data` as text with `<AiChip>`; failures in ErrorState                                    |
| `lib/api/*.ts`         | One `apiRoute({ method, path, auth, query, body, params, response, cache })` per route and family                         | server: `defineRoute(planApi.addItem, handler)`; client: `callApi(planApi.addItem, { body })`       |
| `lib/api/search.ts`    | **GET /api/search?q=&limit≤20 → `{ results: { kind, id, title, subtitle?, href, source? }[] }`**                          | the CommandPalette's contract                                                                       |
| `lib/api/errors.ts`    | Error body `{ error: { code, message, issues? } }` and the nine codes                                                     | `ApiClientError.code` on the client                                                                 |
| `lib/flags.ts`         | Server-only `getFlags()` → `{ careers, events, alumni, ai, rmp, rmpSummaries }`                                           | read in a server component, pass down as props (`import type { Flags }` on the client)              |

## Server (`server-only`)

| Module                           | What it is                                                                                                                                                 | Rules                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server/env.ts`                  | Lazy zod env: `getEnv()`, `readEnv(key)`; production checks                                                                                                | never read `process.env` at module top level                                                                  |
| `server/db.ts`                   | `await getDb()`; `sanitizeFilter` on; `trusted()`                                                                                                          | wrap intentional filter operators: `{ items: trusted({ $not: { $elemMatch: … } }) }`                          |
| `server/http/route.ts`           | `defineRoute(spec, handler)`                                                                                                                               | every `app/api/**/route.ts` (a test checks); handler returns a value (JSON), `null` (204) or a `Response`     |
| `server/http/errors.ts`          | `ApiError(status, code, message)`, `notImplemented(name)`, `toErrorResponse`                                                                               | throw `ApiError`; CastError → 400, E11000 → 409, upstream failure → 503                                       |
| `server/http/external.ts`        | `fetchExternal(sourceId, url, { parse, timeoutMs, headers, method, body, schema })`                                                                        | the only way out; per-source host allow-list; catch `ExternalFetchError`, never `MissingFixtureError`         |
| `server/http/fixtures.ts`        | `EXTERNAL_MODE=fixtures` resolver over `tests/fixtures/external/<sourceId>/manifest.json`                                                                  | new upstream URL in a test → add a manifest route + file                                                      |
| `server/http/rate-limit.ts`      | `consumeRateLimit(key, limit, windowSec)`, `defineRoute({ rateLimit })`                                                                                    | atomic fixed window in `ratelimits`                                                                           |
| `server/sync.ts`                 | `recordSync(sourceId, { ok, count, error? })`, `getSourceStatuses()`                                                                                       | one call per source per run; the Sources panel lists only synced sources                                      |
| `server/account/erasers.ts`      | `registerAccountData(name, { export, erase })`, `exportAccountData`, `eraseAccountData`                                                                    | register per-user collections in your service entry module; ask for it to be listed in `ACCOUNT_DATA_MODULES` |
| `server/catalog/index.ts` (W1)   | `resolveTerms`, `searchCourses`, `getCourse`, `getSection`, `getCourseHistory`, `validateCourseCodes`, `countCourses`, `getCatalogFilters`                 | stubs throw 501 until W1                                                                                      |
| `server/plan/index.ts` (W5s)     | `getPlan`, `addItem`, `updateItem`, `removeItem`, `getProgress`, `getDaySchedule`, WebTree, `detectConflicts`, `readLegacyPlan`, deadlines, summer, drafts | atomic mutations only                                                                                         |
| `server/feeds/index.ts` (W4a)    | `listEvents`, `getLibraryHours`, `syncFeeds`                                                                                                               |                                                                                                               |
| `server/rmp/index.ts` (W2)       | `getRatings`, `syncRoster`                                                                                                                                 | never surname-only matches                                                                                    |
| `server/programs/index.ts` (W1b) | `listPrograms`, `getProgram`, `officialProgramNames`, `syncPrograms`                                                                                       |                                                                                                               |
| `server/search/`                 | `search(q, limit, ctx)` over `providers/*.ts` (`search(q, limit, ctx) → SearchResult[]`)                                                                   | providers respect flags; alumni only when `await ctx.isVerifiedDavidson()`                                    |

## Route auth modes (`defineRoute`)

| `auth`     | Who                                                                 | Failure              |
| ---------- | ------------------------------------------------------------------- | -------------------- |
| `public`   | anyone; cookies never read (required for `cache: "public-catalog"`) | —                    |
| `user`     | signed in                                                           | 401                  |
| `verified` | signed in + `emailVerifiedAt` + `@davidson.edu` (alumni, AI)        | 401 / 403            |
| `admin`    | verified mailbox + address in `ADMIN_EMAILS`                        | 401 / 403            |
| `cron`     | `Authorization: Bearer $CRON_SECRET` (constant-time compare)        | 401; 503 while unset |

Non-GET requests also need the app's `Origin` (or `Sec-Fetch-Site: same-origin`) → 403, a JSON body when the
route takes one → 415, at most 16 KB → 413, and a body matching the strict schema → 400.

## Models (collections)

New data goes only to new collections: `plans`, `catalogsections`, `catalogmeta`, `programs`, `rmpteachers`,
`feeditems`, `sourcesyncs`, `aicache_v2`, `aiusages`, `ratelimits` (TTL), `verificationcodes` (TTL). The legacy
`courseplans` collection is read through `models/legacy/CoursePlanV1.ts` only: READ-ONLY, never write.

## Tests

- `EXTERNAL_MODE=fixtures` in vitest, Playwright and CI; a unit test that reaches the network fails.
- Fixtures: `tests/fixtures/external/` (see its README). Use the real Fall 2026 / Spring 2027 data for catalog
  rules and the synthetic RMP roster (`cases.json`) for matching.
