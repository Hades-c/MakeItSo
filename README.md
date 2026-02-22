# MakeItSo

A course and career planner for Davidson College students. Built for hack@DAVIDSON.

## What it does

- **Course Planning** — Build your 4-year schedule semester by semester, track credits and prerequisites
- **Degree Progress** — Visualize completion toward your credit requirements
- **Career Goals** — Set career targets, track skills and proficiency, manage milestones
- **Student Profiles** — Major, minor, graduation year, career interests

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| UI Components | Tailwind CSS + shadcn/ui |
| Auth | NextAuth.js (credentials) |
| Database | MongoDB Atlas + Mongoose |
| Deployment | Vercel |

## Project Structure

```
MakeItSo/
├── frontend/                  # Next.js app (deployed to Vercel)
│   ├── app/
│   │   ├── (auth)/            # Login & Register pages
│   │   ├── (dashboard)/       # Protected app pages
│   │   │   ├── dashboard/     # Overview & stats
│   │   │   ├── courses/       # Course planner
│   │   │   ├── career/        # Career goals
│   │   │   └── profile/       # Student profile
│   │   ├── api/               # API routes (serverless)
│   │   │   ├── auth/          # NextAuth + register
│   │   │   ├── courses/       # Course catalog CRUD
│   │   │   ├── plans/         # Course plan CRUD
│   │   │   ├── career/        # Career goals CRUD
│   │   │   └── profile/       # Profile CRUD
│   │   └── page.tsx           # Landing page
│   ├── components/ui/         # shadcn/ui components
│   ├── models/                # Mongoose models
│   │   ├── User.ts
│   │   ├── Course.ts
│   │   ├── CoursePlan.ts
│   │   └── CareerGoal.ts
│   └── lib/
│       ├── mongodb.ts         # DB connection (cached)
│       └── utils.ts           # Helpers + constants
├── backend/                   # Reserved for future standalone API
├── vercel.json                # Vercel deployment config
└── .gitignore
```

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/Hades-c/MakeItSo
cd MakeItSo/frontend
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/makeitso
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push this repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Set the **Root Directory** to `frontend`
4. Add environment variables in Vercel dashboard:
   - `MONGODB_URI`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (set to your Vercel domain, e.g. `https://makeitso.vercel.app`)
5. Deploy


## Data Models

- **User** — name, email, major, minor, graduation year, career interests
- **Course** — code, name, credits, department, prerequisites, tags, difficulty
- **CoursePlan** — per-user list of planned courses with status/grade per entry
- **CareerGoal** — target role, field, companies, skills with proficiency, milestones

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| GET/PATCH | `/api/profile` | Get/update profile |
| GET/POST | `/api/courses` | List/search courses, add course |
| GET/POST/PATCH/DELETE | `/api/plans` | Manage course plan |
| GET/POST/PATCH/DELETE | `/api/career` | Manage career goals |
