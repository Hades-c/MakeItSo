/**
 * LIVE smoke test of the AI layer against the real Claude API (PLAN §8: "run a real-model eval pass before R2").
 * It sends one request per feature through server/ai/client.ts generate() with the real prompts
 * (server/ai/prompts/*.ts) and synthetic, non-personal sample data, and reports what came back: the outcome kind,
 * the serving model, whether the server-side fallback served it, tokens, the validated output and, for the
 * grounded features, how many suggestions matched the sample candidates.
 *
 * NEVER in CI and never in the test suite: it costs tokens and needs the network. The owner runs it by hand:
 *
 *   cd frontend
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-smoke.ts                  # all five features
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-smoke.ts --feature=course-about
 *   node scripts/ai-smoke.ts --dry-run                                     # print the request bodies, no call
 *
 * Node 22.18+ runs it directly (TypeScript is stripped natively). The app's "@/…" imports and extension-less
 * relative imports are resolved by a small module hook below, and "server-only" is an empty module here. It
 * refuses to run with CI set, and without ANTHROPIC_API_KEY unless --dry-run. Exit code 0 = every feature ok.
 */
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    let base: string | null = null;
    if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
    else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      path.extname(specifier) === ""
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const file = resolveFile(base);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const FEATURES = [
  "course-about",
  "plan-suggestions",
  "career-plan",
  "cold-email",
  "professor-summary",
] as const;
type Feature = (typeof FEATURES)[number];

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function parseArgs(argv: readonly string[]): {
  features: Feature[];
  dryRun: boolean;
  error?: string;
} {
  let features: Feature[] = [...FEATURES];
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--feature=")) {
      const name = arg.slice("--feature=".length) as Feature;
      if (!FEATURES.includes(name)) return { features, dryRun, error: `Unknown feature ${name}` };
      features = [name];
    } else return { features, dryRun, error: `Unknown argument ${arg}` };
  }
  return { features, dryRun };
}

const PROFILE = {
  majors: ["Major in Computer Science (B.S. Degree)"],
  minors: ["Minor in Economics"],
  graduationYear: 2029,
  standing: "sophomore" as const,
  interests: ["software-engineering"],
};

const CANDIDATES = [
  {
    courseCode: "ECO 101",
    title: "Principles of Economics",
    fills: ["Social-Scientific Thought (SSRQ)"],
  },
  {
    courseCode: "ANT 101",
    title: "Introduction to Anthropology",
    fills: ["Social-Scientific Thought (SSRQ)"],
  },
  { courseCode: "ART 111", title: "Drawing I", fills: ["Visual and Performing Arts (VPRQ)"] },
  { courseCode: "THE 110", title: "Acting I", fills: ["Visual and Performing Arts (VPRQ)"] },
  {
    courseCode: "ENG 110",
    title: "Introduction to Literature",
    fills: ["Literary Studies (LTRQ)"],
  },
  {
    courseCode: "PHI 101",
    title: "Introduction to Philosophy",
    fills: ["Philosophical and Religious Perspectives (PRRQ)"],
  },
];

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    process.stderr.write(
      `${args.error}\nUsage: ANTHROPIC_API_KEY=... node scripts/ai-smoke.ts [--feature=<name>] [--dry-run]\n`,
    );
    return 2;
  }
  if (process.env.CI) {
    process.stderr.write("ai-smoke calls the real Claude API: it never runs in CI.\n");
    return 2;
  }
  if (!args.dryRun && !process.env.ANTHROPIC_API_KEY?.trim()) {
    process.stderr.write("Set ANTHROPIC_API_KEY (a real key) or pass --dry-run.\n");
    return 2;
  }
  // The real provider, whatever a local .env says.
  process.env.AI_PROVIDER = "anthropic";
  delete process.env.EXTERNAL_MODE;

  const { buildParams, generate } = await import("@/server/ai/client");
  const { groundPicks } = await import("@/server/ai/grounding");
  const courseAbout = await import("@/server/ai/prompts/course-about");
  const planSuggestions = await import("@/server/ai/prompts/plan-suggestions");
  const careerPlan = await import("@/server/ai/prompts/career-plan");
  const coldEmail = await import("@/server/ai/prompts/cold-email");
  const professorSummary = await import("@/server/ai/prompts/professor-summary");

  const candidatesFor = (term: string) =>
    CANDIDATES.map((c) => ({
      courseCode: c.courseCode,
      canonical: c.courseCode,
      siblings: [] as string[],
      terms: new Map([[term, "scheduled" as const]]),
    }));

  const cases: Record<
    Feature,
    {
      schema: Parameters<typeof generate>[0];
      request: Parameters<typeof generate>[1];
      check?: (data: unknown) => string;
    }
  > = {
    "course-about": {
      schema: courseAbout.OutputSchema,
      request: courseAbout.courseAboutRequest({
        title: "Data Structures",
        descriptions: [
          "A study of abstract data types, including lists, stacks, queues, and search tables, and their supporting data structures. Emphasis on the design and analysis of algorithms that use them, and on writing correct, efficient programs.",
        ],
        prerequisites: ["CSC 121 or permission of instructor."],
        requirements: [{ code: "MQRQ", name: "Mathematical and Quantitative Thought" }],
      }),
    },
    "plan-suggestions": {
      schema: planSuggestions.OutputSchema,
      request: planSuggestions.planSuggestionsRequest({
        catalog: {
          today: new Date().toISOString().slice(0, 10),
          currentTerm: "202601",
          registrationTerm: "202602",
          targetTerm: { code: "202602", label: "Spring 2027", scheduled: true },
          candidates: CANDIDATES.map((c) => ({ ...c, basis: "scheduled" as const, flags: [] })),
        },
        profile: PROFILE,
        plan: {
          items: [
            { termCode: "202501", courseCode: "CSC 121", status: "completed" },
            { termCode: "202601", courseCode: "CSC 221", status: "in-progress" },
          ],
          openRequirements: [
            { code: "SSRQ", name: "Social-Scientific Thought" },
            { code: "VPRQ", name: "Visual and Performing Arts" },
          ],
        },
      }),
      check: (data) => {
        const grounded = groundPicks(
          (data as { picks: { courseCode: string; termCode: string; why: string }[] }).picks,
          candidatesFor("202602"),
          {
            taken: new Set(["CSC 121", "CSC 221"]),
            maxItems: planSuggestions.MAX_PICKS,
            fallbackReason: () => "",
          },
        );
        return `grounding: ${grounded.items.length} kept, ${grounded.dropped.length} dropped${grounded.invalid ? " (INVALID)" : ""}`;
      },
    },
    "career-plan": {
      schema: careerPlan.OutputSchema,
      request: careerPlan.careerPlanRequest({
        catalog: {
          today: new Date().toISOString().slice(0, 10),
          registrationTerm: "202602",
          upcomingTerms: [
            { code: "202602", label: "Spring 2027", scheduled: true },
            { code: "202701", label: "Fall 2027", scheduled: false },
          ],
          career: {
            slug: "software-engineering",
            name: "Software Engineering",
            summary: "Designing, building and maintaining software systems.",
            whatYouDo: ["Write and review code", "Design systems with a team"],
            departments: [{ code: "CSC", name: "Computer Science" }],
            relatedPrograms: ["Computer Science", "Mathematics"],
            davidsonResources: ["Center for Career Development"],
          },
          programs: {
            majors: [
              "Major in Computer Science (B.S. Degree)",
              "Major in Mathematics (B.S. Degree)",
            ],
            minors: ["Minor in Economics", "Interdisciplinary Minor in Data Science"],
          },
          candidates: [
            {
              courseCode: "CSC 250",
              title: "Computer Organization",
              terms: [{ code: "202602", basis: "scheduled" }],
            },
            {
              courseCode: "CSC 321",
              title: "Algorithms",
              terms: [{ code: "202701", basis: "past-offerings" }],
            },
            {
              courseCode: "MAT 230",
              title: "Discrete Mathematics",
              terms: [{ code: "202602", basis: "scheduled" }],
            },
          ],
        },
        profile: PROFILE,
        plan: { items: [{ termCode: "202501", courseCode: "CSC 121", status: "completed" }] },
        goals: { career: "software-engineering", careerName: "Software Engineering" },
      }),
    },
    "cold-email": {
      schema: coldEmail.OutputSchema,
      request: coldEmail.coldEmailRequest({
        catalog: {
          alumnus: {
            name: "Pat Example",
            classYear: 2020,
            role: "Software Engineer",
            organization: "Example Company",
          },
          career: {
            name: "Software Engineering",
            summary: "Designing, building and maintaining software systems.",
          },
        },
        profile: PROFILE,
        goals: { career: "Software Engineering" },
      }),
      check: (data) =>
        (data as { body: string }).body.includes("{{studentName}}")
          ? "placeholder: present"
          : "placeholder: MISSING (the server appends a sign-off)",
    },
    "professor-summary": {
      schema: professorSummary.OutputSchema,
      request: professorSummary.professorSummaryRequest({
        reviews: [
          "Explains hard ideas with clear examples and is always willing to meet outside class.",
          "Lectures are organized; the weekly problem sets help you keep up.",
          "Very approachable and cares about whether students actually understand the material.",
          "Discussion-heavy class; come prepared to talk about the readings.",
          "Great feedback on drafts, and office hours are genuinely useful.",
          "Clear expectations and fair, detailed comments on every assignment.",
        ].map((text) => ({ course: "SMOKE 101", text })),
      }),
    },
  };

  let failures = 0;
  for (const feature of args.features) {
    const { schema, request, check } = cases[feature];
    out(`=== ${feature} (effort ${request.effort}, max_tokens ${request.maxTokens})`);
    if (args.dryRun) {
      out(JSON.stringify(buildParams(schema, request), null, 2));
      continue;
    }
    const started = Date.now();
    const outcome = await generate(schema, request);
    out(
      `kind: ${outcome.kind}  model: ${outcome.servedModel}  fallback: ${outcome.fallbackUsed}  ${Date.now() - started} ms`,
    );
    out(`tokens: ${JSON.stringify(outcome.usage)}`);
    if (outcome.kind === "ok") {
      out(JSON.stringify(outcome.data, null, 2));
      if (check) out(check(outcome.data));
    } else {
      failures++;
      out(`message: ${outcome.message}`);
    }
    out();
  }
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  },
);
