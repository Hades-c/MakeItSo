/**
 * Flag accounts created before the rewrite as legacy (PLAN §6.1 W3 "legacyAccount flag script"). DRY RUN by
 * default: it only counts. Run it from frontend/ with Node 22.18+ (TypeScript is stripped natively):
 *
 *   MONGODB_URI="mongodb+srv://…" node scripts/flag-legacy-accounts.ts --cutoff=2026-10-14
 *   MONGODB_URI="mongodb+srv://…" node scripts/flag-legacy-accounts.ts --cutoff=2026-10-14 --apply
 *
 * `--cutoff` (required) is a date (YYYY-MM-DD, taken as 00:00 UTC) or an ISO date-time with an offset: every
 * account created strictly before it gets `legacyAccount: true`, EXCEPT unverified new-flow sign-ups. Accounts
 * without `createdAt` use the time in their ObjectId. It never unsets the flag, never touches any other field,
 * and is idempotent.
 *
 * Unverified new-flow sign-ups (`emailVerifiedAt` stored as null) are never flagged, whatever the cutoff:
 * flagging one would make a squatted, unverified sign-up permanent (a legacy account is never replaced). They are
 * counted as "skipped (unverified new sign-ups)". Pre-rewrite accounts lack the field and are flagged; verified
 * accounts are never replaced anyway, so flagging them changes nothing.
 *
 * What the flag does: registration never replaces a legacy account (server/auth/registration.ts), whatever its
 * verification state. Legacy accounts keep signing in, may verify their own mailbox, and are otherwise normal.
 * Pre-rewrite accounts are already protected without the flag (they lack the field); the flag makes that explicit
 * and survives a later write of the field.
 *
 * Turning on a mail provider does NOT need this script first: an unverified new-flow sign-up becomes replaceable
 * only 24 hours after a code actually reached its inbox (User.verificationSentAt), so accounts created while
 * MAIL_PROVIDER=none stay safe when mail is switched on.
 *
 * Self-contained on purpose (only `mongoose`): no app aliases, so it runs without a bundler.
 */
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";

export interface FlagOptions {
  cutoff: Date;
  apply: boolean;
}

export interface FlagReport {
  cutoff: string;
  dryRun: boolean;
  totalUsers: number;
  /** Accounts created before the cutoff. */
  createdBeforeCutoff: number;
  /** Of those, already flagged. */
  alreadyFlagged: number;
  /** Of those, not flagged yet (what --apply flags). */
  toFlag: number;
  /** Created before the cutoff by the new sign-up flow and still unverified (emailVerifiedAt: null): never flagged. */
  skippedNewFlow: number;
  /** Actually written (0 in a dry run). */
  flagged: number;
  /** Of the accounts before the cutoff: addresses outside @davidson.edu. */
  nonDavidson: number;
  /** Of the accounts before the cutoff: mailbox verified. */
  verified: number;
}

export const USAGE =
  "Usage: MONGODB_URI=... node scripts/flag-legacy-accounts.ts --cutoff=YYYY-MM-DD [--apply]";

/** Parse `--cutoff=…` and `--apply`; an `error` explains what is wrong. */
export function parseArgs(argv: readonly string[]): FlagOptions | { error: string } {
  let cutoffText: string | undefined;
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--dry-run") apply = false;
    else if (arg.startsWith("--cutoff=")) cutoffText = arg.slice("--cutoff=".length);
    else return { error: `Unknown argument: ${arg}\n${USAGE}` };
  }
  if (!cutoffText) return { error: `--cutoff is required.\n${USAGE}` };
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(cutoffText) ? `${cutoffText}T00:00:00Z` : cutoffText;
  const cutoff = new Date(iso);
  if (Number.isNaN(cutoff.getTime())) return { error: `Not a date: ${cutoffText}\n${USAGE}` };
  return { cutoff, apply };
}

/** Accounts created before `cutoff` (createdAt, else the ObjectId's timestamp). */
export function createdBeforeFilter(cutoff: Date): Record<string, unknown> {
  return { $expr: { $lt: [{ $ifNull: ["$createdAt", { $toDate: "$_id" }] }, cutoff] } };
}

export async function flagLegacyAccounts(
  db: mongoose.mongo.Db,
  options: FlagOptions,
): Promise<FlagReport> {
  const users = db.collection("users");
  const before = createdBeforeFilter(options.cutoff);
  // $not also matches a missing field: pre-rewrite accounts (no field) and verified ones, never a stored null.
  const notPendingSignup = { emailVerifiedAt: { $not: { $type: "null" } } };
  const unflagged = { $and: [before, notPendingSignup, { legacyAccount: { $ne: true } }] };
  const [totalUsers, createdBeforeCutoff, toFlag, skippedNewFlow, nonDavidson, verified] =
    await Promise.all([
      users.countDocuments({}),
      users.countDocuments(before),
      users.countDocuments(unflagged),
      users.countDocuments({
        $and: [before, { emailVerifiedAt: { $type: "null" } }, { legacyAccount: { $ne: true } }],
      }),
      users.countDocuments({ $and: [before, { email: { $not: /@davidson\.edu$/ } }] }),
      users.countDocuments({ $and: [before, { emailVerifiedAt: { $type: "date" } }] }),
    ]);
  let flagged = 0;
  if (options.apply && toFlag > 0) {
    const result = await users.updateMany(unflagged, { $set: { legacyAccount: true } });
    flagged = result.modifiedCount;
  }
  return {
    cutoff: options.cutoff.toISOString(),
    dryRun: !options.apply,
    totalUsers,
    createdBeforeCutoff,
    alreadyFlagged: createdBeforeCutoff - toFlag - skippedNewFlow,
    toFlag,
    skippedNewFlow,
    flagged,
    nonDavidson,
    verified,
  };
}

export function formatReport(report: FlagReport, database: string): string {
  return [
    `${report.dryRun ? "DRY RUN (nothing written; add --apply to write)" : "APPLIED"} on database "${database}"`,
    `cutoff (created before):   ${report.cutoff}`,
    `accounts in total:         ${report.totalUsers}`,
    `created before the cutoff: ${report.createdBeforeCutoff}`,
    `  already flagged:         ${report.alreadyFlagged}`,
    `  ${report.dryRun ? "would flag" : "flagged"}:              ${report.dryRun ? report.toFlag : report.flagged}`,
    `  skipped (unverified new sign-ups): ${report.skippedNewFlow}`,
    `  outside @davidson.edu:   ${report.nonDavidson}`,
    `  mailbox verified:        ${report.verified}`,
  ].join("\n");
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if ("error" in options) {
    process.stderr.write(`${options.error}\n`);
    return 2;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    process.stderr.write(`MONGODB_URI is not set.\n${USAGE}\n`);
    return 2;
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("No database connection");
    const report = await flagLegacyAccounts(db, options);
    process.stdout.write(`${formatReport(report, db.databaseName)}\n`);
    return 0;
  } finally {
    await mongoose.disconnect();
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
