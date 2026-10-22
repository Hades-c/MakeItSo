import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDb, type TestDb } from "../helpers/db";
import AiCache from "@/models/AiCache";
import AiUsage from "@/models/AiUsage";
import CatalogMeta from "@/models/CatalogMeta";
import CatalogSection from "@/models/CatalogSection";
import FeedItem from "@/models/FeedItem";
import CoursePlanV1 from "@/models/legacy/CoursePlanV1";
import Plan from "@/models/Plan";
import Program from "@/models/Program";
import RateLimit from "@/models/RateLimit";
import RmpTeacher from "@/models/RmpTeacher";
import SourceSync from "@/models/SourceSync";
import VerificationCode from "@/models/VerificationCode";
import { getDb } from "@/server/db";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb();
  await getDb();
});

afterAll(async () => {
  await testDb.stop();
});

type AnyModel = mongoose.Model<unknown>;

/** [name, model, collection, index keys that must exist ("!" = unique), TTL index key] */
const NEW_MODELS: [string, AnyModel, string, string[], string | null][] = [
  ["Plan", Plan as unknown as AnyModel, "plans", ["!userId"], null],
  [
    "CatalogSection",
    CatalogSection as unknown as AnyModel,
    "catalogsections",
    ["!termCode,crn", "canonicalCode,termCode"],
    null,
  ],
  ["CatalogMeta", CatalogMeta as unknown as AnyModel, "catalogmeta", ["!key"], null],
  ["Program", Program as unknown as AnyModel, "programs", ["!catalogId,acalogId"], null],
  [
    "RmpTeacher",
    RmpTeacher as unknown as AnyModel,
    "rmpteachers",
    ["!legacyId", "!rmpId", "normalizedLast,normalizedFirst"],
    null,
  ],
  [
    "FeedItem",
    FeedItem as unknown as AnyModel,
    "feeditems",
    ["!source,externalId", "startsAt,source"],
    "expiresAt",
  ],
  ["SourceSync", SourceSync as unknown as AnyModel, "sourcesyncs", ["!sourceId"], null],
  [
    "AiCache",
    AiCache as unknown as AnyModel,
    "aicache_v2",
    ["!feature,scope,userId,key", "userId"],
    "expiresAt",
  ],
  ["AiUsage", AiUsage as unknown as AnyModel, "aiusages", ["!day,userId,feature"], "expiresAt"],
  ["RateLimit", RateLimit as unknown as AnyModel, "ratelimits", ["!key,windowStart"], "expiresAt"],
  [
    "VerificationCode",
    VerificationCode as unknown as AnyModel,
    "verificationcodes",
    ["!userId,purpose"],
    "expiresAt",
  ],
];

describe("new collections (PLAN §4)", () => {
  it.each(NEW_MODELS)("%s → %s", async (_name, model, collection, keys, ttl) => {
    expect(model.collection.collectionName).toBe(collection);
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    const described = indexes.map(
      (index) => `${index.unique ? "!" : ""}${Object.keys(index.key).join(",")}`,
    );
    for (const key of keys) expect(described).toContain(key);
    if (ttl) {
      const ttlIndex = indexes.find((index) => Object.keys(index.key).join(",") === ttl);
      expect(ttlIndex?.expireAfterSeconds).toBe(0);
    }
  });

  it("uses timestamps where documents change over time", () => {
    for (const model of [
      Plan,
      CatalogSection,
      CatalogMeta,
      Program,
      FeedItem,
      SourceSync,
      AiCache,
    ] as unknown as AnyModel[]) {
      expect(model.schema.path("createdAt")).toBeDefined();
      expect(model.schema.path("updatedAt")).toBeDefined();
    }
  });

  it("stores a v2 plan, leaving requirement data absent when unknown", async () => {
    const userId = new mongoose.Types.ObjectId();
    const plan = await Plan.create({
      userId,
      items: [
        {
          termCode: "202602",
          courseCode: "CSC 221",
          canonicalCode: "CSC 221",
          title: "Data Structures",
          credits: 1,
        },
      ],
    });
    const stored = await Plan.findById(plan._id).lean();
    expect(stored?.version).toBe(2);
    expect(stored?.items[0]?.status).toBe("planned");
    expect(stored?.items[0]?.reqCodes).toBeUndefined();
    await expect(Plan.create({ userId })).rejects.toMatchObject({ code: 11000 });
  });
});

describe("legacy CoursePlanV1 (read-only)", () => {
  it("maps the legacy courseplans collection with no ref, hooks or indexes", () => {
    expect(CoursePlanV1.collection.collectionName).toBe("courseplans");
    expect(CoursePlanV1.schema.get("strict")).toBe(false);
    expect(CoursePlanV1.schema.get("autoIndex")).toBe(false);
    expect(CoursePlanV1.schema.indexes()).toEqual([]);
    const planned = CoursePlanV1.schema.path("plannedCourses") as unknown as {
      schema: mongoose.Schema;
    };
    expect(planned.schema.path("courseId").options.ref).toBeUndefined();
    // Same middleware as a bare compiled schema, i.e. only what mongoose's global plugins add.
    const hookNames = (schema: mongoose.Schema) =>
      [
        ...(
          schema as unknown as { s: { hooks: { _pres: Map<string, { fn: { name: string } }[]> } } }
        ).s.hooks._pres.entries(),
      ]
        .flatMap(([event, hooks]) => hooks.map((hook) => `${event}:${hook.fn.name}`))
        .sort();
    const control = mongoose.model(
      "NoHooksControl",
      new mongoose.Schema({}, { strict: false, collection: "nohookscontrol" }),
    );
    expect(hookNames(CoursePlanV1.schema)).toEqual(hookNames(control.schema));
  });

  it("reads a hackathon document back completely", async () => {
    const userId = new mongoose.Types.ObjectId();
    await CoursePlanV1.collection.insertOne({
      userId,
      plannedCourses: [
        { courseCode: "CSC 121", semester: "Fall", year: 2025, status: "completed", grade: "A" },
      ],
      inventedField: "kept",
    });
    const legacy = await CoursePlanV1.findOne({ userId }).lean();
    expect(legacy?.plannedCourses?.[0]?.courseCode).toBe("CSC 121");
    expect((legacy as Record<string, unknown> | null)?.inventedField).toBe("kept");
  });
});
