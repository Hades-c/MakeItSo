# Contracts (PLAN §4.1)

The frozen interfaces every workstream codes against. They change only through the orchestrator: file a
`contractRequest` in your report instead of editing them. Paths are relative to `frontend/`.

## Shared library (isomorphic, safe in client bundles)

| Module                 | What it is                                                                                                                                                                                | Use it like                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/term.ts`          | Term codes (`YYYY01` Fall, `YYYY02` Spring, `YYYY03` Summer; academic years 1988–2099 only, so Banner pseudo-terms like `000001` are rejected), arithmetic, resolvers, class standing     | `registrationTermFrom(terms, { now })`, `termsBetween(a, b)`, `classStanding(gradYear, now)`                                                                                                                                                                                                                                                  |
| `lib/sources.ts`       | Every `SourceId` with `{ tag, label, kind, url }`; synced ids for `fetchExternal`/`recordSync`; curated `davidson-offices` for office programs outside Matthews/Hurt Hub/Registrar        | `<SourceTag source="wildcatsync" />`, `sourceTag("my-plan") === "YOUR PLAN"`                                                                                                                                                                                                                                                                  |
| `lib/routes.ts`        | Href builders and URL parsers for every page; `safeCallbackPath` (checks the raw and the normalised path); `RETURN_PATH_HEADER` + `returnPathOf` (frontend/proxy.ts)                      | `routes.course("202602", "CSC 221")` → `/courses/202602/CSC-221`, `routes.alumnus(id)` → `/alumni#<id>`, `routes.today({ day })`, `routes.onboarding(step, { next })`, `routes.plan("next", { term, view: "print" })`, `parsePlanTab(searchParams.tab)`, `parseOnboardingStep`                                                                |
| `lib/types/common.ts`  | zod primitives: `TermCodeSchema`, `CourseCodeSchema` (normalises "csc121"), `CrnSchema`, dates, https URLs, query helpers                                                                 | `queryList(ReqCodeSchema)` for `?req=LTRQ&req=SSRQ`                                                                                                                                                                                                                                                                                           |
| `lib/types/catalog.ts` | `Section`, `Course`, `CourseSummary`, `CatalogQuery`, `TermInfo`, `Availability`, `AcademicProgram`, `ReqCode`, `CrossListing`; the cron results `CatalogCronResult`, `ProgramSyncResult` | `SectionSchema.parse(x)`; `reqCodes: null` = no data (never `[]`); `crossListings: {crn, courseCode, section}[]` (match siblings by CRN); `canonicalCourseCode()`; see "Catalog" below                                                                                                                                                        |
| `lib/types/plan.ts`    | `PlanItem`, `PlanProgress`, `WebTreeList`, `PlanDraft`, `SummerActivity`, `StudentDeadline`, `DaySchedule`                                                                                | no grades anywhere; `ACTIVE_PLAN_STATUSES` for the duplicate key                                                                                                                                                                                                                                                                              |
| `lib/types/feeds.ts`   | `FeedItem`, `EventsQuery`, `LibraryHours`                                                                                                                                                 | text-only, https URLs, feed sources only                                                                                                                                                                                                                                                                                                      |
| `lib/types/content.ts` | `Career`, `Alumnus`, `CalendarEvent`, `Office`, `Program`, `PortalLink`, `HandshakeConfig` (all strict, all sourced)                                                                      | alumni: no location/bio; each shown field needs a non-LinkedIn source, else `null` ("see LinkedIn"); `isLinkedInUrl` also covers lnkd.in and archived/cached/proxied copies; `CalendarEvent.source` is the stored tag (`registrar` \| `davidson-offices`); `Program.source` must be `programSourceForOffice(officeSlug)`; see "Content" below |
| `lib/types/ratings.ts` | `InstructorRating` (`matched`/`unmatched`/`staff`/`disabled`/`review`)                                                                                                                    | `rmp` present exactly when `matched`                                                                                                                                                                                                                                                                                                          |
| `lib/types/ai.ts`      | `AiResult<T>` (`aiResultSchema(schema)`), failure kinds, `AI_RESULT_STATUS`, `AI_FAILURE_MESSAGES`, `aiGateFailure()`, per-feature output schemas                                         | see "AI wire format" below; render `ok.data` as text with `<AiChip>`, failures in ErrorState                                                                                                                                                                                                                                                  |
| `lib/api/*.ts`         | One `apiRoute({ method, path, auth, query, body, params, response, cache, aiResult? })` per route and family                                                                              | server: `defineRoute(planApi.addItem, handler)`; client: `callApi(planApi.addItem, { body })`                                                                                                                                                                                                                                                 |
| `lib/api/search.ts`    | **GET /api/search?q=&limit≤20 → `{ results: { kind, id, title, subtitle?, href, source? }[] }`**                                                                                          | the CommandPalette's contract                                                                                                                                                                                                                                                                                                                 |
| `lib/api/errors.ts`    | Error body `{ error: { code, message, issues? } }` and the nine codes                                                                                                                     | `ApiClientError.code` on the client                                                                                                                                                                                                                                                                                                           |
| `lib/flags.ts`         | Server-only `getFlags()` → `{ careers, events, alumni, ai, rmp, rmpSummaries }`                                                                                                           | read in a server component, pass as props (`import type { Flags }` on the client); a link or block into a flagged section needs `featureEnabled(loadFlags(), f)`                                                                                                                                                                              |

## Server (`server-only`)

| Module                           | What it is                                                                                                                                                                                       | Rules                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/env.ts`                  | Lazy zod env: `getEnv()`, `readEnv(key)`; production checks; test knobs `FIXTURES_NOW`, `RATE_LIMITS=off` (fixtures mode only)                                                                   | never read `process.env` at module top level                                                                                                                                                                                                          |
| `server/clock.ts`                | `now()`: the server's "now"; pinned by `FIXTURES_NOW` in fixtures mode (vitest and e2e: 2026-09-30 12:00 ET)                                                                                     | decide terms, Today, Due soon with `now()`, never `new Date()`; move it in a test with `vi.stubEnv`                                                                                                                                                   |
| `server/db.ts`                   | `await getDb()`; `sanitizeFilter` on; `trusted()`                                                                                                                                                | wrap intentional filter operators: `{ items: trusted({ $not: { $elemMatch: … } }) }`                                                                                                                                                                  |
| `server/http/route.ts`           | `defineRoute(spec, handler)`, `isDefinedRoute(fn)`                                                                                                                                               | every exported method of every `app/api/**/route.*` must be a defineRoute handler (a test imports each module); handler returns a value (JSON), `null` (204) or a `Response`                                                                          |
| `server/http/errors.ts`          | `ApiError(status, code, message)`, `notImplemented(name)`, `toErrorResponse`                                                                                                                     | throw `ApiError` for client problems; CastError → 400, E11000 → 409, upstream failure → 503; a ZodError you did not convert is a logged 500                                                                                                           |
| `server/http/external.ts`        | `fetchExternal(id, url, { parse, timeoutMs, headers, method, body, schema })`; `id` is a synced source or an outbound service (`OUTBOUND_SERVICE_IDS`: `resend`, not a data source)              | the only way out (ESLint bans raw `fetch` in server/lib/app/api; the e2e server blocks it); catch `ExternalFetchError`, never `MissingFixtureError`; each id has its own host allow-list (`EXTERNAL_HOSTS`) and fixture directory                     |
| `server/http/fixtures.ts`        | `EXTERNAL_MODE=fixtures` resolver over `tests/fixtures/external/<sourceId>/manifest.json`                                                                                                        | new upstream URL in a test → add a manifest route + file                                                                                                                                                                                              |
| `server/http/rate-limit.ts`      | `consumeRateLimit(key, limit, windowSec, now?)`, `defineRoute({ rateLimit })`, `rateLimitsOff()`, `rateLimitPurgeTime`                                                                           | atomic fixed window in `ratelimits` (e.g. `verify-resend:user:<id>` 3/h), decided at `now` (pass server `now()`); the TTL purge time is on the real clock, so a pinned FIXTURES_NOW never purges a live counter; skipped when `RATE_LIMITS=off` (e2e) |
| `server/features.ts`             | `requireFeature(f)`, `featureMetadata(f, meta)`: 404 while careers/events/alumni is off (Alumni also needs Careers); `featureEnabled`, `loadFlags`                                               | flagged pages: `generateMetadata` → `featureMetadata(f, …)` (no static `metadata`), page starts `await requireFeature(f)`; `loadFlags()`: shell/pages only, never throws                                                                              |
| `server/sync.ts`                 | `recordSync(sourceId, { ok, count, error? })`, `getSourceStatuses()`                                                                                                                             | one call per source per run; `getSourceStatuses()` covers the synced sources only. The hub's Sources panel also lists the curated sources (`curatedSourceVerifiedAt`) and, under Links, the link-only platforms (`linkForSource`)                     |
| `server/account/erasers.ts`      | `registerAccountData(name, { export, erase })`, `exportAccountData`, `eraseAccountData`; built-ins `courseplans-legacy`, `careergoals-legacy`, `aicaches-legacy` (the student's own legacy rows) | register per-user collections in your service entry module; ask for it to be listed in `ACCOUNT_DATA_MODULES`                                                                                                                                         |
| `server/auth` (W3)               | sessions, sign-up, verification, passwords, profile, mail, account data; import from `@/server/auth`                                                                                             | pages `requireUser()`, routes `defineRoute` auth modes; see "Auth" below                                                                                                                                                                              |
| `server/catalog/index.ts` (W1)   | `resolveTerms`, `browseTerm`, `searchCourses`, `getCourse`, `getSection`, `getCourseHistory`, `validateCourseCodes`, `countCourses`, `getCatalogFilters`                                         | `browseTerm()` = registration term once published, else current (the default of searchCourses, /courses, ⌘K, the sidebar count); a never-ingested hot term is cold-loaded once (8 s), else 503                                                        |
| `server/plan/index.ts` (W5s)     | `getPlan`, `addItem`, `updateItem`, `removeItem`, `getProgress`, `getDaySchedule`, WebTree, `detectConflicts`, `readLegacyPlan`, deadlines, summer, drafts                                       | atomic mutations only                                                                                                                                                                                                                                 |
| `server/feeds/index.ts` (W4a)    | `listEvents`, `listEventsPage` (`{items, hasMore}`), `listNews`, `getLibraryHours`, `syncFeeds({sources?, onlyStale?})`                                                                          | reads never block on upstreams (background refresh via `after()`), except `getLibraryHours(today)` with nothing stored (≤1 inline try per 30 min, waits ≤5 s); empty `kinds` = event + deadline; overlap windows; open-ended events count as 2 h      |
| `server/rmp/index.ts` (W2)       | `getRatings(instructors, {subject?, relatedSubjects?, homeSubjects?})`, `syncRoster()`; course pages use `server/rmp/course.ts` `getCourseRatings(course)`                                       | never surname-only; non-exact names need department agreement; genuine ambiguity → `review`; weekly roster only, no review text; ratings route 120/10 min per user                                                                                    |
| `server/programs/index.ts` (W1b) | `listPrograms`, `getProgram`, `programNames`, `officialProgramNames`, `findProgramByName`, `syncPrograms`                                                                                        | see "Catalog" below                                                                                                                                                                                                                                   |
| `server/content/*` (W4b)         | academic-calendar, requirements, careers, alumni, offices, links and deadlines, re-exported from `index.ts`; validated and frozen when loaded                                                    | `upcomingCalendar` / `deadlinesBetween(now(), …)`, `getCareer`, `alumniForCareer` (verified viewers only), `resolveGraduationRules`, `handshakeUrl`, `curatedSourceVerifiedAt(source)` (the Sources panel's "verified <date>")                        |
| `server/search/`                 | `search(q, limit, ctx)` over `providers/*.ts` (`search(q, limit, ctx) → SearchResult[]`); `matchStrength(title, q)`                                                                              | providers respect flags (`featureEnabled`); alumni only when `await ctx.isVerifiedDavidson()`; results merge by title match strength (exact → whole words → prefix → inside → other), then round-robin in provider order                              |

## Catalog (`lib/types/catalog.ts`, `server/catalog`, `server/programs`)

- `Section.registrationSections: CrossListing[]`: the class's hidden registration-only listings (upstream
  `reg_fors`, never in the public data: CHE 430 A → BIO 395 A, CRN 20083). Show "Also registrable as BIO 395 A
  (CRN 20083)"; "Copy for WebTree" may offer that CRN. `regFor` is set only on a listing that IS a registration
  section for another course ("Registration section for <title>"). Parsing older data gives `[]`.
- `Course.topics` / `CourseSummary.topics`: true exactly when the course title is the neutral
  "<Department>: topics vary by section" (no title shared by at least half of the non-lab sections: WRI 101,
  ECO 495); list the sections' own titles instead. Parsing older data gives `false`.
- Both defaults make the fields required on the parsed TypeScript types, as do `AcademicProgram`'s below. A
  hand-written `Section`, `Course` or `CourseSummary` literal (tests, fixtures) needs `registrationSections: []` /
  `topics: false`, or is built with `SectionSchema.parse` / `CourseSchema.parse` / `CourseSummarySchema.parse`.
- `openOnly` / `CourseSummary.openSeats`: a max-0 cross-listed listing ("Register as <sibling>") counts its
  CRN-matched siblings' seats (ENV 214 A → PHY 214 A).
- `validateCourseCodes(codes, terms?)`: a code is valid when it has a listing of its own in one of the terms
  (default: every ingested term); hidden registration-only aliases are invalid, so every valid code resolves with
  `getCourse` / `getCourseHistory`.
- `AcademicProgram`: program-level `pageSections` (department sections outside every offering: honors, course
  lists, numbering rationale) and, per offering, `requirementSections` (`{heading, text}`, the text of
  `requirementsText` with its headings) and `missingCourseRefs` (course links Acalog leaves unnamed, shown as
  "[course]": say "Some course names are missing from the catalog's data" and link `url`). They default to `[]`
  / `0` when parsing older data.
- `server/programs`: `listPrograms({kinds?})`, `getProgram(id)` (null when not listed; 503 `unavailable` with
  Retry-After while a never-read page cannot be fetched, no retry for 30 minutes after a failure),
  `programNames()` → `{catalogYear, majors, minors, all}` (sorted official names, for zod enums: profile, AI),
  `officialProgramNames(kind)`, `findProgramByName(name, {kinds?})` (legacy/free text → one official offering;
  a kind named in the text is a constraint; punctuation and degree words are ignored; ambiguous → null),
  `syncPrograms()`. GET /api/programs/[id] serves canonical ids only (anything else 400).
- Majors and minors are official Acalog names everywhere (Profile.majors/minors, AI enums): pickers list
  `programNames().majors` / `.minors` plus, for majors, a UI-only "Undecided" that saves `majors: []`. The profile
  validates against the same names (server/auth `officialNames`, which falls back to the checked-in Acalog
  snapshot, never to free text). There is no other majors list (lib/utils.ts `MAJORS` is gone).
- Cron routes are built from specs: `catalogApi.cronRefresh` (GET /api/cron/catalog, nightly) and
  `programsApi.cron` (GET /api/cron/programs, weekly), like `eventsApi.cronFeeds` and `ratingsApi.cronRoster`.
  `frontend/vercel.json` schedules each exactly once (a contract test checks it).

## Content (`lib/types/content.ts`, `server/content`)

- Tags come from the stored `source` of each item: calendar rows carry `registrar` or `davidson-offices`
  (other offices' pages: HR holidays, Residence Life, CIS; `calendarSourceForUrls` applies the rule at load),
  office programs carry `programSourceForOffice(officeSlug)`, and each program is filed under the office that
  runs it (the law school fair and fee grant: the Matthews Center).
- Links: Handshake is linked only by `HandshakeConfig.baseUrl` plus the deep links a Davidson page publishes
  (`HANDSHAKE_DOCUMENTED_PATHS`: `/appointments`, from the Matthews Center's career-planning roadmap); no
  constructed search URLs. No `moodle.davidson.edu` URLs anywhere in content (PLAN §1). Both are enforced by
  `tests/content.test.ts` (e).
- `ContentDeadline.category`: the calendar row's category (`deadline` | `registration`), null for a program deadline.
- Every course code content quotes exists in the fixture terms (gate (a), no exemptions).
- The alumni search result links `routes.alumnus(id)`: the directory renders each card with `id={alumnus.id}`.

## Auth (`server/auth`, W3)

- **Sessions**: `requireUser({ verifiedDavidson?, returnTo? })` for pages and layouts: signed out →
  `/login?callbackUrl=<path>`; with `verifiedDavidson`, an account without a verified @davidson.edu mailbox →
  `verifiedOnlyRedirect(path)` =
  `/verify?reason=davidson&next=<path>`. `<path>` is `returnTo`, else the `RETURN_PATH_HEADER` (`x-mis-return-path`)
  that `frontend/proxy.ts` overwrites on every page request (every path but `/api`, `/_next` and the files in
  `public/`, so dotted page paths such as `/careers/x.y` too; lib/routes.ts); `/today` is left out (a signed-out
  visit to `/today` goes to plain `/login`, which lands on `/today` anyway). Route handlers
  use `requireApiUser()` or defineRoute's auth modes (401/403, never a redirect). `getSessionUser()` is memoised per
  request; a JWT is revoked by `sessionVersion` (sign out everywhere, password change or reset, deletion).
  `isEmailVerified(account)` (any address) and `isVerifiedDavidsonUser(account)` (verified AND @davidson.edu: the
  alumni/AI gate) take a SessionUser, a lean User or a Profile.
- **First run**: `SessionUser.onboardedAt` (ISO or null; `isOnboarded(user)`: a SessionUser without the field
  counts as onboarded). The hub layout sends an account with `onboardedAt` null to
  `routes.onboarding(undefined, { next: <requested path> })`, except on `/today` (its setup nudge and "not
  onboarded" summary are for these accounts) and `/profile`; `/onboarding` is outside the hub. Onboarding keeps
  `?next=` (`onboardingNext`, same-origin app paths only) on its step links, and Skip setup / Finish go there
  instead of Today. Like `requireUser`, it runs when the hub layout renders (full loads, entering the hub), not on
  soft navigations between hub pages.
- **Return paths**: every untrusted path goes through `safeAppPath(value, fallback?)` / `isSafeAppPath(path)`
  (one leading "/", never "//" or "/\\" after normalising); `lib/routes.ts safeCallbackPath` applies the same rule.
- **Verify banner**: `verifyBannerFor(user, now())` → `{ email, replaceable, hoursLeft }` or null (only unverified
  @davidson.edu accounts, only while mail is available); the hub layout renders `<VerifyBanner {...state} />`.
- **Profile**: `getProfile(userId)` / `updateProfile(userId, patch)` (strict whitelist, `null` → `$unset` for
  firstTerm/standingOverride), `grantAiConsent` / `revokeAiConsent`, `defaultFirstTerm(gradYear)`,
  `officialNames(kind)` (see "Catalog": official Acalog names only).
- **Passwords and mail**: `passwordProblem(password, context)` is the new-password policy (10–72 UTF-8 bytes, not
  only spaces, not in the bundled common list, no site word with digits or symbols around it); `getMailer()` →
  ConsoleMailer (dev/test) | ResendMailer (`MAIL_PROVIDER=resend`, through `fetchExternal("resend", …)`) | null
  (`none`: verification and reset say they are unavailable); `isMailAvailable()` for pages and banners.
- **Sign-in refusals**: the server sends a fixed NextAuth error code, `TooManyAttempts[:<sec>]` (10 failed
  sign-ins per 15 min per IP), `AddressBackoff[:<sec>]` (per address and IP after 5 failures) or
  `SignInUnavailable`; the login page shows only `signInErrorMessage(code)`'s fixed sentences (anything else is
  "Sign-in failed. Please try again."), so a crafted `/login?error=` link cannot show arbitrary text.
- **Codes**: 6 digits, stored as a sha256, valid 15 minutes (`VerificationCode.codeExpiresAt`, checked against
  server `now()`), purged 24 h after sending (`expiresAt`, the TTL on the real clock), 5 attempts per code, 3 sends
  per hour, and 10 wrong codes a day per account and channel: the signed-in verification (`code-fail:user:<id>`) and
  the public password-reset confirm (`reset-fail:user:<id>`) are separate, so anonymous reset guesses never lock
  the owner's verification. `User.verificationSentAt`
  starts the 24 h window after which a later sign-up of the same address may replace an unverified one (never a
  legacy account, never before a code was sent), so turning on a mail provider does NOT need
  `scripts/flag-legacy-accounts.ts` first.
- **Pages and routes**: `/login`, `/register`, `/verify`, `/forgot-password` (`routes.forgotPassword()`),
  `/privacy`; contracts in `lib/api/account.ts` (`register` and `requestPasswordReset` answer 202
  `{status: "check-inbox", message}`, `confirmPasswordReset` 204, and the fixtures-only `testMailbox`, which is a
  404 unless `EXTERNAL_MODE=fixtures` + `MAIL_PROVIDER=console` off Vercel) and `lib/api/profile.ts`; the AI-consent
  endpoint's spec is still `app/(auth)/_lib/contracts.ts authExtraApi`.

## Route auth modes (`defineRoute`)

| `auth`     | Who                                                                 | Failure              |
| ---------- | ------------------------------------------------------------------- | -------------------- |
| `public`   | anyone; cookies never read (required for `cache: "public-catalog"`) | —                    |
| `user`     | signed in                                                           | 401                  |
| `verified` | signed in + `emailVerifiedAt` + `@davidson.edu` (alumni, AI report) | 401 / 403            |
| `admin`    | verified mailbox + address in `ADMIN_EMAILS`                        | 401 / 403            |
| `cron`     | `Authorization: Bearer $CRON_SECRET` (constant-time compare)        | 401; 503 while unset |

Non-GET requests also need the app's `Origin` (or `Sec-Fetch-Site: same-origin`) → 403, a JSON body when the
route takes one → 415, at most 16 KB → 413, and a body matching the strict schema → 400.

## AI wire format (`lib/types/ai.ts`, `lib/api/ai.ts`)

The generating AI routes are `auth: "user"` + `aiResult: true`. The handler returns an `AiResult` for every
outcome it decides, failures included: first `const gate = aiGateFailure({ enabled, configured, verified,
consented }); if (gate) return gate;` (disabled → not_configured → unverified → consent_required), then the
generation result. defineRoute sends it with `AI_RESULT_STATUS[kind]` (quota 429, unverified 403, ...), and
`callApi` returns it instead of throwing, so client code does `switch (result.kind)`. Only problems outside the
handler (401 signed out, 400 bad body, 429 route rate limit, 500) use the generic error body and throw
`ApiClientError`.

## Models (collections)

New data goes only to new collections: `plans`, `catalogsections`, `catalogmeta`, `programs`, `rmpteachers`,
`feeditems`, `sourcesyncs`, `aicache_v2`, `aiusages`, `ratelimits` (TTL), `verificationcodes` (TTL). The legacy
`courseplans` collection is read through `models/legacy/CoursePlanV1.ts` only: READ-ONLY, never write, except that
account deletion erases the student's own documents (the `courseplans-legacy` built-in eraser). The same holds for
the legacy `careergoals` (by userId) and `aicaches` (the personal "roadmap", "career-plan" and "recommendations"
rows, whose cacheKey starts with `{"userId":"<id or e-mail>"`): export and deletion of the student's own account
are their only readers and writers. Legacy "cold-email" rows are keyed by the student's name only and are not
attributable, so no eraser touches them (the privacy notice says to ask).

## Tests

- `EXTERNAL_MODE=fixtures` and `FIXTURES_NOW=2026-09-30T12:00:00-04:00` in vitest, Playwright and CI; a unit test
  that reaches the network fails, and so does an outbound fetch from the e2e server. Playwright also sets
  `RATE_LIMITS=off`.
- Playwright: one in-memory MongoDB for the server and the workers. `playwright.config.ts` sets `E2E_MONGODB_URI`
  (127.0.0.1:`E2E_MONGO_PORT`, default `E2E_PORT`+1) unless one is given, and `tests/e2e/serve.mjs` starts it, so
  specs that seed the database (legacy accounts and plans) run in CI. Shared helpers live in `tests/e2e/helpers.ts`:
  accounts (`registerViaApi`, `signIn`, `newSignedInAccount`, `newVerifiedAccount`, `verifyMailbox`, `aiStudent`;
  accounts are marked onboarded unless `{ onboarded: false }`) and page checks (`seriousViolations`,
  `expectAllTagged`, `smallTapTargets`, `horizontalOverflow`, `isMobile`).
- Fixtures: `tests/fixtures/external/` (see its README). Use the real Fall 2026 / Spring 2027 data for catalog
  rules (reg_fors and the Staff instructor exist only in 202602) and the synthetic RMP roster (`cases.json`) for
  matching. `tests/fixtures/content/office-programs.json` indexes the 122 verified office programs.

## Working in the worktrees

- Never `git stash`: every worktree of the repository shares one `refs/stash`, and two agents' pops swapped each
  other's entries (a wrapper now refuses stash push/pop). Commit work in progress on your own branch instead.
