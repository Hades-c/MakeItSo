import "server-only";
import mongoose from "mongoose";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import Plan from "@/models/Plan";
import { now } from "@/server/clock";
import { getDb } from "@/server/db";
import { isDuplicateKeyError } from "@/server/http/errors";
import { catalogLookup, findLegacyDocument } from "@/server/plan/legacy";
import {
  addReports,
  convertLegacyPlan,
  emptyLegacyReport,
  type LegacyCatalogLookup,
  type LegacyConversionReport,
} from "@/server/plan/legacy-core";
import { itemToDoc, summerToDoc } from "@/server/plan/store";

/**
 * The optional bulk v1 → v2 plan migration behind scripts/migrate-plans.ts (PLAN §8: the owner runs it; nothing
 * needs it, since plans are read lazily through readLegacyPlan and written on the first change). DRY RUN by
 * default: it converts every student's latest v1 document exactly as the lazy path does and reports per
 * category. With `apply`, it writes a v2 document for each student who has none ($setOnInsert + upsert: an
 * existing v2 plan is never overwritten). The legacy `courseplans` documents are only read.
 */

export interface MigrateOptions {
  apply: boolean;
  /** Only these students (24-hex ids). */
  userIds?: readonly string[];
  /** Stop after this many students. */
  limit?: number;
  /** Catalog facts (default: server/catalog through the service's strict lookup). */
  lookup?: LegacyCatalogLookup;
}

export interface MigrationReport {
  dryRun: boolean;
  /** When the run started (server clock). */
  startedAt: string;
  legacyDocuments: number;
  students: {
    /** Distinct students with a v1 document (within the filter and limit). */
    seen: number;
    /** v1 documents whose userId is no id at all. */
    withoutUserId: number;
    /** Students who already have a v2 plan (left alone). */
    alreadyV2: number;
    converted: number;
    /** v2 documents written (0 in a dry run). */
    written: number;
    failed: number;
  };
  /** Per-entry categories summed over every converted plan (server/plan/legacy-core.ts). */
  entries: LegacyConversionReport;
  failures: { userId: string; error: string }[];
}

function hexOf(value: unknown): string | null {
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) return value.toLowerCase();
  return null;
}

export async function migratePlans(options: MigrateOptions): Promise<MigrationReport> {
  await getDb();
  const startedAt = now();
  const report: MigrationReport = {
    dryRun: !options.apply,
    startedAt: startedAt.toISOString(),
    legacyDocuments: await CoursePlanV1.collection.countDocuments({}),
    students: { seen: 0, withoutUserId: 0, alreadyV2: 0, converted: 0, written: 0, failed: 0 },
    entries: emptyLegacyReport(),
    failures: [],
  };
  const lookup = options.lookup ?? catalogLookup({ strict: true });
  const owners = await CoursePlanV1.collection.distinct("userId");
  const ids = new Set<string>();
  for (const owner of owners) {
    const hex = hexOf(owner);
    if (hex) ids.add(hex);
  }
  report.students.withoutUserId = await CoursePlanV1.collection.countDocuments({
    $or: [{ userId: { $exists: false } }, { userId: null }],
  });
  const wanted = options.userIds ? new Set(options.userIds.map((id) => id.toLowerCase())) : null;
  const students = [...ids].filter((id) => !wanted || wanted.has(id)).sort();
  const selected = options.limit !== undefined ? students.slice(0, options.limit) : students;

  for (const userId of selected) {
    report.students.seen += 1;
    const oid = new mongoose.Types.ObjectId(userId);
    if (await Plan.exists({ userId: oid })) {
      report.students.alreadyV2 += 1;
      continue;
    }
    try {
      const doc = await findLegacyDocument(userId);
      if (!doc) continue;
      const { conversion, report: entries } = await convertLegacyPlan(doc, { userId, lookup });
      report.entries = addReports(report.entries, entries);
      report.students.converted += 1;
      if (!options.apply) continue;
      const at = now();
      const result = await Plan.updateOne(
        { userId: oid },
        {
          $setOnInsert: {
            version: 2,
            items: conversion.items.map((item) => itemToDoc(item, at)),
            summer: conversion.summer.map(summerToDoc),
            importedFromLegacy: {
              at,
              sourceUpdatedAt: conversion.sourceUpdatedAt
                ? new Date(conversion.sourceUpdatedAt)
                : null,
              via: "migration",
            },
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount === 1) report.students.written += 1;
      else report.students.alreadyV2 += 1;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // The student's own first change wrote v2 meanwhile: theirs wins.
        report.students.alreadyV2 += 1;
        continue;
      }
      report.students.failed += 1;
      report.failures.push({
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}
