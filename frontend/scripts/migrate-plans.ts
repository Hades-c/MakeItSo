/**
 * Bulk-convert legacy v1 plans (`courseplans`) into v2 plans (`plans`) — OPTIONAL and for the owner only (PLAN
 * §8): the app already reads v1 lazily (server/plan readLegacyPlan) and writes v2 on each student's first change.
 * DRY RUN by default: it converts every student's latest v1 document exactly as the app does and prints a JSON
 * report per category (entries converted, verified against the catalog, unverified, credits normalised from the
 * old 4, grades turned into statuses, Summer entries, skipped with reasons, ...). Never run it against production
 * without the owner. Run it from frontend/ with Node 22.18+:
 *
 *   MONGODB_URI="mongodb+srv://…" node scripts/migrate-plans.ts            # dry run, JSON report
 *   MONGODB_URI="mongodb+srv://…" node scripts/migrate-plans.ts --apply    # write v2 where none exists
 *   … --user=<24-hex id> (repeatable) --limit=<n>
 *
 * With --apply it writes a v2 document only for students who have none ($setOnInsert + upsert), marked
 * `importedFromLegacy.via: "migration"`. It never modifies or deletes a `courseplans` document, and never
 * overwrites a v2 plan. Catalog facts come from the app's catalog service (the `catalogsections` the app has
 * ingested; a term never ingested is fetched from the Davidson API like the app would, EXTERNAL_MODE=live).
 *
 * The app's modules use the "@/…" alias and TypeScript parameter properties, so this CLI registers a tiny module
 * resolver (aliases, "server-only", extensionless imports) and re-runs itself with --experimental-transform-types
 * when needed. Tests import `parseArgs` and server/plan/migrate.ts directly.
 */
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as Background from "../server/catalog/background";
import type * as Db from "../server/db";
import type * as Migrate from "../server/plan/migrate";

export interface MigrateArgs {
  apply: boolean;
  userIds: string[];
  limit?: number;
}

export const USAGE =
  "Usage: MONGODB_URI=... node scripts/migrate-plans.ts [--apply] [--user=<24-hex id>]... [--limit=<n>]";

/** Parse the CLI flags; an `error` explains what is wrong. */
export function parseArgs(argv: readonly string[]): MigrateArgs | { error: string } {
  const out: MigrateArgs = { apply: false, userIds: [] };
  for (const arg of argv) {
    if (arg === "--apply") out.apply = true;
    else if (arg === "--dry-run") out.apply = false;
    else if (arg.startsWith("--user=")) {
      const id = arg.slice("--user=".length).toLowerCase();
      if (!/^[a-f0-9]{24}$/.test(id)) return { error: `Not a user id: ${id}\n${USAGE}` };
      out.userIds.push(id);
    } else if (arg.startsWith("--limit=")) {
      const limit = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(limit) || limit < 1) return { error: `Not a limit: ${arg}\n${USAGE}` };
      out.limit = limit;
    } else {
      return { error: `Unknown argument: ${arg}\n${USAGE}` };
    }
  }
  return out;
}

/** The frontend/ directory (this file lives in frontend/scripts). */
const ROOT = new URL("../", import.meta.url);

/** Module resolution hooks: "@/x" → frontend/x(.ts|.tsx|/index.ts), "server-only" → empty, "next/server" → .js. */
const RESOLVE_HOOKS = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT.href)};
const EXTENSIONS = [".ts", ".tsx", "/index.ts", ".js", ".mjs"];
function file(url) {
  const path = fileURLToPath(url);
  if (existsSync(path) && statSync(path).isFile()) return url;
  for (const extension of EXTENSIONS) {
    if (existsSync(path + extension) && statSync(path + extension).isFile()) return url + extension;
  }
  return null;
}
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const found = file(new URL(specifier.slice(2), ROOT).href);
    if (found) return { url: found, shortCircuit: true };
  }
  const parent = context.parentURL ?? "";
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && parent.startsWith(ROOT) && !parent.includes("/node_modules/")) {
    const found = file(new URL(specifier, parent).href);
    if (found) return { url: found, shortCircuit: true };
  }
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error && error.code === "ERR_MODULE_NOT_FOUND" && !specifier.startsWith(".") && !specifier.endsWith(".js")) {
      return next(specifier + ".js", context);
    }
    throw error;
  }
}
`;

const TRANSFORM_FLAG = "--experimental-transform-types";

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if ("error" in args) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (!process.env.MONGODB_URI) {
    process.stderr.write(`MONGODB_URI is not set.\n${USAGE}\n`);
    return 2;
  }
  if (!process.execArgv.includes(TRANSFORM_FLAG)) {
    const child = spawnSync(
      process.execPath,
      [
        TRANSFORM_FLAG,
        "--disable-warning=ExperimentalWarning",
        fileURLToPath(import.meta.url),
        ...process.argv.slice(2),
      ],
      { stdio: "inherit" },
    );
    return child.status ?? 1;
  }
  register(`data:text/javascript,${encodeURIComponent(RESOLVE_HOOKS)}`);
  const { migratePlans } = (await import(
    new URL("server/plan/migrate.ts", ROOT).href
  )) as typeof Migrate;
  const { drainBackground } = (await import(
    new URL("server/catalog/background.ts", ROOT).href
  )) as typeof Background;
  const { disconnectDb } = (await import(new URL("server/db.ts", ROOT).href)) as typeof Db;
  try {
    const report = await migratePlans({
      apply: args.apply,
      ...(args.userIds.length > 0 ? { userIds: args.userIds } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.students.failed > 0 ? 1 : 0;
  } finally {
    await drainBackground().catch(() => undefined);
    await disconnectDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exit(1);
    },
  );
}
