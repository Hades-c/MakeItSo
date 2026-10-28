import mongoose, {
  type HydratedDocument,
  type InferSchemaType,
  type Model,
  Schema,
} from "mongoose";
import { MOODLE_PROBLEMS } from "@/lib/moodle";

/**
 * A student's Moodle calendar connection (/syllabi), one document per student, collection `moodleconnections`.
 * `feedUrl` is the calendar export URL Moodle gave them, ENCRYPTED (server/moodle/crypto.ts, AES-256-GCM): it
 * carries their Moodle authtoken, so it is never logged and never sent back to the browser. The deadlines a sync
 * imports live in the plan (models/Plan.ts deadlines, origin "moodle"), not here. Written only by server/moodle.
 */

const MoodleConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    /** "v1.<keyId>.<iv>.<tag>.<ciphertext>": never the plain URL. */
    feedUrl: { type: String, required: true, maxlength: 2_000 },
    connectedAt: { type: Date, required: true },
    /** The last sync attempt, successful or not (what the 6-hour lazy sync is timed from). */
    lastAttemptAt: { type: Date, default: null },
    /** The last successful sync ("Connected · last synced <time>"). */
    lastSyncedAt: { type: Date, default: null },
    /** Why the last attempt failed; null when it worked. */
    problem: { type: String, enum: [...MOODLE_PROBLEMS, null], default: null },
    /** Moodle deadlines in the plan after the last successful sync, and events left out for lack of room. */
    imported: { type: Number, default: 0 },
    capped: { type: Number, default: 0 },
    /** One sync at a time per student: taken with an atomic update, released when the sync ends. */
    syncLeaseUntil: { type: Date, default: null },
  },
  { collection: "moodleconnections", timestamps: true },
);

MoodleConnectionSchema.index({ userId: 1 }, { unique: true });

export type MoodleConnectionDoc = InferSchemaType<typeof MoodleConnectionSchema>;
export type MoodleConnectionDocument = HydratedDocument<MoodleConnectionDoc>;

const MoodleConnection: Model<MoodleConnectionDoc> =
  (mongoose.models.MoodleConnection as Model<MoodleConnectionDoc> | undefined) ??
  mongoose.model<MoodleConnectionDoc>("MoodleConnection", MoodleConnectionSchema);

export default MoodleConnection;
