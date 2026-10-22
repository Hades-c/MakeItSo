import "server-only";
import { createHash } from "node:crypto";
import { termCodeFor, termLabel, type TermCode } from "@/lib/term";
import type { ReqCode } from "@/lib/types/catalog";
import { COURSE_CODE_PATTERN, normalizeCourseCode } from "@/lib/types/common";
import {
  ACTIVE_PLAN_STATUSES,
  LegacyPlanConversionSchema,
  PlanItemSchema,
  SummerActivitySchema,
  type LegacyPlanConversion,
  type PlanItem,
  type PlanStatus,
  type SummerActivity,
} from "@/lib/types/plan";

/**
 * The v1 → v2 plan conversion (PLAN §5 "Plan items" readLegacyPlan), in memory and deterministic. Pure apart from
 * the catalog lookup it is given, so the service (server/plan/legacy.ts) and scripts/migrate-plans.ts share it.
 *
 * v1 (hackathon) entries: { courseId, courseCode, courseName, credits (the old app wrote 4), semester
 * ("Fall" | "Spring" | "Summer"), year, status ("planned" | "in-progress" | "completed" | "dropped"), grade,
 * notes }. Rules:
 *   - semester + year → termCode (Fall Y → Y01, Spring Y → (Y−1)02); Summer → a summer activity (kind "course");
 *     a missing or implausible semester/year (the audit saw "Fall 1900") → skipped with the reason;
 *   - the code is normalised ("csc 121" → "CSC 121"); a string that is no course code at all ("ELEC ---",
 *     "HACK 1") → skipped;
 *   - title, credits and requirement codes come from the catalog for that term (else its nearest offering);
 *     a code the catalog does not know (an AI-invented "FAKE 999") keeps its v1 name, credits 1 (never the v1 4)
 *     and `unverified`;
 *   - the invented courseId is dropped; the v1 subdocument _id becomes the item id (so the student's first
 *     change can address it), unless missing or already used (the audit saw two rows with the same forced _id):
 *     then a deterministic id derived from the user and the entry's position;
 *   - no grades: completed + F/Fail → failed, completed + W → withdrawn, Pass/Fail grades → passFail;
 *   - exact duplicates (same term, same canonical code, both active — or the same inactive status) merge into the
 *     first, keeping the most advanced status, and are listed in `skipped`.
 */

export interface LegacyCourseFacts {
  courseCode: string;
  canonicalCode: string;
  title: string;
  credits: number;
  reqCodes: ReqCode[] | null;
}

/** Catalog facts for (term, code), or null when the catalog does not know the code. */
export type LegacyCatalogLookup = (
  termCode: TermCode,
  code: string,
) => Promise<LegacyCourseFacts | null>;

export interface LegacyDocument {
  plannedCourses?: unknown;
  summerActivities?: unknown;
  updatedAt?: unknown;
}

export const LEGACY_SKIP_REASONS = {
  badCode: "Not a Davidson course code",
  noTerm: "No valid semester and year",
  duplicate: "Duplicate entry (merged)",
  summerNoTitle: "Summer activity without a title",
  summerNoYear: "Summer activity without a valid year",
  invalid: "Could not be converted",
} as const;
export type LegacySkipReason = keyof typeof LEGACY_SKIP_REASONS;

/** Counts per category, for scripts/migrate-plans.ts's report. */
export interface LegacyConversionReport {
  entries: number;
  items: number;
  verified: number;
  unverified: number;
  /** Entries whose v1 credits differed from the converted credits (the old app's 4 per course). */
  creditsNormalized: number;
  failedFromGrade: number;
  withdrawnFromGrade: number;
  passFailFromGrade: number;
  /** Entries with a missing or unknown v1 status, converted as planned. */
  statusDefaulted: number;
  /** Items whose v1 _id was missing or already used and got a derived id. */
  idsDerived: number;
  summerCourses: number;
  summerActivities: number;
  skipped: Record<LegacySkipReason, number>;
}

export interface LegacyConversionResult {
  conversion: LegacyPlanConversion;
  report: LegacyConversionReport;
}

type Record_ = Record<string, unknown>;

function asRecords(value: unknown): Record_[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record_ => typeof entry === "object" && entry !== null)
    : [];
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().slice(0, max) : "";
}

/** A 24-hex id from an ObjectId, a hex string or {$oid}; null otherwise. */
function hexId(value: unknown): string | null {
  if (typeof value === "string") return /^[a-f0-9]{24}$/i.test(value) ? value.toLowerCase() : null;
  if (typeof value === "object" && value !== null) {
    const hex = (value as { toHexString?: () => string }).toHexString?.();
    if (typeof hex === "string" && /^[a-f0-9]{24}$/.test(hex)) return hex;
  }
  return null;
}

export function derivedLegacyId(userId: string, kind: string, index: number): string {
  return createHash("sha256").update(`${userId}:${kind}:${index}`).digest("hex").slice(0, 24);
}

/** Calendar years a v1 entry may plausibly name (the old UI offered 2025–2030; seniors started in 2023). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function year(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{4}$/.test(value.trim()) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

function season(value: unknown): "Fall" | "Spring" | "Summer" | null {
  const s = text(value, 20).toLowerCase();
  return s === "fall" ? "Fall" : s === "spring" ? "Spring" : s === "summer" ? "Summer" : null;
}

function termFor(seasonName: "Fall" | "Spring" | "Summer", y: number): TermCode | null {
  try {
    return termCodeFor(seasonName, y);
  } catch {
    return null;
  }
}

const STATUS_RANK: Readonly<Record<string, number>> = {
  planned: 0,
  registered: 1,
  "in-progress": 2,
  completed: 3,
};

const ACTIVE = new Set<string>(ACTIVE_PLAN_STATUSES);

interface StatusResult {
  status: PlanStatus;
  passFail: boolean;
  defaulted: boolean;
  fromGrade: "failed" | "withdrawn" | null;
}

function convertStatus(rawStatus: unknown, rawGrade: unknown): StatusResult {
  const status = text(rawStatus, 20).toLowerCase();
  const grade = text(rawGrade, 20).toUpperCase();
  const passFail = grade === "PASS" || grade === "P" || grade === "FAIL";
  const known = ["planned", "in-progress", "completed", "dropped"].includes(status);
  if (!known) return { status: "planned", passFail, defaulted: true, fromGrade: null };
  if (status === "completed") {
    if (grade === "F" || grade === "FAIL") {
      return { status: "failed", passFail, defaulted: false, fromGrade: "failed" };
    }
    if (grade === "W" || grade === "WITHDRAWN") {
      return { status: "withdrawn", passFail, defaulted: false, fromGrade: "withdrawn" };
    }
  }
  return { status: status as PlanStatus, passFail, defaulted: false, fromGrade: null };
}

function emptyReport(): LegacyConversionReport {
  return {
    entries: 0,
    items: 0,
    verified: 0,
    unverified: 0,
    creditsNormalized: 0,
    failedFromGrade: 0,
    withdrawnFromGrade: 0,
    passFailFromGrade: 0,
    statusDefaulted: 0,
    idsDerived: 0,
    summerCourses: 0,
    summerActivities: 0,
    skipped: {
      badCode: 0,
      noTerm: 0,
      duplicate: 0,
      summerNoTitle: 0,
      summerNoYear: 0,
      invalid: 0,
    },
  };
}

function isoOrNull(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** Convert one v1 document (see the module comment). Never writes anything. */
export async function convertLegacyPlan(
  doc: LegacyDocument,
  options: { userId: string; lookup: LegacyCatalogLookup },
): Promise<LegacyConversionResult> {
  const report = emptyReport();
  const skipped: LegacyPlanConversion["skipped"] = [];
  const skip = (reason: LegacySkipReason, label: string, detail?: string) => {
    report.skipped[reason] += 1;
    skipped.push({
      courseCode: label.slice(0, 60) || "(blank)",
      reason: detail ? `${LEGACY_SKIP_REASONS[reason]}: ${detail}` : LEGACY_SKIP_REASONS[reason],
    });
  };
  const usedIds = new Set<string>();
  const idFor = (raw: unknown, kind: string, index: number) => {
    const own = hexId(raw);
    if (own && !usedIds.has(own)) {
      usedIds.add(own);
      return own;
    }
    report.idsDerived += 1;
    let id = derivedLegacyId(options.userId, kind, index);
    for (let n = 1; usedIds.has(id); n += 1)
      id = derivedLegacyId(options.userId, `${kind}#${n}`, index);
    usedIds.add(id);
    return id;
  };

  const items: PlanItem[] = [];
  const byKey = new Map<string, PlanItem>();
  const summer: SummerActivity[] = [];
  const entries = asRecords(doc.plannedCourses);
  report.entries = entries.length;

  for (const [index, entry] of entries.entries()) {
    const rawCode = text(entry.courseCode, 40);
    const code = normalizeCourseCode(rawCode);
    const name = text(entry.courseName, 200);
    if (!COURSE_CODE_PATTERN.test(code)) {
      skip("badCode", rawCode || name);
      continue;
    }
    const seasonName = season(entry.semester);
    const y = year(entry.year);
    const termCode = seasonName && y !== null ? termFor(seasonName, y) : null;
    if (!seasonName || !termCode) {
      skip("noTerm", code, `${text(entry.semester, 20) || "?"} ${String(entry.year ?? "?")}`);
      continue;
    }
    const note = text(entry.notes, 500);
    if (seasonName === "Summer") {
      const activity = SummerActivitySchema.safeParse({
        id: idFor(entry._id, "summer-course", index),
        termCode,
        title: `${code}${name ? ` ${name}` : ""}`.slice(0, 120),
        kind: "course",
        ...(note ? { note } : {}),
      });
      if (activity.success) {
        summer.push(activity.data);
        report.summerCourses += 1;
      } else {
        skip("invalid", code);
      }
      continue;
    }

    const status = convertStatus(entry.status, entry.grade);
    const facts = await options.lookup(termCode, code);
    const credits = facts ? facts.credits : 1;
    const candidate = PlanItemSchema.safeParse({
      id: idFor(entry._id, "item", index),
      termCode,
      courseCode: facts?.courseCode ?? code,
      canonicalCode: facts?.canonicalCode ?? code,
      title: facts?.title ?? (name || code),
      credits,
      status: status.status,
      passFail: status.passFail,
      source: facts ? "catalog" : "manual",
      reqCodes: facts?.reqCodes ?? null,
      unverified: !facts,
      ...(note ? { note } : {}),
    });
    if (!candidate.success) {
      skip("invalid", code);
      continue;
    }
    const item = candidate.data;
    const active = ACTIVE.has(item.status);
    const key = `${item.termCode}|${item.canonicalCode}|${active ? "active" : item.status}`;
    const existing = byKey.get(key);
    if (existing) {
      if (active && (STATUS_RANK[item.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
        existing.status = item.status;
      }
      existing.passFail = existing.passFail || item.passFail;
      if (!existing.note && item.note) existing.note = item.note;
      skip("duplicate", code, `same as ${existing.courseCode} in ${termLabel(termCode)}`);
      continue;
    }
    byKey.set(key, item);
    items.push(item);
    report.items += 1;
    if (facts) report.verified += 1;
    else report.unverified += 1;
    if (typeof entry.credits !== "number" || entry.credits !== credits) {
      report.creditsNormalized += 1;
    }
    if (status.fromGrade === "failed") report.failedFromGrade += 1;
    if (status.fromGrade === "withdrawn") report.withdrawnFromGrade += 1;
    if (status.passFail) report.passFailFromGrade += 1;
    if (status.defaulted) report.statusDefaulted += 1;
  }

  for (const [index, entry] of asRecords(doc.summerActivities).entries()) {
    const title = text(entry.title, 120);
    if (!title) {
      skip("summerNoTitle", "(summer activity)");
      continue;
    }
    const fromText = /\b(\d{4})\b/.exec(text(entry.summer, 40))?.[1];
    const y = year(entry.year) ?? year(fromText);
    const termCode = y !== null ? termFor("Summer", y) : null;
    if (!termCode) {
      skip("summerNoYear", title);
      continue;
    }
    const note = text(entry.description, 500);
    const activity = SummerActivitySchema.safeParse({
      id: idFor(entry._id, "summer", index),
      termCode,
      title,
      kind: "other",
      ...(note ? { note } : {}),
    });
    if (activity.success) {
      summer.push(activity.data);
      report.summerActivities += 1;
    } else {
      skip("invalid", title);
    }
  }

  const conversion = LegacyPlanConversionSchema.parse({
    items,
    summer,
    skipped,
    sourceUpdatedAt: isoOrNull(doc.updatedAt),
  });
  return { conversion, report };
}

/** Add one report into a running total (scripts/migrate-plans.ts). */
export function addReports(
  total: LegacyConversionReport,
  next: LegacyConversionReport,
): LegacyConversionReport {
  const out = { ...total, skipped: { ...total.skipped } };
  for (const key of Object.keys(next) as (keyof LegacyConversionReport)[]) {
    if (key === "skipped") continue;
    out[key] = (total[key] as number) + (next[key] as number);
  }
  for (const reason of Object.keys(next.skipped) as LegacySkipReason[]) {
    out.skipped[reason] = total.skipped[reason] + next.skipped[reason];
  }
  return out;
}

export function emptyLegacyReport(): LegacyConversionReport {
  return emptyReport();
}
