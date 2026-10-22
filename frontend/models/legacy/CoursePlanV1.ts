/**
 * READ-ONLY. NEVER WRITE — with ONE exception: account deletion erases the student's own documents
 * (`deleteMany` by userId, the "courseplans-legacy" built-in in server/account/erasers.ts). Nothing else inserts,
 * updates or deletes here.
 *
 * The hackathon (v1) course plan in the legacy `courseplans` collection. New code never writes it (PLAN §4 "New
 * data goes only to new collections"): the v2 plan lives in `plans` (models/Plan.ts), and server/plan's
 * `readLegacyPlan(userId)` converts a v1 document in memory until the student's first plan change. Keeping v1
 * untouched is what makes cutover migration-free and Vercel Instant Rollback safe.
 *
 * Deliberately: `strict: false` (read whatever old documents contain), no `ref` to the legacy Course model, no
 * hooks, no indexes created (autoIndex off), no timestamps handling on writes.
 */
import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const LegacyPlannedCourseSchema = new Schema(
  {
    courseId: { type: Schema.Types.ObjectId },
    courseCode: { type: String },
    courseName: { type: String },
    credits: { type: Number },
    semester: { type: String },
    year: { type: Number },
    status: { type: String },
    grade: { type: String },
    notes: { type: String },
  },
  { strict: false, _id: true },
);

const LegacySummerActivitySchema = new Schema(
  {
    title: { type: String },
    description: { type: String },
    summer: { type: String },
    year: { type: Number },
  },
  { strict: false, _id: true },
);

const CoursePlanV1Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId },
    plannedCourses: { type: [LegacyPlannedCourseSchema] },
    summerActivities: { type: [LegacySummerActivitySchema] },
    totalCreditsCompleted: { type: Number },
    totalCreditsPlanned: { type: Number },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { collection: "courseplans", strict: false, autoIndex: false, autoCreate: false },
);

export type CoursePlanV1Doc = InferSchemaType<typeof CoursePlanV1Schema>;

const CoursePlanV1: Model<CoursePlanV1Doc> =
  (mongoose.models.CoursePlanV1 as Model<CoursePlanV1Doc> | undefined) ??
  mongoose.model<CoursePlanV1Doc>("CoursePlanV1", CoursePlanV1Schema);

export default CoursePlanV1;
