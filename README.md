# MakeItSo

**A college and career planner for Davidson College students.**

MakeItSo started at hack@DAVIDSON 2026. The goal is one place for what is scattered today across Handshake,
WildcatSync, Davidson One, RateMyProfessors and email: the course catalog, a four-year plan, careers, verified
alumni and campus events.

> **Status: being rebuilt.** The hackathon version is being replaced on a tested foundation (Next.js 16, React 19,
> Mongoose 9, Anthropic Claude for AI features). Right now the app has the landing page, sign-up/sign-in and the
> signed-in shell with every page in place (Today, Courses, My plan, Careers, Events, Alumni, Profile). Those
> pages say what they will show; the course catalog, plan, careers, alumni and events data arrive in the next waves.
> Degree requirement information in the app is a planning aid: always verify in Degree Works and with your advisor.

---

## Tech stack

| Layer         | Technology                                                                              |
| ------------- | --------------------------------------------------------------------------------------- |
| App           | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 (strict)                 |
| UI            | Tailwind CSS 4 (Lakeside tokens) · Radix UI primitives · lucide-react · sonner          |
| Auth          | NextAuth.js v4 (email + password credentials, JWT sessions)                             |
| Data          | MongoDB + Mongoose 9                                                                    |
| AI            | Anthropic Claude via `@anthropic-ai/sdk` (being wired up; `AI_PROVIDER=mock` for tests) |
| External data | Davidson College public course API, RateMyProfessors                                    |
| Tests         | Vitest + Testing Library · mongodb-memory-server · Playwright                           |
| Hosting       | Vercel (Root Directory = `frontend`)                                                    |

## Project structure

```
MakeItSo/
├── .github/workflows/ci.yml   CI: npm ci → typecheck → lint → format → test → build → CSS check → e2e
├── .nvmrc                     Node 24
└── frontend/                  the Next.js app
    ├── app/
    │   ├── page.tsx           landing page
    │   ├── (auth)/            /login, /register
    │   ├── (hub)/             signed-in pages in the AppShell (layout requires a session): /today,
    │   │                      /courses, /courses/[term]/[code], /plan, /careers, /careers/[slug], /events,
    │   │                      /alumni, /profile
    │   ├── globals.css        Lakeside design tokens (the only place raw colours live)
    │   └── api/               route handlers, all built with defineRoute (auth, register, profile, search)
    ├── server/                server-only modules
    │   ├── env.ts             zod-validated environment, read lazily, with production checks
    │   ├── db.ts              lazy MongoDB connection (getDb), sanitizeFilter on
    │   ├── http/              defineRoute (auth, CSRF, limits, validation, caching), typed errors,
    │   │                      fetchExternal (the only way to call outside services) + fixtures mode
    │   ├── auth/              NextAuth options, requireUser() / requireApiUser()
    │   ├── sync.ts            recordSync / getSourceStatuses for the Sources panel
    │   ├── account/           per-user data registry for export and account deletion
    │   ├── catalog/ plan/ feeds/ rmp/ programs/   service contracts (typed stubs until each workstream lands)
    │   └── search/            global search over pluggable providers
    ├── components/ui/         Lakeside UI primitives (Button, Card, SourceTag, CourseCode, Dialog, ...)
    ├── components/app/        AppShell: TopBar, Sidebar + Sources panel, BottomTabs, theme, user menu
    ├── lib/                   shared (client + server): term, sources, routes, flags, format, day-summary
    │   ├── types/             zod schemas + types for catalog, plan, feeds, content, ratings, AI
    │   └── api/               one contract per route (method, path, auth, schemas) + a typed client
    ├── models/                Mongoose models (new collections; models/legacy/ is read-only)
    ├── docs/CONTRACTS.md      the frozen contracts in one page
    ├── types/                 type augmentation (next-auth)
    └── tests/                 Vitest unit/integration tests; tests/e2e = Playwright;
                               tests/fixtures/external = recorded upstream responses
```

### Contracts

Shared interfaces are frozen and documented in [`frontend/docs/CONTRACTS.md`](frontend/docs/CONTRACTS.md):
term rules (`lib/term.ts`), source tags (`lib/sources.ts`), domain types (`lib/types/*`), route contracts
(`lib/api/*`, served with `defineRoute` and called with `callApi`), `fetchExternal`, `recordSync`, the account
data registry, feature flags and the service signatures. Outside services are reached only through
`fetchExternal`; with `EXTERNAL_MODE=fixtures` (tests, e2e, CI) it serves `frontend/tests/fixtures/external`
and never touches the network.

---

## Design system (Lakeside)

The look is the "Lakeside" direction: Davidson's Lake Blue, Sandstone and Deep Taupe lead, and Davidson Red is
kept for "now" and urgent items. Errors use a separate danger colour, and focus rings are Lake Blue.

- **Tokens** live in `frontend/app/globals.css` as CSS variables for light and dark. With no `data-theme` on
  `<html>` the theme follows the system; the toggle stores an explicit choice in `localStorage` (`mis-theme`),
  and a small inline script applies it before first paint. Tailwind 4 is configured in that CSS file (`@theme`);
  there is no `tailwind.config.ts`.
- **Use tokens only**: `bg-surface`, `text-fg-2`, `border-line`, `bg-primary-fill`, `text-urgent`,
  `bg-course-pine-wash`... Tailwind's default palette, type scale, radii and shadows are switched off.
  `tests/design/no-raw-colors.test.ts` fails on raw hex/rgb colours, palette classes (`bg-red-500`) or dynamically
  built class names in `app/`, `components/` and `lib/`. `tests/design/tokens.test.ts` checks WCAG AA contrast for
  every token pair in both themes.
- **Type**: Instrument Sans for UI and body, IBM Plex Mono (`font-mono`) for course codes, times, rooms, CRNs and
  labels. Both are self-hosted from the `@fontsource` packages through `next/font/local`, so the build needs no
  network and the browser never calls Google. Sizes `text-xs` (12px, the floor) to `text-2xl`
  (32px), plus `text-3xl` (44px) for big numbers.
- **Breakpoints**: `md` = 720px (bottom tabs below, sidebar above), `lg` = 900px (two content columns), `xl` =
  1180px (full 240px sidebar; a 72px icon rail between 720 and 1180px).
- **Course colours** come from the department (`lib/course-color.ts`); the code is always printed next to the colour.
- **Provenance**: every aggregated item shows a `<SourceTag>` (COURSE SCHEDULE, REGISTRAR, WILDCATSYNC...; ids in
  `lib/sources.ts`), and every AI output shows `<AiChip>` ("AI · verify with your advisor"). The Today headline is
  a one-sentence day summary built deterministically by `lib/day-summary.ts`, never free model text.

---

## Local development

Requirements: **Node.js 24** (see `.nvmrc`; `nvm use` picks it up; Node 22.12+ also works), npm, and a MongoDB you can reach (a local
`mongod`, Docker `mongo:8`, or a free MongoDB Atlas cluster).

```bash
git clone https://github.com/Hades-c/MakeItSo
cd MakeItSo/frontend
npm ci
cp .env.example .env.local   # then fill in the values below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

### Environment variables

Set these in `frontend/.env.local` locally, or in the Vercel project settings. None of them are needed to
**build**; they are validated on first use at runtime (`server/env.ts`), with an error that names what is missing.

| Variable                | Required     | Description                                                                                               |
| ----------------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`           | yes          | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/makeitso` or `mongodb+srv://…`                 |
| `NEXTAUTH_SECRET`       | yes          | Session signing secret: `openssl rand -base64 32`. In production ≥ 32 characters, not the placeholder     |
| `NEXTAUTH_URL`          | yes\*        | Public URL of the app, e.g. `http://localhost:3000`. \*Optional on Vercel                                 |
| `APP_ORIGIN`            | production   | Public origin checked against the `Origin` of every POST/PUT/PATCH/DELETE (not needed on Vercel previews) |
| `ANTHROPIC_API_KEY`     | for AI       | Anthropic API key, used by AI features when `AI_PROVIDER=anthropic`                                       |
| `AI_PROVIDER`           | no           | `anthropic` (default) or `mock` (tests and e2e; rejected on the Vercel production environment)            |
| `AI_ENABLED`            | no           | All AI features on/off. Default `true` (AI also needs a verified @davidson.edu account and consent)       |
| `AI_DAILY_TOKEN_BUDGET` | no           | Tokens per day across all users before AI pauses. Default `2000000`                                       |
| `MAIL_PROVIDER`         | no           | `none`, `console` (codes in the server log; dev/test default) or `resend`. Default `none` in production   |
| `MAIL_API_KEY`          | for `resend` | Mail provider API key                                                                                     |
| `MAIL_FROM`             | for `resend` | Sender, e.g. `MakeItSo <noreply@example.org>`                                                             |
| `CRON_SECRET`           | for cron     | Bearer secret Vercel Cron sends (≥ 16 characters). Cron routes answer 503 without it                      |
| `ADMIN_EMAILS`          | no           | Comma-separated addresses allowed on admin routes (with a verified mailbox)                               |
| `EXTERNAL_MODE`         | no           | `live` (default) or `fixtures` (serve `tests/fixtures/external`; tests, e2e, CI)                          |
| `FIXTURES_NOW`          | tests only   | With `fixtures`: pins server "now" (`server/clock.ts`); vitest and e2e use `2026-09-30T12:00:00-04:00`    |
| `RATE_LIMITS`           | tests only   | `on` (default) or `off` (skip rate limits; needs `EXTERNAL_MODE=fixtures`; the e2e server sets it)        |
| `FEATURE_CAREERS`       | no           | Careers pages on/off. Default `true`                                                                      |
| `FEATURE_EVENTS`        | no           | Events page and feeds on/off. Default `true`                                                              |
| `FEATURE_ALUMNI`        | no           | Alumni directory on/off. Default `true`                                                                   |
| `APP_TIMEZONE`          | no           | IANA time zone for "today" logic. Default `America/New_York`                                              |
| `RMP_ENABLED`           | no           | RateMyProfessors ratings on/off. Default `true`                                                           |
| `RMP_SUMMARIES_ENABLED` | no           | AI summaries of RateMyProfessors reviews on/off. Default `false` (owner opt-in)                           |

Production (`next start` and every Vercel deployment) also checks that the Vercel production environment does not
use `AI_PROVIDER=mock`, `EXTERNAL_MODE=fixtures`, the console mailer or `FIXTURES_NOW`, and `RATE_LIMITS=off` is
refused anywhere without `EXTERNAL_MODE=fixtures`. A bad value fails the request that needs it with a 500 and a
server log naming the variable; it never fails the build.

### Scripts (run in `frontend/`)

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | Development server on port 3000                                                  |
| `npm run build`     | Production build (needs no environment variables)                                |
| `npm run check:css` | After a build: no font size below 12px, and CSS under 80 KB gzipped              |
| `npm start`         | Serve the production build                                                       |
| `npm run typecheck` | Generate Next.js route types, then `tsc --noEmit`                                |
| `npm run lint`      | ESLint 9 (flat config: `eslint.config.mjs`)                                      |
| `npm run format`    | Prettier (with the Tailwind class sorter); `npm run format:check` to verify only |
| `npm test`          | Vitest unit + integration tests (`tests/**/*.test.ts[x]`)                        |
| `npm run test:e2e`  | Playwright end-to-end tests against `next build && next start -p 3210`           |

### Tests

- **Unit and integration** (`npm test`): server modules are tested directly; database tests use
  [mongodb-memory-server](https://github.com/typegoose/mongodb-memory-server) via `tests/helpers/db.ts`, so no
  MongoDB setup is needed. The first run downloads a `mongod` binary (about 100 MB) into the local cache.
  Tests run with `EXTERNAL_MODE=fixtures`, and any real network call from a test fails.
- **End-to-end** (`npm run test:e2e`): builds the app, then `tests/e2e/serve.mjs` starts an in-memory MongoDB and
  `next start` on port 3210 with `AI_PROVIDER=mock`, `EXTERNAL_MODE=fixtures` and a throwaway secret. Install the browser once with
  `npx playwright install chromium`. Set `E2E_SKIP_BUILD=1` to reuse an existing build, `E2E_MONGODB_URI` to use
  your own database, or `PW_CHROMIUM_EXECUTABLE` to use a Chromium you already have.

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request and on pushes to `main`, plus
`npm audit --omit=dev --audit-level=high`. It needs no secrets.

---

## Deploying to Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `frontend`. Vercel picks Node.js 24, the newest major allowed by
   `engines.node` (`>=22.12 <25`) in `package.json`.
3. Add the environment variables `MONGODB_URI`, `NEXTAUTH_SECRET`, `APP_ORIGIN`, `CRON_SECRET` and
   `ANTHROPIC_API_KEY` (and `NEXTAUTH_URL` if you use a custom domain).
4. Deploy.

Production: https://make-it-so.vercel.app
