import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { REQ_CODES } from "@/lib/types/catalog";
import { PLAN_STATUSES } from "@/lib/types/plan";

/**
 * The v2 plan, one document per user, collection `plans` (PLAN §4.1.4; owner W5s). Shapes mirror lib/types/plan.ts;
 * server/plan maps documents to those types (ids as strings, dates as ISO strings).
 *
 * Mutations must be atomic (PLAN §5 "Plan items"): add with `findOneAndUpdate` + `$not $elemMatch` on
 * (termCode, canonicalCode) among active items, remove with `$pull` by id, patch with a positional `$set` on
 * whitelisted fields. `sanitizeFilter` is on (server/db.ts): wrap intentional query operators in
 * `mongoose.trusted()`.
 *
 * `reqCodes` is absent (undefined) when there is no requirement data, which the service exposes as `null`.
 * `termCode` is null only for pre-matriculation credit (AP/transfer) without a term.
 *
 * Size bounds (server/plan/store.ts): at most MAX_PLAN_ITEMS items, MAX_SUMMER_ACTIVITIES summer entries,
 * MAX_DEADLINES deadlines, the newest MAX_DRAFTS drafts, one WebTree list per term; each enforced atomically in
 * the update filter (or with `$slice`), never by reading first.
 */

const PlanItemSubSchema = new Schema({
  termCode: { type: String, default: null },
  courseCode: { type: String, required: true },
  canonicalCode: { type: String, required: true },
  title: { type: String, required: true, maxlength: 200 },
  credits: { type: Number, required: true, min: 0, max: 4 },
  crn: { type: String },
  status: { type: String, enum: PLAN_STATUSES, required: true, default: "planned" },
  passFail: { type: Boolean, required: true, default: false },
  source: {
    type: String,
    enum: ["catalog", "manual", "transfer", "ap", "ai-draft"],
    required: true,
    default: "catalog",
  },
  reqCodes: { type: [{ type: String, enum: REQ_CODES }], default: undefined },
  unverified: { type: Boolean, required: true, default: false },
  note: { type: String, maxlength: 500 },
  addedAt: { type: Date, default: Date.now },
});

const SummerActivitySubSchema = new Schema({
  termCode: { type: String, required: true },
  title: { type: String, required: true, maxlength: 120 },
  kind: {
    type: String,
    enum: ["internship", "research", "course", "job", "study-abroad", "other"],
    required: true,
  },
  organization: { type: String, maxlength: 120 },
  note: { type: String, maxlength: 500 },
});

const StudentDeadlineSubSchema = new Schema({
  title: { type: String, required: true, maxlength: 120 },
  dueAt: { type: Date, required: true },
  courseCode: { type: String },
});

const WebTreeChoiceSubSchema = new Schema(
  {
    rank: { type: Number, required: true, min: 1, max: 20 },
    crn: { type: String, required: true },
    courseCode: { type: String, required: true },
    alternates: { type: [String], default: [] },
  },
  { _id: false },
);

const WebTreeListSubSchema = new Schema(
  {
    termCode: { type: String, required: true },
    choices: { type: [WebTreeChoiceSubSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const PlanDraftSubSchema = new Schema({
  kind: { type: String, enum: ["plan-suggestions", "career-plan"], required: true },
  promptVersion: { type: String, required: true },
  items: {
    type: [
      new Schema(
        {
          termCode: { type: String, required: true },
          courseCode: { type: String, required: true },
          reason: { type: String, required: true, maxlength: 400 },
          basis: { type: String, enum: ["scheduled", "past-offerings"] },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "dismissed"],
    required: true,
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

const PlanSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    /** Schema version of this document (legacy v1 lives in `courseplans`). */
    version: { type: Number, required: true, default: 2 },
    items: { type: [PlanItemSubSchema], default: [] },
    summer: { type: [SummerActivitySubSchema], default: [] },
    deadlines: { type: [StudentDeadlineSubSchema], default: [] },
    webtree: { type: [WebTreeListSubSchema], default: [] },
    drafts: { type: [PlanDraftSubSchema], default: [] },
    manual: {
      languageExempt: { type: Boolean, default: false },
      pe: {
        lifetimeActivities: { type: Number, default: 0, min: 0, max: 2 },
        teamSport: { type: Boolean, default: false },
      },
    },
    /**
     * Set when this v2 document was first written from the student's legacy v1 plan (server/plan: on the first
     * mutation, or scripts/migrate-plans.ts --apply). The v1 document itself is never touched.
     */
    importedFromLegacy: {
      type: new Schema(
        {
          at: { type: Date, required: true },
          /** The v1 document's updatedAt (null when it had none). */
          sourceUpdatedAt: { type: Date, default: null },
          /** "first-mutation" (lazy, server/plan) or "migration" (scripts/migrate-plans.ts). */
          via: { type: String, enum: ["first-mutation", "migration"], required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { collection: "plans", timestamps: true },
);

PlanSchema.index({ userId: 1 }, { unique: true });

export type PlanDoc = InferSchemaType<typeof PlanSchema>;
export type PlanDocument = HydratedDocument<PlanDoc>;

const Plan: Model<PlanDoc> =
  (mongoose.models.Plan as Model<PlanDoc> | undefined) ??
  mongoose.model<PlanDoc>("Plan", PlanSchema);

export default Plan;
