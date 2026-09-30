# MakeItSo

**A college and career planner for Davidson College students.**

MakeItSo started at hack@DAVIDSON 2026. The goal is one place for what is scattered today across Handshake,
WildcatSync, Davidson One, RateMyProfessors and email: the course catalog, a four-year plan, careers, verified
alumni and campus events.

> **Status: being rebuilt.** The hackathon version is being replaced on a tested foundation (Next.js 16, React 19,
> Mongoose 9, Anthropic Claude for AI features). Right now the app has the landing page, sign-up/sign-in and a
> placeholder Today page. The course catalog, plan, careers, alumni and events pages return in the next waves.
> Degree requirement information in the app is a planning aid: always verify in DegreeWorks and with your advisor.

---

## Tech stack

| Layer         | Technology                                                                              |
| ------------- | --------------------------------------------------------------------------------------- |
| App           | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 (strict)                 |
| UI            | Tailwind CSS · Radix UI primitives · lucide-react · sonner                              |
| Auth          | NextAuth.js v4 (email + password credentials, JWT sessions)                             |
| Data          | MongoDB + Mongoose 9                                                                    |
| AI            | Anthropic Claude via `@anthropic-ai/sdk` (being wired up; `AI_PROVIDER=mock` for tests) |
| External data | Davidson College public course API, RateMyProfessors                                    |
| Tests         | Vitest + Testing Library · mongodb-memory-server · Playwright                           |
| Hosting       | Vercel (Root Directory = `frontend`)                                                    |

## Project structure

```
MakeItSo/
├── .github/workflows/ci.yml   CI: npm ci → typecheck → lint → test → build → e2e
├── .nvmrc                     Node 24
└── frontend/                  the Next.js app
    ├── app/
    │   ├── page.tsx           landing page
    │   ├── (auth)/            /login, /register
    │   ├── (hub)/             signed-in pages (layout requires a session): /today, ...
    │   └── api/               route handlers (auth, register, profile)
    ├── server/                server-only modules
    │   ├── env.ts             zod-validated environment, read lazily
    │   ├── db.ts              lazy MongoDB connection (getDb)
    │   ├── http.ts            typed JSON errors for route handlers (withApi, ApiError)
    │   └── auth/              NextAuth options, requireUser() / requireApiUser()
    ├── components/ui/         UI primitives
    ├── lib/                   shared (client + server) helpers and data
    ├── models/                Mongoose models
    ├── types/                 type augmentation (next-auth)
    └── tests/                 Vitest unit/integration tests; tests/e2e = Playwright
```

---

## Local development

Requirements: **Node.js 24** (see `.nvmrc`; `nvm use` picks it up), npm, and a MongoDB you can reach (a local
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
| `RMP_SUMMARIES_ENABLED` | no       | AI summaries of RateMyProfessors reviews on/off. Default `true`                           |

### Scripts (run in `frontend/`)

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`       | Development server on port 3000                                                  |
| `npm run build`     | Production build (needs no environment variables)                                |
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
2. Set **Root Directory** to `frontend`. Node.js 24 is selected from `engines.node` in `package.json`.
3. Add the environment variables `MONGODB_URI`, `NEXTAUTH_SECRET` and `ANTHROPIC_API_KEY` (and `NEXTAUTH_URL`
   if you use a custom domain).
4. Deploy.

Production: https://make-it-so.vercel.app
