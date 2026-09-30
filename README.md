# MakeItSo

**A college and career planner for Davidson College students.**

MakeItSo started at hack@DAVIDSON 2026. The goal is one place for what is scattered today across Handshake,
WildcatSync, Davidson One, RateMyProfessors and email: the course catalog, a four-year plan, careers, verified
alumni and campus events.

> **Status: being rebuilt.** The hackathon version is being replaced on a tested foundation (Next.js 16, React 19,
> Mongoose 9, Anthropic Claude for AI features). Right now the app has the landing page, sign-up/sign-in and the
> signed-in shell with every page in place (Today, Courses, My plan, Careers, Events, Alumni, Profile). Those
> pages say what they will show; the course catalog, plan, careers, alumni and events data arrive in the next waves.
> Degree requirement information in the app is a planning aid: always verify in DegreeWorks and with your advisor.

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
    │   └── api/               route handlers (auth, register, profile)
    ├── server/                server-only modules
    │   ├── env.ts             zod-validated environment, read lazily
    │   ├── db.ts              lazy MongoDB connection (getDb)
    │   ├── http.ts            typed JSON errors for route handlers (withApi, ApiError)
    │   └── auth/              NextAuth options, requireUser() / requireApiUser()
    ├── components/ui/         Lakeside UI primitives (Button, Card, SourceTag, CourseCode, Dialog, ...)
    ├── components/app/        AppShell: TopBar, Sidebar + Sources panel, BottomTabs, theme, user menu
    ├── lib/                   shared (client + server) helpers and data
    ├── models/                Mongoose models
    ├── types/                 type augmentation (next-auth)
    └── tests/                 Vitest unit/integration tests; tests/e2e = Playwright
```

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

| Variable                | Required | Description                                                                               |
| ----------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `MONGODB_URI`           | yes      | MongoDB connection string, e.g. `mongodb://127.0.0.1:27017/makeitso` or `mongodb+srv://…` |
| `NEXTAUTH_SECRET`       | yes      | Session signing secret. Generate with `openssl rand -base64 32`                           |
| `NEXTAUTH_URL`          | yes\*    | Public URL of the app, e.g. `http://localhost:3000`. \*Optional on Vercel                 |
| `ANTHROPIC_API_KEY`     | for AI   | Anthropic API key, used by AI features when `AI_PROVIDER=anthropic`                       |
| `AI_PROVIDER`           | no       | `anthropic` (default) or `mock` (canned output for tests and e2e; no API key needed)      |
| `APP_TIMEZONE`          | no       | IANA time zone for "today" logic. Default `America/New_York`                              |
| `RMP_ENABLED`           | no       | RateMyProfessors ratings on/off. Default `true`                                           |
| `RMP_SUMMARIES_ENABLED` | no       | AI summaries of RateMyProfessors reviews on/off. Default `false` (owner opt-in)           |

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
- **End-to-end** (`npm run test:e2e`): builds the app, then `tests/e2e/serve.mjs` starts an in-memory MongoDB and
  `next start` on port 3210 with `AI_PROVIDER=mock` and a throwaway secret. Install the browser once with
  `npx playwright install chromium`. Set `E2E_SKIP_BUILD=1` to reuse an existing build, `E2E_MONGODB_URI` to use
  your own database, or `PW_CHROMIUM_EXECUTABLE` to use a Chromium you already have.

CI (`.github/workflows/ci.yml`) runs all of the above on every pull request and on pushes to `main`, plus
`npm audit --omit=dev --audit-level=high`. It needs no secrets.

---

## Deploying to Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** to `frontend`. Vercel picks Node.js 24, the newest major allowed by
   `engines.node` (`>=22.12 <25`) in `package.json`.
3. Add the environment variables `MONGODB_URI`, `NEXTAUTH_SECRET` and `ANTHROPIC_API_KEY` (and `NEXTAUTH_URL`
   if you use a custom domain).
4. Deploy.

Production: https://make-it-so.vercel.app
